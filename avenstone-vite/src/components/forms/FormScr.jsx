import { useState } from 'react';
import { sbUpd, AV_JOBS } from '../../lib/supabase';
import { Ic } from '../../lib/utils';

const SEL_STYLE = { appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 32 };

function Fld({ q, v, set }) {
  const filled = v && (Array.isArray(v) ? v.length > 0 : v !== '');
  return (
    <div className="fg">
      <label className="flbl">{q.req && <span className="freq">*</span>}{q.lb}</label>
      {q.why && <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 6, fontStyle: 'italic' }}>{q.why}</div>}
      {q.t === 'text' && <input className={`finp${filled ? ' ok' : ''}`} value={v || ''} onChange={e => set(e.target.value)} placeholder={q.ph} />}
      {q.t === 'sel' && <select className={`finp${filled ? ' ok' : ''}`} style={SEL_STYLE} value={v || ''} onChange={e => set(e.target.value)}><option value="">— Select —</option>{q.opts.map(o => <option key={o} value={o}>{o}</option>)}</select>}
      {q.t === 'ta' && <textarea className={`finp fta${filled ? ' ok' : ''}`} value={v || ''} onChange={e => set(e.target.value)} placeholder={q.ph} />}
      {q.t === 'mc' && <div className="mc-wrap">{q.opts.map(o => { const on = Array.isArray(v) && v.includes(o); return <button key={o} className={`mc${on ? ' on' : ''}`} onClick={() => { const c = Array.isArray(v) ? v : []; set(on ? c.filter(x => x !== o) : [...c, o]); }}>{on && <span style={{ marginRight: 4 }}>✓</span>}{o}</button>; })}</div>}
      {q.t === 'jp' && <select className={`finp${filled ? ' ok' : ''}`} style={SEL_STYLE} value={v || ''} onChange={e => set(e.target.value)}><option value="">— No job linked —</option>{AV_JOBS.filter(j => !['complete'].includes(j.status)).map(j => <option key={j.id} value={j.id}>{j.address}{j.client_name ? ' — ' + j.client_name : ''}</option>)}</select>}
    </div>
  );
}

