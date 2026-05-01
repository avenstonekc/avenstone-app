/**
 * Step 4 verification — runs acceptTakeoffDraft against the live DB
 * as test-salesrep, then queries result counts.
 *
 * Run: node scripts/verify-step4.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = 'https://cbfftukmhqvvjlrlnltk.supabase.co';
const ANON_KEY      = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQ2ODgsImV4cCI6MjA5MTE5MDY4OH0.isj52drLT3pj7BF94Wa9w_y_f8U1M3W5AcgWsRaTwBQ';
const JOB_ID        = 'b2d3648c-1c9f-4168-8eb5-eb15eaed5efa';
const AV_TENANT     = '00000000-0000-0000-0000-000000000001';

const sb = createClient(SUPABASE_URL, ANON_KEY);

// ── Inline buildTakeoffDraft dependencies ─────────────────────────────────────

function computePerimeter(room) {
  if (room.wallSegments?.length > 0)
    return room.wallSegments.reduce((s, seg) => s + Math.sqrt((seg.x2-seg.x1)**2 + (seg.z2-seg.z1)**2), 0);
  return 2 * ((room.width||0) + (room.length||0));
}

function quantitySource(trade, unit) {
  if (/Drywall/.test(trade))                              return 'wallSf';
  if (/Paint - Interior/.test(trade))                    return 'wallSf';
  if (/Paint - Exterior/.test(trade))                    return 'wallSf';
  if (/Tile - Wall|Tile.*[Ss]hower/.test(trade))         return 'wallSf';
  if (/Tile - Backsplash/.test(trade))                   return null;
  if (/Tile - Floor/.test(trade))                        return 'areaSf';
  if (/Flooring/.test(trade))                            return 'areaSf';
  if (/Demo/.test(trade))                                return 'areaSf_noWaste';
  if (/Framing/.test(trade))                             return 'areaSf';
  if (/Insulation/.test(trade))                          return 'wallSf';
  if (/[Bb]ase.*[Cc]ase|carpentry.*[Bb]ase/.test(trade)) return 'lf';
  if (/Crown/.test(trade))                               return 'lf';
  if (unit === 'lump')                                   return 'lump';
  if (unit === 'each')                                   return 'each';
  return null;
}

function buildQuantity({ trade, unit, areaSf, wallAreaSf, perimeterLf, wastePct }) {
  const src = quantitySource(trade, unit);
  const w = wastePct || 0;
  if (src === 'areaSf')        return { quantity: Math.round(areaSf*(1+w/100)*100)/100, quantityPreFilled: areaSf>0 };
  if (src === 'areaSf_noWaste') return { quantity: Math.round(areaSf*100)/100, quantityPreFilled: areaSf>0 };
  if (src === 'wallSf')        return { quantity: Math.round(wallAreaSf*(1+w/100)*100)/100, quantityPreFilled: wallAreaSf>0 };
  if (src === 'lf')            return { quantity: Math.round(perimeterLf*100)/100, quantityPreFilled: perimeterLf>0 };
  if (src === 'lump')          return { quantity: 1, quantityPreFilled: true };
  return { quantity: null, quantityPreFilled: false };
}

function resolveMultiplier(floor, multipliers) {
  if (!multipliers || !Object.keys(multipliers).length) return 1.0;
  if (floor === -1) return multipliers.basement    ?? 1.0;
  if (floor === 0)  return multipliers.first_floor ?? 1.0;
  return               multipliers.second_floor ?? 1.0;
}

function evaluateFormula(formula, metrics, matRow) {
  if (formula.qty_basis === 'fixed') return Number(formula.fixed_qty||0);
  const basisVal = metrics[formula.qty_basis];
  if (!basisVal) return 0;
  const multiplier = Number(formula.qty_multiplier||1);
  const wasteFactor = 1 + (Number(matRow.waste_pct||0)/100);
  let qty = basisVal * multiplier * wasteFactor;
  if (formula.qty_divisor === 'coverage_sf') {
    const cov = Number(matRow.coverage_sf||0);
    if (cov > 0) qty = qty / cov;
  }
  return qty;
}

function roomMetrics(room) {
  const floorSf  = Number(room.areaSf||0);
  const perimLf  = Number(room.perimeterLf||0);
  const wallH    = Number(room.height||8);
  return {
    floor_sf: floorSf, ceiling_sf: floorSf,
    wall_sf: Number(room.wallAreaSf||(perimLf*wallH)),
    perimeter_lf: perimLf, wall_height: wallH,
    door_count: Number(room.doors||0), window_count: Number(room.windows||0), room_count: 1,
  };
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function signIn() {
  const { data, error } = await sb.auth.signInWithPassword({
    email: 'test-salesrep@avenstonekc.com',
    password: 'TestSalesRep2026!',
  });
  if (error) throw new Error(`Auth failed: ${error.message}`);
  console.log(`✓ Signed in as ${data.user.email} (${data.user.id})`);
  return data.user.id;
}

// ── Build draft ───────────────────────────────────────────────────────────────

async function buildDraft(userId) {
  // Scans
  const { data: scans } = await sb.from('job_lidar_scans')
    .select('id, rooms, height_meters, capture_mode')
    .eq('job_id', JOB_ID).order('created_at', { ascending: false }).limit(5);

  const allRooms = [];
  for (const scan of (scans||[])) {
    const scanCeilingFt = scan.height_meters ? scan.height_meters * 3.28084 : null;
    (scan.rooms||[]).forEach((room, idx) => {
      const ceilingFt   = room.height ?? scanCeilingFt ?? 8;
      const perimeterLf = computePerimeter(room);
      allRooms.push({
        roomId: `${scan.id}_${idx}`, roomLabel: room.name || `Room ${idx+1}`,
        floor: 0, captureMode: scan.capture_mode ?? null,
        areaSf: room.sqft ?? 0,
        wallAreaSf: Math.round(perimeterLf * ceilingFt * 100)/100,
        perimeterLf: Math.round(perimeterLf * 100)/100,
        height: ceilingFt, doors: room.doors ?? 0, windows: room.windows ?? 0,
      });
    });
  }

  const rooms = allRooms.filter(r => (r.roomLabel||'').toLowerCase().includes('bath'));
  console.log(`✓ Found ${rooms.length} bathroom room(s) from ${(scans||[]).length} scan(s)`);
  if (!rooms.length) throw new Error('No bathroom rooms found');

  // Templates
  const { data: templates } = await sb.from('takeoff_templates')
    .select('trade, scope_definition').eq('room_type', 'bathroom').eq('active', true)
    .or(`tenant_id.is.null,tenant_id.eq.${AV_TENANT}`);

  const tradeDefs = (templates||[]).map(t => ({
    trade: t.trade,
    summary: t.scope_definition?.summary ?? null,
    optional: t.scope_definition?.optional ?? false,
    materialsFormula: t.scope_definition?.materials_formula ?? null,
  }));

  // Unit costs
  const { data: costRows } = await sb.from('takeoff_unit_costs')
    .select('*').eq('room_type', 'bathroom').eq('active', true)
    .or(`tenant_id.is.null,tenant_id.eq.${AV_TENANT}`);

  const laborCostMap = {}, materialRateMap = {};
  for (const row of (costRows||[])) {
    if (row.category === 'materials') {
      const key = `${row.trade}::${row.material_name}`;
      const prev = materialRateMap[key];
      if (!prev) {
        materialRateMap[key] = row;
      } else if (row.tenant_id !== null && prev.tenant_id === null) {
        materialRateMap[key] = { ...prev, base_rate: row.base_rate, tenant_id: row.tenant_id, id: row.id };
      }
    } else {
      const prev = laborCostMap[row.trade];
      if (!prev) {
        laborCostMap[row.trade] = row;
      } else if (row.tenant_id !== null && prev.tenant_id === null) {
        laborCostMap[row.trade] = { ...prev, base_rate: row.base_rate, tenant_id: row.tenant_id, id: row.id };
      }
    }
  }

  // Waste map
  const { data: tax } = await sb.from('trade_taxonomy').select('parent_trade, sub_trade, default_waste_pct');
  const wasteMap = {};
  for (const r of (tax||[])) {
    const k = r.sub_trade ? `${r.parent_trade} - ${r.sub_trade}` : r.parent_trade;
    wasteMap[k] = r.default_waste_pct ?? 0;
  }
  const getWastePct = t => {
    if (wasteMap[t] !== undefined) return wasteMap[t];
    const prefix = t.split(' - ')[0];
    const hit = Object.keys(wasteMap).find(k => k.startsWith(prefix));
    return hit ? wasteMap[hit] : 0;
  };

  // Build lines
  const lines = [];
  for (const room of rooms) {
    for (const def of tradeDefs) {
      const costRow = laborCostMap[def.trade];
      const baseRate = costRow?.base_rate != null ? Number(costRow.base_rate) : null;
      const unit = costRow?.unit ?? 'lump';
      const multiplier = resolveMultiplier(room.floor, costRow?.multipliers ?? {});
      const wastePct = getWastePct(def.trade);
      const { quantity, quantityPreFilled } = buildQuantity({ trade: def.trade, unit, areaSf: room.areaSf, wallAreaSf: room.wallAreaSf, perimeterLf: room.perimeterLf, wastePct });
      const lineCost = (baseRate != null && quantity != null) ? Math.round(baseRate*quantity*multiplier*100)/100 : null;
      lines.push({
        roomId: room.roomId, trade: def.trade, category: 'labor',
        templateNotes: def.summary, optional: def.optional,
        unit, unitCostId: costRow?.id ?? null,
        unitCostSource: costRow ? (costRow.tenant_id !== null ? 'tenant_override' : 'platform_default') : null,
        baseRate, baseRateMissing: baseRate == null,
        multiplier, wastePct, quantity, quantityPreFilled, lineCost,
      });
      if (def.materialsFormula?.length) {
        const metrics = roomMetrics(room);
        for (const formula of def.materialsFormula) {
          const matKey = `${def.trade}::${formula.material_name}`;
          const matRow = materialRateMap[matKey];
          const matRate = matRow?.base_rate != null ? Number(matRow.base_rate) : null;
          const matUnit = matRow?.unit ?? 'each';
          let matQty = null;
          if (matRow) { const raw = evaluateFormula(formula, metrics, matRow); matQty = Math.round(raw*100)/100; }
          const matLineCost = (matRate != null && matQty != null) ? Math.round(matRate*matQty*100)/100 : null;
          lines.push({
            roomId: room.roomId, trade: def.trade, category: 'materials',
            materialName: formula.material_name, templateNotes: def.summary, optional: def.optional,
            unit: matUnit, unitCostId: matRow?.id ?? null,
            unitCostSource: matRow ? (matRow.tenant_id !== null ? 'tenant_override' : 'platform_default') : null,
            baseRate: matRate, baseRateMissing: matRate == null,
            multiplier: 1, wastePct: matRow?.waste_pct != null ? Number(matRow.waste_pct) : 0,
            quantity: matQty, quantityPreFilled: matQty != null, lineCost: matLineCost,
          });
        }
      }
    }
  }

  const laborLines    = lines.filter(l => l.category === 'labor');
  const materialLines = lines.filter(l => l.category === 'materials');
  const laborSubtotal = Math.round(laborLines.reduce((s,l) => s+(l.lineCost??0), 0)*100)/100;
  const matSubtotal   = Math.round(materialLines.reduce((s,l) => s+(l.lineCost??0), 0)*100)/100;
  console.log(`✓ Draft built: ${laborLines.length} labor, ${materialLines.length} material lines`);
  console.log(`  Labor subtotal: $${laborSubtotal}  Materials subtotal: $${matSubtotal}  Total: $${Math.round((laborSubtotal+matSubtotal)*100)/100}`);

  return { jobId: JOB_ID, roomType: 'bathroom', rooms, lines, summary: { laborSubtotal, materialSubtotal: matSubtotal } };
}

// ── Accept draft ──────────────────────────────────────────────────────────────

async function acceptDraft(draft, userId) {
  // 1. Upsert job_estimates
  const { data: estRow } = await sb.from('job_estimates')
    .upsert({ job_id: draft.jobId, tenant_id: AV_TENANT, messages: [], updated_at: new Date().toISOString() }, { onConflict: 'job_id' })
    .select().single();
  const jobEstimateId = estRow?.id ?? null;
  console.log(`✓ job_estimates row: ${jobEstimateId}`);

  // 2. No edits in this verification run
  const edits = {};
  const lineKey = l => `${l.roomId}__${l.trade}__${l.materialName||''}`;
  const resolvedLines = draft.lines.map(l => {
    const e = edits[lineKey(l)] || {};
    return { ...l, resolvedQty: e.quantity ?? l.quantity, resolvedRate: e.baseRate ?? l.baseRate, rateEdited: false };
  });

  // 3. Scoped delete
  const { error: delErr } = await sb.from('estimate_line_items')
    .delete().eq('job_id', draft.jobId).like('notes', 'takeoff:%');
  if (delErr) console.error('Delete error:', delErr);
  else console.log('✓ Scoped delete OK');

  // 4. Build rows
  const rows = resolvedLines.map((line, i) => {
    const qty    = line.resolvedQty  ?? 1;
    const rate   = line.resolvedRate ?? 0;
    const noRate = line.resolvedRate == null;
    const noteBase = line.category === 'materials'
      ? `takeoff:${draft.roomType}:${line.roomId}:${line.trade}`
      : `takeoff:${draft.roomType}:${line.roomId}`;
    return {
      tenant_id:    AV_TENANT,
      job_id:       draft.jobId,
      estimate_id:  jobEstimateId,
      phase:        line.trade,
      category:     line.category,
      trade:        line.trade,
      description:  line.category === 'materials' ? (line.materialName ?? line.trade) : (line.templateNotes ?? line.trade),
      quantity:     qty,
      unit:         line.unit ?? null,
      unit_cost:    rate,
      markup_pct:   0,
      display_order: i,
      notes:        noRate ? `${noteBase} PENDING RATE` : noteBase,
      created_by:   userId,
    };
  });

  // 5. Insert
  const { error: insErr } = await sb.from('estimate_line_items').insert(rows);
  if (insErr) throw new Error(`Insert failed: ${insErr.message}`);
  console.log(`✓ Inserted ${rows.length} line items`);

  // 6. Resolve todos
  if (jobEstimateId) await sb.from('todos').update({ status: 'done', completed_at: new Date().toISOString() }).eq('source_table', 'job_estimates').eq('source_id', jobEstimateId).eq('status', 'pending');
  await sb.from('todos').update({ status: 'done', completed_at: new Date().toISOString() }).eq('source_table', 'jobs').eq('source_id', draft.jobId).eq('status', 'pending');
  console.log('✓ Todos resolved');

  return { jobEstimateId, lineItemCount: rows.length };
}

// ── Verify ────────────────────────────────────────────────────────────────────

async function verify() {
  const { data } = await sb.from('estimate_line_items')
    .select('category, unit_cost, total_cost')
    .eq('job_id', JOB_ID)
    .like('notes', 'takeoff:%');

  const labor     = (data||[]).filter(r => r.category === 'labor');
  const materials = (data||[]).filter(r => r.category === 'materials');
  const pending   = (data||[]).filter(r => r.unit_cost == 0);
  const laborSub  = Math.round(labor.reduce((s,r) => s+Number(r.total_cost||0), 0)*100)/100;
  const matSub    = Math.round(materials.reduce((s,r) => s+Number(r.total_cost||0), 0)*100)/100;

  console.log('\n── DB Verification ───────────────────────────────────────');
  console.log(`  Labor rows:       ${labor.length}     subtotal: $${laborSub}`);
  console.log(`  Material rows:    ${materials.length}     subtotal: $${matSub}`);
  console.log(`  Total rows:       ${(data||[]).length}     total:    $${Math.round((laborSub+matSub)*100)/100}`);
  console.log(`  PENDING RATE rows: ${pending.length}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const userId = await signIn();
const draft  = await buildDraft(userId);
await acceptDraft(draft, userId);
await verify();
console.log('\n✓ Step 4 verification complete');
