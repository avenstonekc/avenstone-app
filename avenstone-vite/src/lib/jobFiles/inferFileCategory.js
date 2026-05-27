/**
 * UNIFIED_FILES_ARC Phase 1 — Rule-based + phase-based file categorizer.
 *
 * Vision-Haiku AI categorization is deferred to Phase 2 (needs edge function deploy).
 * Phase 1 uses:
 *   1. Explicit fileTypeHint from upload UI (highest priority)
 *   2. uploadSource context (receipt, co, floor_plan, etc.)
 *   3. MIME type rule (non-image → Documents default)
 *   4. Current in-progress job phase → subcategory (for entity-linked uploads)
 *   5. Default: Photos / Uncategorized
 *
 * @param {Object}   args
 * @param {File}     args.file            - the uploaded file object
 * @param {string}   args.jobId           - job this upload belongs to
 * @param {string}   [args.uploadSource]  - 'schedule_item'|'daily_log'|'co_condition'|
 *                                          'co_fix'|'receipt'|'floor_plan'|'consultation'|'manual'
 * @param {string}   [args.fileTypeHint]  - hint from UI: 'permit'|'plan'|'contract'|etc.
 * @param {Function} [args.queryFn]       - async (sql, params) => rows — injected by sbUploadJobFile
 *                                          to avoid circular import with supabase.js.
 *                                          Signature: queryFn({ jobId }) => { phase_name? }
 * @param {Function} [args.visionFn]      - async ({ file, jobId }) => { category, subcategory, confidence, source }
 *                                          Calls ai-categorize-file edge function. Injected by supabase.js.
 * @returns {Promise<{ category: string, subcategory: string|null, confidence: number, source: string }>}
 *   source: 'rule' | 'phase' | 'vision' | 'vision_lowconf' | 'default'
 */

const RULE_BASED = {
  permit:      { category: 'Documents',       subcategory: 'Permits' },
  plan:        { category: 'Documents',       subcategory: 'Plans' },
  contract:    { category: 'Communications',  subcategory: 'Contracts' },
  agreement:   { category: 'Communications',  subcategory: 'Contracts' },
  invoice:     { category: 'Receipts',        subcategory: null },
  receipt:     { category: 'Receipts',        subcategory: null },
  spec:        { category: 'Documents',       subcategory: 'Specs' },
  inspection:  { category: 'Documents',       subcategory: 'Inspections' },
  proposal:    { category: 'Documents',       subcategory: null },
};

// Maps job_phases.phase_name → Photos subcategory
const PHASE_TO_SUBCATEGORY = {
  'Demo / Tear-out':              'Demo',
  'Demo':                         'Demo',
  'Framing / Rough Structure':    'Framing',
  'Framing':                      'Framing',
  'Plumbing - Rough':             'Plumbing',
  'Plumbing - Rough-in':          'Plumbing',
  'Plumbing - Finish / fixtures': 'Plumbing',
  'Electrical - Rough':           'Electrical',
  'Electrical - Rough-in':        'Electrical',
  'Electrical - Finish':          'Electrical',
  'HVAC - Rough':                 'HVAC',
  'HVAC - Finish':                'HVAC',
  'HVAC-Install':                 'HVAC',
  'Drywall / Insulation':         'Drywall',
  'Drywall-Hang':                 'Drywall',
  'Drywall':                      'Drywall',
  'Tile - Floor':                 'Tile',
  'Tile - Wall / shower':         'Tile',
  'Tile':                         'Tile',
  'Cabinets / vanities - Install':'Cabinets',
  'Cabinets':                     'Cabinets',
  'Paint / Finish':               'Paint',
  'Paint-Interior':               'Paint',
  'Paint':                        'Paint',
  'Trim / Finish carpentry':      'Trim/Finish',
  'Trim':                         'Trim/Finish',
  'Flooring':                     'Flooring',
  'Roofing':                      'Roofing',
  'Final inspection / Punch list':'Final',
  'Final':                        'Final',
};

export async function inferFileCategory({
  file,
  jobId,
  uploadSource = 'manual',
  fileTypeHint = null,
  queryFn = null,
  visionFn = null,
}) {
  // ── 1. Explicit file type hint from upload UI ──────────────────────────────
  if (fileTypeHint) {
    const mapped = RULE_BASED[fileTypeHint.toLowerCase()];
    if (mapped) return { ...mapped, confidence: 1.0, source: 'rule' };
  }

  // ── 2. Upload source dictates category ────────────────────────────────────
  if (uploadSource === 'receipt') {
    return { category: 'Receipts', subcategory: null, confidence: 1.0, source: 'rule' };
  }
  if (uploadSource === 'co_condition') {
    return { category: 'Change Orders', subcategory: 'Condition', confidence: 1.0, source: 'rule' };
  }
  if (uploadSource === 'co_fix') {
    return { category: 'Change Orders', subcategory: 'Fix', confidence: 1.0, source: 'rule' };
  }
  if (uploadSource === 'floor_plan') {
    return { category: 'Floor Plans', subcategory: null, confidence: 1.0, source: 'rule' };
  }
  if (uploadSource === 'consultation') {
    // Consultation photos go to Photos — try phase lookup below
  }

  // ── 3. Non-image files default to Documents ───────────────────────────────
  const isImage = file?.type?.startsWith('image/');
  if (!isImage) {
    // PDF filename pattern heuristics
    if (file?.name) {
      const lower = file.name.toLowerCase();
      if (lower.includes('permit'))   return { category: 'Documents', subcategory: 'Permits',   confidence: 0.8, source: 'rule' };
      if (lower.includes('contract')) return { category: 'Communications', subcategory: 'Contracts', confidence: 0.75, source: 'rule' };
      if (lower.includes('invoice') || lower.includes('receipt')) return { category: 'Receipts', subcategory: null, confidence: 0.75, source: 'rule' };
      if (lower.includes('plan') || lower.includes('blueprint')) return { category: 'Documents', subcategory: 'Plans', confidence: 0.7, source: 'rule' };
    }
    return { category: 'Documents', subcategory: null, confidence: 0.6, source: 'default' };
  }

  // ── 4. Image + entity context → look up current job phase ────────────────
  const entitySources = ['daily_log', 'schedule_item', 'consultation'];
  if (entitySources.includes(uploadSource) && jobId && queryFn) {
    try {
      const phaseName = await queryFn({ jobId });
      if (phaseName) {
        const subcat = PHASE_TO_SUBCATEGORY[phaseName];
        if (subcat) {
          return { category: 'Photos', subcategory: subcat, confidence: 0.85, source: 'phase' };
        }
      }
    } catch {
      // fall through — non-fatal
    }
  }

  // ── 5. Image with no context → Vision-Haiku AI categorization ───────────
  if (visionFn && file) {
    try {
      const result = await visionFn({ file, jobId });
      if (result && result.category) {
        const src = result.source || (result.confidence >= 0.80 ? 'vision' : 'vision_lowconf');
        return {
          category: result.category,
          subcategory: result.subcategory ?? null, // AI suggestion; caller checks source for low-conf
          confidence: typeof result.confidence === 'number' ? result.confidence : 0,
          source: src,
        };
      }
    } catch {
      // Vision failure is non-fatal — fall through to default
    }
  }

  // ── 6. Default: Photos / Uncategorized ────────────────────────────────────
  return { category: 'Photos', subcategory: null, confidence: 0.3, source: 'default' };
}
