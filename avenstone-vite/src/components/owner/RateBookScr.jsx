import { useState, useEffect } from 'react';
import { sbLoadRateBookLabor, sbLoadRateBookMaterial, sbUpdateRateBookLabor, sbUpdateRateBookMaterial } from '../../lib/supabase';
import { Ic, isMob } from '../../lib/utils';

// ─── Module-level helpers ────────────────────────────────────────────────────

const fmtItem = s => s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

const fmtRate = n => {
  if (n == null) return '—';
  const num = Number(n);
  return num % 1 === 0 ? `$${num.toLocaleString()}` : `$${num.toFixed(2)}`;
};

// ─── LaborTab ────────────────────────────────────────────────────────────────

function LaborTab({ trades, byTrade, openTrades, toggleTrade, rowEdits, saving, saveErr, handleVettedToggle, startEdit, cancelEdit, saveRate, setRowEdits, isMobile }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {trades.map(trade => {
        const rows = byTrade[trade];
        const isOpen = openTrades.has(trade);
        const unvetted = rows.filter(r => !r.vetted).length;
        const isTradeMismatch = trade === 'Windows / doors';

        return (
          <div key={trade} className="card" style={{ overflow: 'hidden' }}>
            {/* Section header */}
            <div
              onClick={() => toggleTrade(trade)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', cursor: 'pointer', background: isOpen ? 'var(--surface)' : 'var(--card-bg)', userSelect: 'none', borderBottom: isOpen ? '1px solid var(--border)' : 'none' }}
            >
              <span style={{ width: 16, height: 16, display: 'flex', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>{Ic.chev}</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', flex: 1 }}>{trade}</span>
              <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{rows.length} rates</span>
              {unvetted > 0 && (
                <span className="badge" style={{ background: 'var(--amber-bg)', color: 'var(--amber-text-strong)', fontSize: 10 }}>
                  {unvetted} to review
                </span>
              )}
              {unvetted === 0 && (
                <span className="badge" style={{ background: 'var(--green-bg)', color: 'var(--green-text)', fontSize: 10 }}>
                  <span className="bdot" style={{ background: 'var(--green-dot)' }} />
                  All reviewed
                </span>
              )}
              {isTradeMismatch && (
                <span className="badge" style={{ background: 'var(--red-bg)', color: 'var(--red-text)', fontSize: 10 }}>
                  <span style={{ width: 12, height: 12, display: 'inline-flex' }}>{Ic.warn}</span>
                  Trade unmatched
                </span>
              )}
            </div>

            {/* Rows */}
            {isOpen && (
              <div>
                {rows.map((row, idx) => {
                  const inEdit = !!rowEdits[row.id];
                  const isSaving = saving.has(row.id);
                  const rowErr = saveErr[row.id];
                  const hasSplit = row.rate_data?.needs_split === true;

                  return (
                    <div key={row.id} style={{
                      borderBottom: idx < rows.length - 1 ? '1px solid var(--bg-alt)' : 'none',
                      padding: isMobile ? '12px 16px' : '10px 18px',
                      background: row.vetted ? 'var(--card-bg)' : 'var(--surface)',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      flexWrap: isMobile ? 'wrap' : 'nowrap',
                    }}>
                      {/* Line item name */}
                      <div style={{ flex: isMobile ? '1 1 100%' : '1 1 200px', minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {fmtItem(row.line_item)}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-subtle)', background: 'var(--neutral-bg)', padding: '2px 7px', borderRadius: 'var(--r-full)' }}>{row.unit}</span>
                          {hasSplit && (
                            <span className="badge" style={{ background: 'var(--amber-bg)', color: 'var(--amber-text-strong)', border: '1px solid var(--amber-border)', fontSize: 9, padding: '2px 7px' }}>L+M combined</span>
                          )}
                          {row.trade === 'Windows / doors' && (
                            <span className="badge" style={{ background: 'var(--red-bg)', color: 'var(--red-text)', fontSize: 9, padding: '2px 7px' }}>⚠ trade unmatched</span>
                          )}
                        </div>
                        {row.notes && <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 4, lineHeight: 1.4 }}>{row.notes}</div>}
                      </div>

                      {/* Rate display or edit */}
                      <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                        {inEdit ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>$</span>
                              <input
                                type="number"
                                step="0.01"
                                value={rowEdits[row.id].rate_low}
                                onChange={e => setRowEdits(prev => ({ ...prev, [row.id]: { ...prev[row.id], rate_low: e.target.value } }))}
                                style={{ width: 75, padding: '5px 8px', border: '1.5px solid var(--gold-500)', borderRadius: 'var(--r-xs)', fontSize: 16, fontFamily: 'var(--font-body)', outline: 'none', color: 'var(--text-primary)' }}
                              />
                            </div>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>–</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>$</span>
                              <input
                                type="number"
                                step="0.01"
                                value={rowEdits[row.id].rate_high}
                                onChange={e => setRowEdits(prev => ({ ...prev, [row.id]: { ...prev[row.id], rate_high: e.target.value } }))}
                                style={{ width: 75, padding: '5px 8px', border: '1.5px solid var(--border)', borderRadius: 'var(--r-xs)', fontSize: 16, fontFamily: 'var(--font-body)', outline: 'none', color: 'var(--text-primary)' }}
                              />
                            </div>
                            <button onClick={() => saveRate(row.id)} disabled={isSaving} className="btn btn-navy" style={{ padding: '5px 12px', fontSize: 11 }}>
                              {isSaving ? '...' : 'Save'}
                            </button>
                            <button onClick={() => cancelEdit(row.id)} className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 11 }}>✕</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(row)}
                            style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: 'var(--r-xs)', padding: '5px 10px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', transition: 'border-color 0.15s' }}
                            title="Click to edit rate"
                          >
                            {fmtRate(row.rate_low)}{row.rate_high != null ? ` – ${fmtRate(row.rate_high)}` : ''}
                            <span style={{ fontSize: 10, color: 'var(--text-subtle)', marginLeft: 4 }}>/{row.unit}</span>
                          </button>
                        )}
                      </div>

                      {/* Vetted toggle */}
                      <div style={{ flex: '0 0 auto', marginLeft: 'auto' }}>
                        <button
                          onClick={() => handleVettedToggle(row)}
                          style={{
                            border: 'none', cursor: 'pointer', borderRadius: 'var(--r-full)', padding: '5px 12px', fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-body)',
                            background: row.vetted ? 'var(--green-bg)' : 'var(--amber-bg)',
                            color: row.vetted ? 'var(--green-text)' : 'var(--amber-text-strong)',
                            transition: 'all 0.15s',
                            whiteSpace: 'nowrap',
                          }}
                          title={row.vetted ? 'Mark as needs review' : 'Mark as reviewed'}
                        >
                          {row.vetted ? '✓ Reviewed' : 'Needs Review'}
                        </button>
                      </div>

                      {/* Row error */}
                      {rowErr && <div style={{ flex: '1 1 100%', fontSize: 11, color: 'var(--red-text)', marginTop: 4 }}>{rowErr}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── MaterialTab ─────────────────────────────────────────────────────────────

function MaterialTab({ materialRows, matEdits, matSaving, saveErr, startMatEdit, saveMatRate, setMatEdits, isMobile }) {
  const CAT_LABELS = {
    lvp: 'LVP Flooring', hardwood: 'Hardwood Flooring', carpet: 'Carpet',
    tile_floor: 'Floor Tile', shower_tile: 'Shower Tile', bath_floor_tile: 'Bath Floor Tile',
    heated_floor: 'Heated Floor Mat', backsplash: 'Backsplash',
    cabinet: 'Kitchen Cabinets', countertop: 'Countertop', countertop_butcherblock: 'Butcher Block', vanity: 'Bathroom Vanity',
    window: 'Window', window_egress: 'Egress Window', door_exterior: 'Exterior Door', door_exterior_french: 'French Doors',
    door_sliding_glass: 'Sliding Glass Door', door_garage: 'Garage Door', door_interior: 'Interior Door',
    dumpster_20yd: '20-yd Dumpster', dumpster_30yd: '30-yd Dumpster',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {materialRows.map(row => {
        const inEdit = !!matEdits[row.id];
        const isSaving = matSaving.has(row.id);
        const rowErr = saveErr[`m_${row.id}`];
        const ed = matEdits[row.id] || {};

        return (
          <div key={row.id} className="card" style={{ padding: 18 }}>
            {/* Row header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                  {row.description || CAT_LABELS[row.category] || row.category}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>per {row.unit} · {row.category}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {row.ai_drafted && !row.kalin_adjusted && (
                  <span className="badge" style={{ background: 'var(--amber-bg)', color: 'var(--amber-text-strong)', fontSize: 10 }}>AI drafted</span>
                )}
                {row.kalin_adjusted && (
                  <span className="badge" style={{ background: 'var(--green-bg)', color: 'var(--green-text)', fontSize: 10 }}>
                    <span className="bdot" style={{ background: 'var(--green-dot)' }} />
                    Reviewed
                  </span>
                )}
                {!inEdit && (
                  <button onClick={() => startMatEdit(row)} className="btn btn-ghost" style={{ padding: '4px 12px', fontSize: 11 }}>Edit</button>
                )}
              </div>
            </div>

            {/* Three-tier grid */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { key: 'low', minK: 'tier_low_min', maxK: 'tier_low_max', labelK: 'tier_low_label', label: row.tier_low_label },
                { key: 'mid', minK: 'tier_mid_min', maxK: 'tier_mid_max', labelK: 'tier_mid_label', label: row.tier_mid_label },
                { key: 'hi',  minK: 'tier_hi_min',  maxK: 'tier_hi_max',  labelK: 'tier_hi_label',  label: row.tier_hi_label },
              ].map(({ key, minK, maxK, labelK, label }) => {
                const minVal = row[minK];
                const maxVal = row[maxK];
                const hasData = minVal != null || maxVal != null;

                return (
                  <div key={key} style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-sm)',
                    padding: '10px 14px',
                    background: hasData || inEdit ? 'var(--card-bg)' : 'var(--bg-alt)',
                    opacity: !hasData && !inEdit ? 0.5 : 1,
                  }}>
                    {inEdit ? (
                      <>
                        <input
                          value={ed[labelK] ?? label}
                          onChange={e => setMatEdits(prev => ({ ...prev, [row.id]: { ...prev[row.id], [labelK]: e.target.value } }))}
                          style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 'var(--r-xs)', fontSize: 16, fontFamily: 'var(--font-body)', marginBottom: 8, color: 'var(--text-muted)', background: 'var(--bg)', outline: 'none', boxSizing: 'border-box' }}
                          placeholder="Tier label"
                        />
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input
                            type="number"
                            step="0.01"
                            value={ed[minK] ?? ''}
                            onChange={e => setMatEdits(prev => ({ ...prev, [row.id]: { ...prev[row.id], [minK]: e.target.value } }))}
                            placeholder="Min"
                            style={{ flex: 1, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 'var(--r-xs)', fontSize: 16, fontFamily: 'var(--font-body)', outline: 'none', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                          />
                          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>–</span>
                          <input
                            type="number"
                            step="0.01"
                            value={ed[maxK] ?? ''}
                            onChange={e => setMatEdits(prev => ({ ...prev, [row.id]: { ...prev[row.id], [maxK]: e.target.value } }))}
                            placeholder="Max"
                            style={{ flex: 1, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 'var(--r-xs)', fontSize: 16, fontFamily: 'var(--font-body)', outline: 'none', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>{label}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: hasData ? 'var(--text-primary)' : 'var(--text-subtle)' }}>
                          {hasData ? `${fmtRate(minVal)}${maxVal != null ? ` – ${fmtRate(maxVal)}` : ''}` : '—'}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Edit actions */}
            {inEdit && (
              <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
                <button onClick={() => setMatEdits(prev => { const n = { ...prev }; delete n[row.id]; return n; })} className="btn btn-ghost" style={{ fontSize: 12 }}>Cancel</button>
                <button onClick={() => saveMatRate(row.id)} disabled={isSaving} className="btn btn-navy" style={{ fontSize: 12 }}>
                  {isSaving ? 'Saving...' : 'Save & Mark Reviewed'}
                </button>
              </div>
            )}

            {rowErr && <div style={{ fontSize: 11, color: 'var(--red-text)', marginTop: 8 }}>{rowErr}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ─── RateBookScr (main) ───────────────────────────────────────────────────────

export default function RateBookScr({ profile }) {
  const [laborRows, setLaborRows] = useState([]);
  const [materialRows, setMaterialRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [activeTab, setActiveTab] = useState('labor');
  const [openTrades, setOpenTrades] = useState(new Set());
  const [rowEdits, setRowEdits] = useState({});
  const [saving, setSaving] = useState(new Set());
  const [saveErr, setSaveErr] = useState({});
  const [matEdits, setMatEdits] = useState({});
  const [matSaving, setMatSaving] = useState(new Set());

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = async () => {
    setLoading(true);
    const [lr, mr] = await Promise.all([sbLoadRateBookLabor(), sbLoadRateBookMaterial()]);
    if (!lr.ok) { setErr(lr.error); setLoading(false); return; }
    if (!mr.ok) { setErr(mr.error); setLoading(false); return; }
    setLaborRows(lr.data || []);
    setMaterialRows(mr.data || []);
    const allTrades = new Set(lr.data.map(r => r.trade));
    setOpenTrades(allTrades);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ── Derived ───────────────────────────────────────────────────────────────

  const trades = [...new Set(laborRows.map(r => r.trade))].sort();
  const byTrade = trades.reduce((acc, t) => { acc[t] = laborRows.filter(r => r.trade === t); return acc; }, {});
  const totalLabor = laborRows.length;
  const totalVetted = laborRows.filter(r => r.vetted).length;

  // ── Trade accordion ───────────────────────────────────────────────────────

  const toggleTrade = (trade) => {
    setOpenTrades(prev => {
      const next = new Set(prev);
      if (next.has(trade)) next.delete(trade);
      else next.add(trade);
      return next;
    });
  };

  // ── Labor vetted toggle ───────────────────────────────────────────────────

  const handleVettedToggle = async (row) => {
    const newVetted = !row.vetted;
    setLaborRows(prev => prev.map(r => r.id === row.id ? { ...r, vetted: newVetted } : r));
    const res = await sbUpdateRateBookLabor(row.id, { vetted: newVetted });
    if (!res.ok) {
      setLaborRows(prev => prev.map(r => r.id === row.id ? { ...r, vetted: row.vetted } : r));
      setSaveErr(prev => ({ ...prev, [row.id]: res.error }));
    }
  };

  // ── Labor rate edit/save ──────────────────────────────────────────────────

  const startEdit = (row) => {
    setRowEdits(prev => ({ ...prev, [row.id]: { rate_low: String(row.rate_low), rate_high: String(row.rate_high ?? '') } }));
    setSaveErr(prev => { const n = { ...prev }; delete n[row.id]; return n; });
  };

  const cancelEdit = (id) => {
    setRowEdits(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const saveRate = async (id) => {
    const edits = rowEdits[id];
    if (!edits) return;
    setSaving(prev => new Set(prev).add(id));
    const res = await sbUpdateRateBookLabor(id, {
      rate_low: parseFloat(edits.rate_low),
      rate_high: edits.rate_high !== '' ? parseFloat(edits.rate_high) : null,
    });
    setSaving(prev => { const n = new Set(prev); n.delete(id); return n; });
    if (!res.ok) { setSaveErr(prev => ({ ...prev, [id]: res.error })); return; }
    setLaborRows(prev => prev.map(r => r.id === id ? { ...r, ...res.data } : r));
    cancelEdit(id);
  };

  // ── Material edit/save ────────────────────────────────────────────────────

  const startMatEdit = (row) => {
    setMatEdits(prev => ({
      ...prev,
      [row.id]: {
        tier_low_min: row.tier_low_min ?? '',
        tier_low_max: row.tier_low_max ?? '',
        tier_mid_min: row.tier_mid_min ?? '',
        tier_mid_max: row.tier_mid_max ?? '',
        tier_hi_min: row.tier_hi_min ?? '',
        tier_hi_max: row.tier_hi_max ?? '',
        tier_low_label: row.tier_low_label ?? 'Budget',
        tier_mid_label: row.tier_mid_label ?? 'Mid',
        tier_hi_label: row.tier_hi_label ?? 'Premium',
      }
    }));
  };

  const saveMatRate = async (id) => {
    const edits = matEdits[id];
    if (!edits) return;
    setMatSaving(prev => new Set(prev).add(id));
    const toNum = v => (v === '' || v == null) ? null : parseFloat(v);
    const res = await sbUpdateRateBookMaterial(id, {
      tier_low_min: toNum(edits.tier_low_min),
      tier_low_max: toNum(edits.tier_low_max),
      tier_mid_min: toNum(edits.tier_mid_min),
      tier_mid_max: toNum(edits.tier_mid_max),
      tier_hi_min:  toNum(edits.tier_hi_min),
      tier_hi_max:  toNum(edits.tier_hi_max),
      tier_low_label: edits.tier_low_label,
      tier_mid_label: edits.tier_mid_label,
      tier_hi_label:  edits.tier_hi_label,
      kalin_adjusted: true,
    });
    setMatSaving(prev => { const n = new Set(prev); n.delete(id); return n; });
    if (!res.ok) { setSaveErr(prev => ({ ...prev, [`m_${id}`]: res.error })); return; }
    setMaterialRows(prev => prev.map(r => r.id === id ? { ...r, ...res.data } : r));
    setMatEdits(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: isMob() ? 14 : 24, maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: isMob() ? 22 : 28, color: 'var(--text-primary)', margin: 0 }}>Rate Book</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>Review and calibrate your seeded labor rates and material tiers.</p>
        </div>
        {/* Vetted progress counter */}
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '10px 16px', minWidth: 160 }}>
          <div style={{ fontSize: 11, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>Labor Reviewed</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: totalVetted === totalLabor ? 'var(--green-text)' : 'var(--text-primary)' }}>{totalVetted}</span>
            <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>/ {totalLabor}</span>
          </div>
          {/* thin progress bar */}
          <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: 'var(--bg-alt)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${totalLabor ? (totalVetted / totalLabor) * 100 : 0}%`, background: totalVetted === totalLabor ? 'var(--green-dot)' : 'var(--gold-500)', borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
        </div>
      </div>

      {err && <div style={{ padding: '12px 16px', background: 'var(--red-bg)', color: 'var(--red-text)', borderRadius: 'var(--r-sm)', marginBottom: 16, fontSize: 13 }}>{err}</div>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {[['labor', `Labor Rates (${totalLabor})`], ['material', `Material Tiers (${materialRows.length})`]].map(([id, lb]) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '10px 18px', fontSize: 13, fontWeight: 600, color: activeTab === id ? 'var(--navy-900)' : 'var(--text-muted)', borderBottom: activeTab === id ? '2px solid var(--gold-500)' : '2px solid transparent', marginBottom: -1, transition: 'all 0.15s', fontFamily: 'var(--font-body)' }}>
            {lb}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-subtle)', fontSize: 14 }}>Loading rate book...</div>
      ) : activeTab === 'labor' ? (
        <LaborTab
          trades={trades}
          byTrade={byTrade}
          openTrades={openTrades}
          toggleTrade={toggleTrade}
          rowEdits={rowEdits}
          saving={saving}
          saveErr={saveErr}
          handleVettedToggle={handleVettedToggle}
          startEdit={startEdit}
          cancelEdit={cancelEdit}
          saveRate={saveRate}
          setRowEdits={setRowEdits}
          isMobile={isMob()}
        />
      ) : (
        <MaterialTab
          materialRows={materialRows}
          matEdits={matEdits}
          matSaving={matSaving}
          saveErr={saveErr}
          startMatEdit={startMatEdit}
          saveMatRate={saveMatRate}
          setMatEdits={setMatEdits}
          isMobile={isMob()}
        />
      )}
    </div>
  );
}