export default function FormScr({ title, secs, rules, ftype, onBack, onSave }) {
  const [ans, setAns] = useState({});
  const [tab, setTab] = useState(0);
  const [showV, setShowV] = useState(false);
  const [st, setSt] = useState('idle');

  const setA = (id, val) => setAns(p => ({ ...p, [id]: val }));
  const tA = secs.reduce((a, s) => a + s.qs.filter(q => ans[q.id] && ans[q.id] !== '').length, 0);
  const tQ = secs.reduce((a, s) => a + s.qs.length, 0);
  const pct = Math.round((tA / tQ) * 100);
  const errs = rules.filter(r => r.f(ans));
  const ok = errs.length === 0;

  const build = () => ({
    _meta: { form_type: ftype, exported: new Date().toISOString(), instructions: ['Generate a professional Avenstone bid document.', 'Never mention Claude or AI.', 'Include: header, scope by trade, pricing table, timeline, payment terms, 1-year warranty, signature block.'] },
    answers: Object.fromEntries(secs.map(s => [s.id, { label: s.lb, data: Object.fromEntries(s.qs.map(q => [q.id, ans[q.id] || null])) }])),
  });

  const submit = async () => {
    const json = JSON.stringify(build(), null, 2);
    setShowV(false); setSt('sub');
    try {
      await navigator.clipboard.writeText(json);
      if (ftype === 'intake' && onSave) {
        onSave({ id: Date.now().toString(), address: ans.address || 'New Job', status: 'lead', created: new Date().toISOString(), scope: ans.scope_type || '', sqft: ans.total_sqft || '', photos: [], activity: [], change_orders: [], client_name: '', client_phone: '', client_email: '', assigned_rep: '', assigned_subs: '', contract_value: 0, co_total: 0, target_completion: '', ans });
      }
      if (ftype === 'bid' && ans.linked_job_id) {
        try {
          const nums = (ans.line_items || '').match(/=\s*\$?([\d,]+)/g) || [];
          const sum = nums.reduce((a, m) => a + Number(m.replace(/[^\d]/g, '')), 0);
          if (sum > 0) await sbUpd(ans.linked_job_id, { contract_value: sum, status: 'bid_sent' });
        } catch (e) { /* ignore */ }
      }
      setSt('ok');
    } catch (e) { setSt('err'); setTimeout(() => setSt('idle'), 3000); }
  };

  const go = () => { if (!ok) { setShowV(true); return; } submit(); };
  const sec = secs[tab];

  if (st === 'ok') return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', background: '#F7F5F0' }}>
      <div style={{ width: 64, height: 64, background: '#0A1F44', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: '#C9A84C' }}>{Ic.check}</div>
      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 28, color: '#0A1F44', marginBottom: 8 }}>Submitted</div>
      <div style={{ fontSize: 14, color: '#9CA3AF', maxWidth: 300, lineHeight: 1.8, marginBottom: 24 }}>
        {ftype === 'intake' ? 'Job saved to Projects. Intake JSON copied to clipboard.' : 'Bid JSON copied. Upload to Claude with your floor plan to generate the document.'}
        {ftype === 'bid' && ans.linked_job_id ? ' Job contract value updated.' : ''}
      </div>
      <button className="btn btn-navy" onClick={onBack}>Back to Dashboard</button>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#F7F5F0' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #E8E4DC', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#9CA3AF', width: 24, height: 24, display: 'flex', alignItems: 'center' }} onClick={onBack}>{Ic.back}</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: '#0A1F44' }}>{title}</div>
          {(ans.address || ans.property_address) && <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 1 }}>{ans.address || ans.property_address}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!ok && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#ef4444', fontSize: 11, padding: '4px 10px', cursor: 'pointer', fontWeight: 600 }} onClick={() => setShowV(true)}>{errs.length} issue{errs.length > 1 ? 's' : ''}</div>}
          <div style={{ fontSize: 12, color: '#9CA3AF' }}>{pct}%</div>
          <button className={`btn ${ok ? 'btn-gold' : 'btn-ghost'}`} onClick={go}>{st === 'sub' ? 'Saving...' : ok ? 'Submit' : 'Fix Issues'}</button>
        </div>
      </div>
      <div style={{ height: 2, background: '#E8E4DC', flexShrink: 0 }}><div style={{ height: 2, background: '#C9A84C', width: `${pct}%`, transition: 'width 0.4s' }} /></div>
      <div style={{ display: 'flex', overflowX: 'auto', background: '#fff', borderBottom: '1px solid #E8E4DC', flexShrink: 0 }}>
        {secs.map((s, i) => {
          const on = tab === i;
          return (
            <button key={s.id} onClick={() => setTab(i)} style={{ background: on ? '#F7F5F0' : 'transparent', border: 'none', borderBottom: `2px solid ${on ? '#C9A84C' : 'transparent'}`, padding: '12px 16px', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: on ? '#0A1F44' : '#9CA3AF', letterSpacing: 0.5, whiteSpace: 'nowrap', fontWeight: on ? 600 : 400, display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase' }}>
              <span style={{ width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: on ? 1 : 0.5 }}>{Ic[s.ic] || Ic.clip}</span>{s.lb}
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: '#0A1F44', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #E8E4DC' }}>{sec.lb}</div>
        {sec.qs.map(q => <Fld key={q.id} q={q} v={ans[q.id]} set={val => setA(q.id, val)} />)}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, paddingTop: 16, borderTop: '1px solid #E8E4DC' }}>
          <button className="btn btn-ghost" onClick={() => setTab(Math.max(0, tab - 1))} disabled={tab === 0} style={{ opacity: tab === 0 ? 0.3 : 1 }}>← Back</button>
          {tab < secs.length - 1
            ? <button className="btn btn-navy" onClick={() => setTab(tab + 1)}>Next →</button>
            : <button className={`btn ${ok ? 'btn-gold' : 'btn-ghost'}`} onClick={go}>{ok ? 'Submit' : 'Fix Issues'}</button>}
        </div>
      </div>
      {showV && (
        <div className="overlay" onClick={() => setShowV(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Fix before submitting</div>
            {errs.map((e, i) => <div key={i} style={{ background: '#FEF2F2', border: '1px solid #FECACA', padding: '10px 14px', marginBottom: 8, fontSize: 13, color: '#DC2626', fontWeight: 500 }}>{e.m}</div>)}
            <div style={{ marginTop: 16, textAlign: 'right' }}><button className="btn btn-ghost" onClick={() => setShowV(false)}>Go Back</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
