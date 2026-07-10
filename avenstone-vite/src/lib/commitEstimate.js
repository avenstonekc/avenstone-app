/**
 * NormalizedEstimateInput — the canonical input shape for sbCommitEstimate.
 *
 * ESTIMATE_FLOW_ARC — Slices 1–4b (2026-06-02). All four write paths (takeoff,
 * consultation, AI estimator, manual editor) are now on this helper.
 * sbSaveEstimateLineItems has been removed.
 *
 * Design principles:
 *
 * category — REQUIRED, caller resolves. Never hardcode 'labor' or 'materials'.
 *   Each path must determine the correct value from its own data before calling.
 *   source='manual' additionally allows 'equipment', 'sub', 'permit', 'other'
 *   (the manual editor exposes these to the user; no DB CHECK on the column).
 *
 * multiplier — REQUIRED, no default. Caller must supply even if 1.0.
 *   Floor premium (basement 1.30 / second-floor 1.15) is ONLY derivable from
 *   LiDAR scan geometry (room.floor integer in normalized_geometry). Consultation
 *   and AI estimator paths have no floor geometry and pass multiplier=1.0
 *   deliberately — not because 1.0 is a default, but because they cannot compute
 *   a more accurate value. Upgrade path: use the takeoff wizard, which reads
 *   room.floor from normalized_geometry. If floor premium is ever needed outside
 *   the takeoff wizard, floor level must be added to consultation_measurements
 *   or the AI extraction schema before that caller can pass a non-1.0 value.
 *   sbCommitEstimate rejects any item where multiplier is missing or non-numeric
 *   so the limitation is a visible compile-time decision, never a silent default.
 *
 * markup_pct — ALWAYS committed as 0. Markup is a proposal-time concern, applied
 *   once from a single rate source (ESTIMATE_FLOW_ARC Slice 5). Baking it into
 *   line items at commit time causes "what we bid" vs "what we bill" drift.
 *   sbCommitEstimate forces 0 regardless of what any caller passes.
 *
 * notes format for source='takeoff' MUST match acceptTakeoffDraft exactly:
 *   labor  → 'takeoff:<roomType>:<roomId>'
 *   materials → 'takeoff:<roomType>:<roomId>:<trade>'
 *   custom → 'takeoff:custom:<roomType>:<roomId>'
 *   + optional ' PENDING RATE' suffix when base rate was null.
 *   This is the delete-isolation key: acceptTakeoffDraft (and sbCommitEstimate
 *   for source='takeoff') deletes WHERE notes LIKE 'takeoff:%' before insert.
 *   Non-takeoff sources do NOT touch takeoff rows.
 *
 * @typedef {Object} NormalizedEstimateInput
 * @property {'takeoff'|'ai'|'consultation'|'plan_upload'|'manual'} source
 * @property {string}       trade
 * @property {'labor'|'materials'|'equipment'|'sub'|'permit'|'other'} category — REQUIRED, caller resolves
 * @property {string|null}  [phase]            — optional; defaults to trade when absent
 * @property {string}       description
 * @property {number}       quantity
 * @property {string|null}  unit
 * @property {number}       unit_cost
 * @property {number}       multiplier         — REQUIRED, no default (see above)
 * @property {number}       markup_pct         — always committed as 0
 * @property {string|null}  notes              — takeoff: structured prefix; others: null
 * @property {number|null}  waste_pct          — informational, not stored
 */

const VALID_SOURCES    = ['takeoff', 'ai', 'consultation', 'plan_upload', 'manual'];
// 'equipment'/'sub'/'permit'/'other' are manual-editor categories; no DB CHECK on estimate_line_items.category
const VALID_CATEGORIES = ['labor', 'materials', 'equipment', 'sub', 'permit', 'other'];

/**
 * Commit normalized estimate line items to estimate_line_items.
 *
 * Accepts supabase client, tenantId, and userId as explicit parameters to avoid
 * circular-import issues when this module is imported alongside other src/lib helpers.
 *
 * source='takeoff': scoped-deletes rows WHERE notes LIKE 'takeoff:%' before insert,
 *   preserving the exact isolation used by acceptTakeoffDraft. Notes format is
 *   identical so takeoff re-runs started via either path produce the same isolation key.
 * source='ai': scoped-deletes rows WHERE notes LIKE 'ai:%' before insert (re-commit
 *   replaces rather than stacks). AI rows are tagged 'ai:<qty_label>' in notes at
 *   insert time so they can be reliably targeted. Manual (null notes), consultation
 *   (null notes), and takeoff ('takeoff:%' notes) rows are unaffected.
 * All other sources: inserted without touching existing rows.
 *
 * markup_pct is forced to 0 on every row. A console.warn fires if a caller passes
 * a non-zero value — this surfaces the contract violation without hard-failing.
 *
 * multiplier MUST be a number. Missing or non-numeric multiplier is a hard reject
 * with a descriptive error naming the item index and the reason. See typedef above.
 *
 * @param {Object}  supabase    — initialized Supabase JS v2 client
 * @param {string}  tenantId    — AV_TENANT constant
 * @param {string}  userId      — AV_USER_ID constant
 * @param {Object}  opts
 * @param {'takeoff'|'ai'|'consultation'|'plan_upload'} opts.source
 * @param {string}  opts.jobId
 * @param {string|null} opts.estimateId
 * @param {NormalizedEstimateInput[]} opts.items
 * @returns {Promise<{ok:boolean, error:string|null, data:{inserted_count:number, line_item_ids:string[]}|null}>}
 */
