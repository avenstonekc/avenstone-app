import { useState, useEffect, useMemo } from 'react';
import { AV_TENANT, sbLoadTakeoffCatalog, sbSaveTenantUnitCostOverride, sbSetUnitCostVetted, sbDeleteTenantUnitCostOverride } from '../../lib/supabase';
import { Ic, isMob } from '../../lib/utils';

// ─── Rate Book (T2#4 S2b + POLISH) ────────────────────────────────────────────
// Edits takeoff_unit_costs — the table the deterministic engine reads — NOT rate_book_*.
// ONE row per (trade, category, material_name), collapsed across room types (rates are
// room-agnostic). Editing writes a tenant override with room_type = null (all rooms).
// Live-rate resolution mirrors pricingCore.js buildCostMaps rank — see sbLoadTakeoffCatalog.
// POLISH: labor/materials filter + search (findability), Enter-to-save-and-advance +
// in-place update (chaining ~50 entries), compact mobile provenance badge.

const fmtItem = s => (s || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
const fmtRoom = s => (s || '').replace(/_/g, ' ');
const fmtRate = n => {
  if (n == null) return '—';
  const num = Number(n);
  return num % 1 === 0 ? `$${num.toLocaleString()}` : `$${num.toFixed(2)}`;
};

// rank mirrors buildCostMaps: tenant+room(3) > tenant+all(2) > platform+room(1) > platform+all(0)
const rankOf = r => (r.tenant_id != null ? 2 : 0) + (r.room_type != null ? 1 : 0);

// Collapse catalog rows to one entry per (trade, category, material_name).
function collapse(rows) {
  const groups = {};
  for (const r of rows) {
    const key = `${r.trade}|||${r.category}|||${r.material_name ?? ''}`;
    (groups[key] ||= { key, trade: r.trade, category: r.category, material_name: r.material_name ?? null, rows: [] }).rows.push(r);
  }
  return Object.values(groups).map(g => {
    const tenant   = g.rows.filter(r => r.tenant_id != null);
    const platform = g.rows.filter(r => r.tenant_id == null);
    const tenantAll  = tenant.find(r => r.room_type == null) || null;                 // rank 2
    const tenantRoom = tenant.filter(r => r.room_type != null).sort((a, b) => (a.room_type || '').localeCompare(b.room_type || '')); // rank 3 each
    const platRates  = [...new Set(platform.map(r => r.base_rate).filter(v => v != null).map(Number))].sort((a, b) => a - b);
    const units      = [...new Set(g.rows.map(r => r.unit).filter(Boolean))];
    const vetTarget  = tenantAll || tenantRoom[0] || null; // the row the vetted toggle acts on
    return {
      ...g, tenant, platform, tenantAll, tenantRoom, platRates, units, vetTarget,
      unvetted: tenant.filter(r => !r.vetted).length,
      hasTenant: tenant.length > 0,
    };
  });
}

// What rate the engine would use, + its provenance, for the collapsed row.
// labelShort is the compact form for narrow viewports (avoids the 3-line badge wrap).
function provenance(g) {
  if (g.tenantAll) {
    return { rate: Number(g.tenantAll.base_rate), unit: g.tenantAll.unit, label: 'Your rate — all rooms', labelShort: 'Your rate', tone: 'mine' };
  }
  if (g.tenantRoom.length) {
    const rates = [...new Set(g.tenantRoom.map(r => Number(r.base_rate)))];
    const rooms = g.tenantRoom.map(r => fmtRoom(r.room_type)).join(', ');
    return { rate: rates.length === 1 ? rates[0] : null, unit: g.tenantRoom[0].unit, label: `Your rate — ${rooms} only`, labelShort: `Your — ${rooms}`, tone: 'partial' };
  }
  if (!g.platRates.length) return { rate: null, unit: g.units[0] ?? null, label: 'No default — rep must enter', labelShort: 'No default', tone: 'none' };
  if (g.platRates.length === 1) return { rate: g.platRates[0], unit: g.units[0] ?? null, label: 'Platform default', labelShort: 'Default', tone: 'default' };
  const lo = g.platRates[0], hi = g.platRates[g.platRates.length - 1];
  return { rate: null, unit: null, label: `Platform default — $${lo}–$${hi} across ${g.platform.length} room types`, labelShort: `Default $${lo}–$${hi}`, tone: 'varies' };
}

const TONE = {
  mine:    { bg: 'var(--green-bg)',   fg: 'var(--green-text)' },
  partial: { bg: 'var(--amber-bg)',   fg: 'var(--amber-text-strong)' },
  default: { bg: 'var(--neutral-bg)', fg: 'var(--text-secondary)' },
  varies:  { bg: 'var(--neutral-bg)', fg: 'var(--text-secondary)' },
  none:    { bg: 'var(--red-bg)',     fg: 'var(--red-text)' },
};

// ─── One collapsed row ────────────────────────────────────────────────────────
function CatalogRow({ g, isMobile, edit, setEdit, busy, err, onSave, onSaveAdvance, onVetted, onUseEverywhere, last }) {
  const prov = provenance(g);
  const inEdit = edit != null;
  const unitVaries = g.units.length > 1;
  const name = g.material_name ? fmtItem(g.material_name) : 'Base labor';

  return (
    <div style={{
      borderBottom: last ? 'none' : '1px solid var(--bg-alt)',
      padding: isMobile ? '10px 14px' : '10px 18px',
      background: g.hasTenant && g.unvetted > 0 ? 'var(--surface)' : 'var(--card-bg)',
      display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: isMobile ? 'wrap' : 'nowrap',
    }}>
      {/* Item + provenance */}
      <div style={{ flex: isMobile ? '1 1 100%' : '1 1 240px', minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: isMobile ? 'nowrap' : 'wrap', overflow: 'hidden' }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-subtle)', background: 'var(--neutral-bg)', padding: '2px 7px', borderRadius: 'var(--r-full)', flex: '0 0 auto' }}>{g.category}</span>
          {g.units.length === 1 && <span style={{ fontSize: 10, color: 'var(--text-subtle)', flex: '0 0 auto' }}>/ {g.units[0]}</span>}
          {unitVaries && !isMobile && <span style={{ fontSize: 10, color: 'var(--text-subtle)' }}>unit varies: {g.units.join(', ')}</span>}
          <span className="badge" title={prov.label} style={{ background: TONE[prov.tone].bg, color: TONE[prov.tone].fg, fontSize: 9, padding: '2px 7px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: isMobile ? 180 : 'none' }}>
            {isMobile ? prov.labelShort : prov.label}
          </span>
        </div>
        {/* Footgun: room-specific tenant override(s) exist */}
        {g.tenantRoom.length > 0 && (
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="badge" style={{ background: 'var(--amber-bg)', color: 'var(--amber-text-strong)', border: '1px solid var(--amber-border)', fontSize: 9, padding: '2px 7px' }}>
              <span style={{ width: 11, height: 11, display: 'inline-flex' }}>{Ic.warn}</span>
              {g.tenantRoom.map(r => fmtRoom(r.room_type)).join(', ')} use a room-specific rate{g.tenantAll ? ' that shadows your all-rooms rate' : ''}
            </span>
            <button onClick={() => onUseEverywhere(g)} disabled={busy} className="btn btn-ghost" style={{ fontSize: 10, padding: '3px 9px', minHeight: 28, color: 'var(--navy-900)', border: '1px solid var(--amber-border)' }}>
              {g.tenantAll ? 'Use my all-rooms rate everywhere' : 'Remove room-specific override'}
            </button>
          </div>
        )}
      </div>

      {/* Rate display / edit */}
      <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        {inEdit ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>$</span>
            <input
              id={`rbrate-${g.key}`}
              type="number" step="0.01" autoFocus value={edit.rate}
              onChange={e => setEdit({ ...edit, rate: e.target.value })}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); onSaveAdvance(g); }
                else if (e.key === 'Escape') { e.preventDefault(); setEdit(null); }
              }}
              style={{ width: 80, padding: '5px 8px', border: '1.5px solid var(--gold-500)', borderRadius: 'var(--r-xs)', fontSize: 16, fontFamily: 'var(--font-body)', outline: 'none', color: 'var(--text-primary)' }}
            />
            {unitVaries ? (
              <select value={edit.unit} onChange={e => setEdit({ ...edit, unit: e.target.value })}
                style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 'var(--r-xs)', fontSize: 16, fontFamily: 'var(--font-body)', color: 'var(--text-primary)', background: 'var(--bg)' }}>
                {g.units.map(u => <option key={u} value={u}>/ {u}</option>)}
              </select>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>/ {edit.unit || 'unit'}</span>
            )}
            <button onClick={() => onSave(g)} disabled={busy} className="btn btn-navy" style={{ padding: '5px 12px', fontSize: 11 }}>{busy ? '…' : 'Save'}</button>
            <button onClick={() => setEdit(null)} className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 11 }}>✕</button>
          </div>
        ) : (
          <button
            onClick={() => setEdit({ rate: prov.rate != null ? String(prov.rate) : '', unit: prov.unit || g.units[0] || '' })}
            style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: 'var(--r-xs)', padding: '5px 10px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}
            title="Type your all-rooms rate"
          >
            {prov.rate != null ? fmtRate(prov.rate) : 'Set rate'}
            {prov.rate != null && prov.unit && <span style={{ fontSize: 10, color: 'var(--text-subtle)', marginLeft: 4 }}>/{prov.unit}</span>}
          </button>
        )}
      </div>

      {/* Vetted toggle — only when a tenant (rep-entered) row exists */}
      <div style={{ flex: '0 0 auto', marginLeft: 'auto' }}>
        {g.vetTarget ? (
          <button
            onClick={() => onVetted(g)} disabled={busy}
            style={{
              border: 'none', cursor: 'pointer', borderRadius: 'var(--r-full)', padding: '5px 12px', fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-body)',
              background: g.unvetted === 0 ? 'var(--green-bg)' : 'var(--amber-bg)',
              color: g.unvetted === 0 ? 'var(--green-text)' : 'var(--amber-text-strong)', whiteSpace: 'nowrap',
            }}
            title={g.unvetted === 0 ? 'Mark as needs review' : 'Mark as reviewed'}
          >
            {g.unvetted === 0 ? '✓ Reviewed' : 'Needs Review'}
          </button>
        ) : (
          <span style={{ fontSize: 10, color: 'var(--text-subtle)', padding: '5px 4px' }}>inherited</span>
        )}
      </div>

      {err && <div style={{ flex: '1 1 100%', fontSize: 11, color: 'var(--red-text)', marginTop: 4 }}>{err}</div>}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function RateBookScr({ profile }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [openTrades, setOpenTrades] = useState(new Set());
  const [edits, setEdits] = useState({});   // keyed by group key
  const [busy, setBusy] = useState(new Set());
  const [rowErr, setRowErr] = useState({});
  const [catFilter, setCatFilter] = useState('all'); // all | labor | materials
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    const res = await sbLoadTakeoffCatalog(AV_TENANT);
    if (!res.ok) { setErr(res.error); setLoading(false); return; }
    setRows(res.data);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const groups = useMemo(() => collapse(rows), [rows]);

  // Labor/Materials filter + search — the findability levers (fix 1 + 2).
  const visibleGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter(g => {
      if (catFilter !== 'all' && g.category !== catFilter) return false;
      if (q) {
        const name = (g.material_name || 'base labor').toLowerCase();
        if (!g.trade.toLowerCase().includes(q) && !name.includes(q)) return false;
      }
      return true;
    });
  }, [groups, catFilter, search]);

  const trades = useMemo(() => [...new Set(visibleGroups.map(g => g.trade))].sort(), [visibleGroups]);
  const byTrade = useMemo(() => trades.reduce((a, t) => {
    a[t] = visibleGroups.filter(g => g.trade === t).sort((x, y) =>
      (x.category).localeCompare(y.category) || (x.material_name || '').localeCompare(y.material_name || ''));
    return a;
  }, {}), [visibleGroups, trades]);

  // Ordered flat list of visible group keys → drives Enter-to-advance (fix 3).
  const flatKeys = useMemo(() => trades.flatMap(t => byTrade[t].map(g => g.key)), [trades, byTrade]);
  const groupByKey = useMemo(() => Object.fromEntries(visibleGroups.map(g => [g.key, g])), [visibleGroups]);

  // Review counter — global over rep-entered (tenant) rows only; platform defaults are curated.
  // (The walk's 0/3 vs 0/7 was test rows being created mid-walk, not a bug — denominator is
  // the live count of tenant rows.)
  const tenantRowCount = rows.filter(r => r.tenant_id != null).length;
  const tenantVetted   = rows.filter(r => r.tenant_id != null && r.vetted).length;

  useEffect(() => { if (!openTrades.size && trades.length) setOpenTrades(new Set(trades)); }, [trades]); // eslint-disable-line

  const toggleTrade = t => setOpenTrades(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; });
  const setBusyKey = (k, on) => setBusy(prev => { const n = new Set(prev); on ? n.add(k) : n.delete(k); return n; });
  const setEditKey = (key, v) => setEdits(p => { const n = { ...p }; if (v == null) delete n[key]; else n[key] = v; return n; });

  // In-place local update (fix 4) — replace the group's all-rooms tenant row in state, no refetch.
  const applyLocal = (g, rate, unit, id, vetted) => {
    setRows(prev => {
      const isMatch = r => r.tenant_id != null && r.room_type == null && r.trade === g.trade && r.category === g.category && (r.material_name ?? null) === (g.material_name ?? null);
      return [...prev.filter(r => !isMatch(r)), {
        id, tenant_id: AV_TENANT, room_type: null, trade: g.trade, category: g.category,
        material_name: g.material_name ?? null, unit, base_rate: rate, coverage_sf: null,
        waste_pct: 0, multipliers: {}, active: true, vetted,
      }];
    });
  };

  // Core save: writes an ALL-ROOMS tenant override, updates local state in place. Returns bool.
  const doSave = async (g) => {
    const ed = edits[g.key];
    const rate = parseFloat(ed?.rate);
    if (!rate || isNaN(rate) || rate <= 0) { setRowErr(p => ({ ...p, [g.key]: 'Enter a positive rate' })); return false; }
    const unit = ed.unit || g.units[0] || null;
    const keepVetted = g.tenantAll?.vetted ?? false; // edit preserves existing vetted; new rows start false
    setBusyKey(g.key, true); setRowErr(p => ({ ...p, [g.key]: undefined }));
    const res = await sbSaveTenantUnitCostOverride({
      tenantId: AV_TENANT, roomType: null, trade: g.trade, materialName: g.material_name,
      category: g.category, unit, baseRate: rate, sourceUnitCostId: null,
    });
    setBusyKey(g.key, false);
    if (res.error) { setRowErr(p => ({ ...p, [g.key]: res.error.message || String(res.error) })); return false; }
    setEditKey(g.key, null);
    applyLocal(g, rate, unit, res.id, keepVetted);
    return true;
  };

  const saveRate = (g) => doSave(g);

  // Enter → save this row, open the next visible row's editor, focus it (fix 3).
  const saveAndAdvance = async (g) => {
    const ok = await doSave(g);
    if (!ok) return;
    const idx = flatKeys.indexOf(g.key);
    const nextKey = idx >= 0 ? flatKeys[idx + 1] : null;
    if (!nextKey) return;
    const next = groupByKey[nextKey];
    if (!next) return;
    setOpenTrades(prev => prev.has(next.trade) ? prev : new Set(prev).add(next.trade));
    const p = provenance(next);
    setEditKey(nextKey, { rate: p.rate != null ? String(p.rate) : '', unit: p.unit || next.units[0] || '' });
    requestAnimationFrame(() => { const el = document.getElementById(`rbrate-${nextKey}`); if (el) { el.focus(); el.select?.(); } });
  };

  const toggleVetted = async (g) => {
    if (!g.vetTarget) return;
    setBusyKey(g.key, true);
    const target = g.vetTarget, next = g.unvetted !== 0;
    const res = await sbSetUnitCostVetted(target.id, next);
    setBusyKey(g.key, false);
    if (!res.ok) { setRowErr(p => ({ ...p, [g.key]: res.error })); return; }
    setRows(prev => prev.map(r => r.id === target.id ? { ...r, vetted: next } : r)); // in-place
  };

  const useEverywhere = async (g) => {
    if (!g.tenantRoom.length) return;
    const rooms = g.tenantRoom.map(r => fmtRoom(r.room_type)).join(', ');
    const msg = g.tenantAll
      ? `Remove the room-specific rate(s) for ${rooms} so your all-rooms rate applies everywhere?`
      : `Remove the ${rooms} room-specific rate(s)? These will fall back to the platform default until you set an all-rooms rate.`;
    if (!window.confirm(msg)) return;
    setBusyKey(g.key, true);
    const removed = [];
    for (const r of g.tenantRoom) {
      const res = await sbDeleteTenantUnitCostOverride(r.id);
      if (!res.ok) { setRowErr(p => ({ ...p, [g.key]: res.error })); setBusyKey(g.key, false); setRows(prev => prev.filter(x => !removed.includes(x.id))); return; }
      removed.push(r.id);
    }
    setBusyKey(g.key, false);
    setRows(prev => prev.filter(r => !removed.includes(r.id))); // in-place
  };

  const mob = isMob();
  const FILTERS = [['all', 'All'], ['labor', 'Labor'], ['materials', 'Materials']];

  return (
    <div style={{ padding: mob ? 14 : 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: mob ? 22 : 28, color: 'var(--text-primary)', margin: 0 }}>Rate Book</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>Your prices for the estimator. Type a rate once — it applies to every room. Green = yours, grey = an inherited default.</p>
        </div>
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '10px 16px', minWidth: 170 }}>
          <div style={{ fontSize: 11, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>Your rates reviewed</div>
          {tenantRowCount === 0 ? (
            <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>No custom rates yet</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: tenantVetted === tenantRowCount ? 'var(--green-text)' : 'var(--text-primary)' }}>{tenantVetted}</span>
                <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>/ {tenantRowCount}</span>
              </div>
              <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: 'var(--bg-alt)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${tenantRowCount ? (tenantVetted / tenantRowCount) * 100 : 0}%`, background: tenantVetted === tenantRowCount ? 'var(--green-dot)' : 'var(--gold-500)', borderRadius: 2, transition: 'width 0.3s' }} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Filter + search bar (fix 1 + 2) */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 2, background: 'var(--bg-alt)', borderRadius: 'var(--r-full)', padding: 3 }}>
          {FILTERS.map(([id, lb]) => (
            <button key={id} onClick={() => setCatFilter(id)} style={{
              border: 'none', cursor: 'pointer', borderRadius: 'var(--r-full)', padding: '6px 16px', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-body)',
              background: catFilter === id ? 'var(--card-bg)' : 'transparent',
              color: catFilter === id ? 'var(--navy-900)' : 'var(--text-muted)',
              boxShadow: catFilter === id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', minHeight: 36,
            }}>{lb}</button>
          ))}
        </div>
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 360 }}>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search trade or item…"
            style={{ width: '100%', padding: '8px 30px 8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 16, fontFamily: 'var(--font-body)', outline: 'none', color: 'var(--text-primary)', background: 'var(--card-bg)', boxSizing: 'border-box' }}
          />
          {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-subtle)', fontSize: 14 }}>✕</button>}
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{visibleGroups.length} row{visibleGroups.length !== 1 ? 's' : ''}</span>
      </div>

      {err && <div style={{ padding: '12px 16px', background: 'var(--red-bg)', color: 'var(--red-text)', borderRadius: 'var(--r-sm)', marginBottom: 16, fontSize: 13 }}>{err}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-subtle)', fontSize: 14 }}>Loading rate book…</div>
      ) : trades.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-subtle)', fontSize: 14 }}>No rows match this filter.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {trades.map(trade => {
            const tgroups = byTrade[trade];
            const isOpen = openTrades.has(trade);
            const unvetted = tgroups.reduce((s, g) => s + g.unvetted, 0);
            const anyTenant = tgroups.some(g => g.hasTenant);
            return (
              <div key={trade} className="card" style={{ overflow: 'hidden' }}>
                <div onClick={() => toggleTrade(trade)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', cursor: 'pointer', background: isOpen ? 'var(--surface)' : 'var(--card-bg)', userSelect: 'none', borderBottom: isOpen ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ width: 16, height: 16, display: 'flex', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>{Ic.chev}</span>
                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', flex: 1 }}>{trade}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{tgroups.length} item{tgroups.length !== 1 ? 's' : ''}</span>
                  {unvetted > 0 ? (
                    <span className="badge" style={{ background: 'var(--amber-bg)', color: 'var(--amber-text-strong)', fontSize: 10 }}>{unvetted} to review</span>
                  ) : anyTenant ? (
                    <span className="badge" style={{ background: 'var(--green-bg)', color: 'var(--green-text)', fontSize: 10 }}><span className="bdot" style={{ background: 'var(--green-dot)' }} />Reviewed</span>
                  ) : null}
                </div>
                {isOpen && (
                  <div>
                    {tgroups.map((g, i) => (
                      <CatalogRow
                        key={g.key} g={g} isMobile={mob} last={i === tgroups.length - 1}
                        edit={edits[g.key] ?? null} setEdit={v => setEditKey(g.key, v)}
                        busy={busy.has(g.key)} err={rowErr[g.key]}
                        onSave={saveRate} onSaveAdvance={saveAndAdvance} onVetted={toggleVetted} onUseEverywhere={useEverywhere}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
