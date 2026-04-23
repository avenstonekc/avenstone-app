import { useState, useEffect, Fragment } from 'react';
import { sbLoadCostItems, sbCreateCostItem, sbUpdCostItem, sbDelCostItem, sbLoadCostInvoices, sbCreateCostInvoice, sbUpdCostInvoice, sbDelCostInvoice, sbUploadLienWaiver } from '../../../lib/supabase';
import { f$ } from '../../../lib/utils';

export default function CostsTab({ job }) {
  const [items, setItems] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editRow, setEditRow] = useState(null);
  const [editVals, setEditVals] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [addingInv, setAddingInv] = useState(null);
  const [newInv, setNewInv] = useState({ date: '', amount: '' });
  const [addingItem, setAddingItem] = useState(false);
  const defaultMarkup = String(job.default_markup_pct || 0);
  const [newItem, setNewItem] = useState({ trade: '', vendor: '', estimate: '', markup_pct: defaultMarkup, client_visible: true });

  useEffect(() => { load(); }, [job.id]);

  const load = async () => {
    setLoading(true);
    const [its, invs] = await Promise.all([sbLoadCostItems(job.id), sbLoadCostInvoices(job.id)]);
    setItems(its); setInvoices(invs); setLoading(false);
  };

  const cp = item => Number(item.estimate || 0) * (1 + Number(item.markup_pct || 0) / 100);
  const paidFor = id => invoices.filter(i => i.cost_item_id === id && i.paid).reduce((a, i) => a + Number(i.amount || 0), 0);

  const totEst = items.reduce((a, i) => a + Number(i.estimate || 0), 0);
  const totCp = items.reduce((a, i) => a + cp(i), 0);
  const totPaid = items.reduce((a, i) => a + paidFor(i.id), 0);

  const startEdit = item => { setEditRow(item.id); setEditVals({ trade: item.trade, vendor: item.vendor, estimate: String(item.estimate), markup_pct: String(item.markup_pct), client_visible: item.client_visible }); };
  const saveEdit = async id => {
    const { data } = await sbUpdCostItem(id, { trade: editVals.trade, vendor: editVals.vendor, estimate: Number(editVals.estimate || 0), markup_pct: Number(editVals.markup_pct || 0), client_visible: editVals.client_visible });
    if (data) setItems(p => p.map(i => i.id === id ? { ...i, ...data } : i));
    setEditRow(null);
  };
  const delItem = async id => { await sbDelCostItem(id); setItems(p => p.filter(i => i.id !== id)); setInvoices(p => p.filter(i => i.cost_item_id !== id)); };
  const addItem = async () => {
    if (!newItem.trade) return;
    const { data } = await sbCreateCostItem(job.id, { trade: newItem.trade, vendor: newItem.vendor, estimate: Number(newItem.estimate || 0), markup_pct: Number(newItem.markup_pct || 0), client_visible: newItem.client_visible });
    if (data) { setItems(p => [...p, data]); setNewItem({ trade: '', vendor: '', estimate: '', markup_pct: defaultMarkup, client_visible: true }); setAddingItem(false); }
  };
  const togglePaid = async inv => {
    const { data } = await sbUpdCostInvoice(inv.id, { paid: !inv.paid });
    if (data) setInvoices(p => p.map(i => i.id === inv.id ? { ...i, ...data } : i));
  };
  const addInv = async itemId => {
    if (!newInv.amount) return;
    const { data } = await sbCreateCostInvoice(job.id, { cost_item_id: itemId, date: newInv.date || new Date().toISOString().slice(0, 10), amount: Number(newInv.amount), paid: false });
    if (data) { setInvoices(p => [...p, { ...data, lien_waiver_signed_url: null }]); setNewInv({ date: '', amount: '' }); setAddingInv(null); }
  };
  const delInv = async id => { await sbDelCostInvoice(id); setInvoices(p => p.filter(i => i.id !== id)); };
  const uploadLien = async (inv, file) => {
    await sbUploadLienWaiver(job.id, inv.id, file);
    const invs = await sbLoadCostInvoices(job.id);
    setInvoices(invs);
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF' }}>Loading...</div>;

  const th = { fontSize: 11, fontWeight: 600, color: '#9CA3AF', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #E8E4DC', background: '#F7F5F0', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' };
  const td = { padding: '8px 10px', fontSize: 13, color: '#374151', borderBottom: '1px solid #F0ECE6', verticalAlign: 'middle' };
  const inp = { border: '1px solid #E8E4DC', padding: '4px 8px', fontSize: 12, width: '100%', borderRadius: 4, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[['Estimate Total', totEst], ['Client Price Total', totCp], ['Paid to Subs', totPaid]].map(([lb, v]) => (
          <div key={lb} style={{ flex: 1, minWidth: 110, background: '#fff', border: '1px solid #E8E4DC', padding: '12px 14px' }}>
            <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{lb}</div>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: '#0A1F44' }}>{f$(v)}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E8E4DC', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
          <thead>
            <tr>{['Trade','Vendor','Estimate','Markup %','Client Price','Paid','Visible',''].map(h => <th key={h} style={th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {items.map(item => {
              const isEdit = editRow === item.id;
              const isExp = expanded === item.id;
              const itemInvs = invoices.filter(i => i.cost_item_id === item.id);
              const paid = paidFor(item.id);
              const ev = editVals;
              return (
                <Fragment key={item.id}>
                  <tr style={{ cursor: 'pointer', background: isExp ? '#FAFAF8' : undefined }} onClick={() => { if (!isEdit) setExpanded(isExp ? null : item.id); }}>
                    <td style={td}>{isEdit ? <input style={inp} value={ev.trade} onChange={e => setEditVals(p => ({ ...p, trade: e.target.value }))} onClick={e => e.stopPropagation()} /> : item.trade || '—'}</td>
                    <td style={td}>{isEdit ? <input style={inp} value={ev.vendor} onChange={e => setEditVals(p => ({ ...p, vendor: e.target.value }))} onClick={e => e.stopPropagation()} /> : item.vendor || '—'}</td>
                    <td style={td}>{isEdit ? <input style={{ ...inp, width: 90 }} type="number" value={ev.estimate} onChange={e => setEditVals(p => ({ ...p, estimate: e.target.value }))} onClick={e => e.stopPropagation()} /> : f$(Number(item.estimate || 0))}</td>
                    <td style={td}>{isEdit ? <input style={{ ...inp, width: 60 }} type="number" value={ev.markup_pct} onChange={e => setEditVals(p => ({ ...p, markup_pct: e.target.value }))} onClick={e => e.stopPropagation()} /> : `${item.markup_pct || 0}%`}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{f$(cp(item))}</td>
                    <td style={{ ...td, color: paid > 0 ? '#22c55e' : '#9CA3AF' }}>{f$(paid)}</td>
                    <td style={td} onClick={e => e.stopPropagation()}>
                      {isEdit
                        ? <input type="checkbox" checked={ev.client_visible} onChange={e => setEditVals(p => ({ ...p, client_visible: e.target.checked }))} />
                        : <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: item.client_visible ? '#D1FAE5' : '#F3F4F6', color: item.client_visible ? '#065F46' : '#6B7280' }}>{item.client_visible ? 'Yes' : 'No'}</span>}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                      {isEdit ? (
                        <><button style={{ fontSize: 11, color: '#22c55e', border: 'none', background: 'none', cursor: 'pointer', padding: '2px 6px' }} onClick={() => saveEdit(item.id)}>Save</button><button style={{ fontSize: 11, color: '#9CA3AF', border: 'none', background: 'none', cursor: 'pointer', padding: '2px 6px' }} onClick={() => setEditRow(null)}>Cancel</button></>
                      ) : (
                        <><button style={{ fontSize: 11, color: '#C9A84C', border: 'none', background: 'none', cursor: 'pointer', padding: '2px 6px' }} onClick={() => startEdit(item)}>Edit</button><button style={{ fontSize: 11, color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer', padding: '2px 6px' }} onClick={() => delItem(item.id)}>Del</button></>
                      )}
                    </td>
                  </tr>
                  {isExp && (
                    <tr>
                      <td colSpan={8} style={{ padding: '8px 16px 14px', background: '#F7F5F0', borderBottom: '1px solid #E8E4DC' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Payments — {item.vendor || item.trade}</div>
                        {!itemInvs.length && <div style={{ fontSize: 12, color: '#9CA3AF', paddingBottom: 8 }}>No payments yet</div>}
                        {itemInvs.map(inv => (
                          <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #EAE6DF', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 12, color: '#6B7280', minWidth: 90 }}>{inv.date || '—'}</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44', minWidth: 80 }}>{f$(Number(inv.amount || 0))}</span>
                            <button style={{ fontSize: 11, padding: '2px 10px', border: '1px solid', borderColor: inv.paid ? '#22c55e' : '#E8E4DC', borderRadius: 12, background: inv.paid ? '#D1FAE5' : '#fff', color: inv.paid ? '#065F46' : '#6B7280', cursor: 'pointer' }} onClick={() => togglePaid(inv)}>
                              {inv.paid ? '✓ Paid' : 'Mark Paid'}
                            </button>
                            {inv.lien_waiver_signed_url
                              ? <a href={inv.lien_waiver_signed_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#3B82F6', textDecoration: 'none' }}>📎 Lien Waiver</a>
                              : <label style={{ fontSize: 11, color: '#C9A84C', cursor: 'pointer' }}>Attach Lien Waiver<input type="file" style={{ display: 'none' }} accept=".pdf,.jpg,.jpeg,.png" onChange={e => e.target.files[0] && uploadLien(inv, e.target.files[0])} /></label>}
                            <button style={{ fontSize: 11, color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer', marginLeft: 'auto' }} onClick={() => delInv(inv.id)}>Del</button>
                          </div>
                        ))}
                        {addingInv === item.id ? (
                          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <input type="date" style={{ ...inp, width: 130 }} value={newInv.date} onChange={e => setNewInv(p => ({ ...p, date: e.target.value }))} />
                            <input type="number" placeholder="Amount" style={{ ...inp, width: 110 }} value={newInv.amount} onChange={e => setNewInv(p => ({ ...p, amount: e.target.value }))} />
                            <button className="btn btn-navy" style={{ fontSize: 12, padding: '5px 14px' }} onClick={() => addInv(item.id)}>Add</button>
                            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 14px' }} onClick={() => setAddingInv(null)}>Cancel</button>
                          </div>
                        ) : (
                          <button style={{ marginTop: 8, fontSize: 12, color: '#C9A84C', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} onClick={() => { setAddingInv(item.id); setNewInv({ date: '', amount: '' }); }}>+ Add payment</button>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {addingItem ? (
              <tr>
                <td style={td}><input style={inp} placeholder="Trade" value={newItem.trade} onChange={e => setNewItem(p => ({ ...p, trade: e.target.value }))} /></td>
                <td style={td}><input style={inp} placeholder="Vendor" value={newItem.vendor} onChange={e => setNewItem(p => ({ ...p, vendor: e.target.value }))} /></td>
                <td style={td}><input style={{ ...inp, width: 90 }} type="number" placeholder="0" value={newItem.estimate} onChange={e => setNewItem(p => ({ ...p, estimate: e.target.value }))} /></td>
                <td style={td}><input style={{ ...inp, width: 60 }} type="number" placeholder="0" value={newItem.markup_pct} onChange={e => setNewItem(p => ({ ...p, markup_pct: e.target.value }))} /></td>
                <td style={td}>{f$(Number(newItem.estimate || 0) * (1 + Number(newItem.markup_pct || 0) / 100))}</td>
                <td style={td}>—</td>
                <td style={td}><input type="checkbox" checked={newItem.client_visible} onChange={e => setNewItem(p => ({ ...p, client_visible: e.target.checked }))} /></td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <button style={{ fontSize: 11, color: '#22c55e', border: 'none', background: 'none', cursor: 'pointer', padding: '2px 6px' }} onClick={addItem}>Add</button>
                  <button style={{ fontSize: 11, color: '#9CA3AF', border: 'none', background: 'none', cursor: 'pointer', padding: '2px 6px' }} onClick={() => setAddingItem(false)}>Cancel</button>
                </td>
              </tr>
            ) : (
              <tr>
                <td colSpan={8} style={{ ...td, textAlign: 'center' }}>
                  <button style={{ fontSize: 12, color: '#C9A84C', border: 'none', background: 'none', cursor: 'pointer', padding: '6px 0' }} onClick={() => setAddingItem(true)}>+ Add trade</button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