export async function sbCommitEstimate(supabase, tenantId, userId, { source, jobId, estimateId, items }) {
  // ── Top-level guards ──────────────────────────────────────────────────────────
  if (!VALID_SOURCES.includes(source)) {
    return {
      ok: false,
      error: `Invalid source: "${source}". Must be one of: ${VALID_SOURCES.join(', ')}`,
      data: null,
    };
  }
  if (!jobId) {
    return { ok: false, error: 'jobId is required', data: null };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'items must be a non-empty array', data: null };
  }

  // ── Per-item validation ───────────────────────────────────────────────────────
  for (let i = 0; i < items.length; i++) {
    const it = items[i];

    if (!VALID_CATEGORIES.includes(it.category)) {
      return {
        ok: false,
        error: `Item[${i}]: category must be 'labor' or 'materials', got: "${it.category}". ` +
               `Caller must resolve category from its own data — never hardcode.`,
        data: null,
      };
    }

    if (it.multiplier === undefined || it.multiplier === null ||
        typeof it.multiplier !== 'number' || isNaN(it.multiplier)) {
      return {
        ok: false,
        error: `Item[${i}] (trade="${it.trade}"): multiplier is required and must be a number. ` +
               `No floor geometry available outside the takeoff path — pass 1.0 deliberately; ` +
               `floor premium requires the takeoff wizard. ` +
               `Got: ${JSON.stringify(it.multiplier)}`,
        data: null,
      };
    }

    if (typeof it.quantity !== 'number' || isNaN(it.quantity)) {
      return {
        ok: false,
        error: `Item[${i}] (trade="${it.trade}"): quantity must be a number, got: ${JSON.stringify(it.quantity)}`,
        data: null,
      };
    }

    if (typeof it.unit_cost !== 'number' || isNaN(it.unit_cost)) {
      return {
        ok: false,
        error: `Item[${i}] (trade="${it.trade}"): unit_cost must be a number, got: ${JSON.stringify(it.unit_cost)}`,
        data: null,
      };
    }
  }

  try {
    // ── Takeoff source: scoped delete (mirrors acceptTakeoffDraft exactly) ───────
    if (source === 'takeoff') {
      const { error: delErr } = await supabase
        .from('estimate_line_items')
        .delete()
        .eq('job_id', jobId)
        .like('notes', 'takeoff:%');
      if (delErr) {
        return { ok: false, error: `Failed to clear existing takeoff rows: ${delErr.message}`, data: null };
      }
    }

    // ── AI source: scoped delete — re-commit replaces, not stacks ────────────────
    // AI rows are tagged 'ai:<qty_label>' in notes. Manual rows have null notes;
    // consultation rows have null notes; takeoff rows use 'takeoff:%'. None match here.
    if (source === 'ai') {
      const { error: delErr } = await supabase
        .from('estimate_line_items')
        .delete()
        .eq('job_id', jobId)
        .like('notes', 'ai:%');
      if (delErr) {
        return { ok: false, error: `Failed to clear existing AI rows: ${delErr.message}`, data: null };
      }
    }

    // ── Build row payloads ────────────────────────────────────────────────────────
    const rows = items.map((it, i) => {
      if (it.markup_pct !== undefined && it.markup_pct !== null && it.markup_pct !== 0) {
        // Warn and zero — markup is a proposal-time concern, not a line-item attribute.
        console.warn(
          `sbCommitEstimate: item[${i}] (trade="${it.trade}") passed markup_pct=${it.markup_pct}; ` +
          `forcing to 0. Markup is applied at proposal time (Slice 5), not at line-item commit.`
        );
      }

      return {
        tenant_id:     tenantId,
        job_id:        jobId,
        estimate_id:   estimateId ?? null,
        phase:         it.phase ?? it.trade,
        category:      it.category,
        trade:         it.trade,
        description:   it.description,
        quantity:      it.quantity,
        unit:          it.unit ?? null,
        unit_cost:     it.unit_cost,
        multiplier:    it.multiplier,
        markup_pct:    0,
        display_order: i,
        // AI rows are prefixed 'ai:' so they can be scoped-deleted on re-commit.
        // All other sources use the caller-provided value (null for consultation/manual,
        // 'takeoff:...' for takeoff — handled by the takeoff delete block above).
        notes:         source === 'ai' ? 'ai:' + (it.notes || '') : (it.notes ?? null),
        source_label:  it.source_label ?? null,
        rate_provenance: it.rate_provenance ?? null, // S9: gap-rate provenance (null on non-gap lines)
        created_by:    userId,
      };
    });

    // ── Insert ────────────────────────────────────────────────────────────────────
    const { data, error: insErr } = await supabase
      .from('estimate_line_items')
      .insert(rows)
      .select('id');

    if (insErr) {
      return { ok: false, error: insErr.message, data: null };
    }

    return {
      ok: true,
      error: null,
      data: {
        inserted_count: data.length,
        line_item_ids:  data.map(r => r.id),
      },
    };
  } catch (e) {
    return { ok: false, error: e.message || 'sbCommitEstimate failed', data: null };
  }
}
