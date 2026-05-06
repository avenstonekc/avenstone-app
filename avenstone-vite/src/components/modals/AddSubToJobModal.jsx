import { useState, useEffect } from 'react';
import { sb, AV_TENANT, sbCreateEngagement, sbLoadActiveSubs } from '../../lib/supabase';

export default function AddSubToJobModal({ isOpen, onClose, onSuccess, initialSubId = null, initialJobId = null }) {
  const [subs, setSubs]   = useState([]);
  const [jobs, setJobs]   = useState([]);
  const [trades, setTrades] = useState([]);

  const [subId, setSubId]             = useState(initialSubId || '');
  const [jobId, setJobId]             = useState(initialJobId || '');
  const [trade, setTrade]             = useState('');
  const [bidType, setBidType]         = useState('sub_drafted');
  const [scopeDescription, setScopeDescription] = useState('');
  const [dueDate, setDueDate]         = useState('');
  const [budgetMin, setBudgetMin]     = useState('');
  const [budgetMax, setBudgetMax]     = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState(null);

  useEffect(() => {
    sbLoadActiveSubs().then(setSubs);
    sb.from('jobs')
      .select('id, address, status')
      .eq('tenant_id', AV_TENANT)
      .not('status', 'in', '(complete)')
      .order('created_at', { ascending: false })
      .then(({ data }) => setJobs(data || []));
  }, []);

  useEffect(() => {
    setTrade('');
    if (!subId) { setTrades([]); return; }
    sb.from('sub_pricing').select('trade').eq('sub_id', subId).order('trade')
      .then(({ data }) => setTrades((data || []).map(r => r.trade)));
  }, [subId]);

  useEffect(() => {
    // Sync controlled IDs whenever modal opens/closes so props changes take effect
    setSubId(initialSubId || '');
    setJobId(initialJobId || '');
    if (!isOpen) {
      setTrade('');
      setBidType('sub_drafted');
      setScopeDescription('');
      setDueDate('');
      setBudgetMin('');
      setBudgetMax('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const title = initialSubId && !initialJobId ? 'Add to Job'
    : !initialSubId && initialJobId ? 'Add Sub'
    : 'New Engagement';

  const submitLabel = initialSubId ? 'Add to Job' : initialJobId ? 'Add Sub' : 'Create Engagement';

  const selectedSub = subs.find(s => s.id === subId);
  const selectedJob = jobs.find(j => j.id === jobId);
  const noTrades    = subId && trades.length === 0;

  async function handleSubmit() {
    if (!subId || !jobId || !trade || !bidType) {
      setError('Sub, job, trade, and bid origination are required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await sbCreateEngagement({
        jobId,
        subId,
        trade,
        bidType,
        scopeDescription: scopeDescription || null,
        dueDate: dueDate || null,
        budgetMin: budgetMin === '' ? null : Number(budgetMin),
        budgetMax: budgetMax === '' ? null : Number(budgetMax),
      });
      if (!result.ok) { setError(result.error); return; }
      onSuccess(result.data);
      onClose();
    } catch (err) {
      setError(err?.message || 'Unexpected error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div className="modal-title" style={{ margin: 0 }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#9CA3AF', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {error && (
          <div style={{ background: '#FEE2E2', border: '1px solid #fca5a5', borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#991b1b' }}>
            {error}
          </div>
        )}

        {/* Sub */}
        <div className="fg">
          <label className="flbl"><span style={{ color: '#ef4444' }}>* </span>Sub</label>
          {initialSubId ? (
            <div style={{ fontSize: 14, color: '#0A1F44' }}>
              {selectedSub ? `${selectedSub.full_name} — ${selectedSub.email}` : initialSubId}
            </div>
          ) : (
            <select className="finp" value={subId} onChange={e => setSubId(e.target.value)}>
              <option value="">— Select sub —</option>
              {subs.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          )}
        </div>

        {/* Job */}
        <div className="fg">
          <label className="flbl"><span style={{ color: '#ef4444' }}>* </span>Job</label>
          {initialJobId ? (
            <div style={{ fontSize: 14, color: '#0A1F44' }}>
              {selectedJob ? selectedJob.address : initialJobId}
            </div>
          ) : (
            <select className="finp" value={jobId} onChange={e => setJobId(e.target.value)}>
              <option value="">— Select job —</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.address}</option>)}
            </select>
          )}
        </div>

        {/* Trade */}
        <div className="fg">
          <label className="flbl"><span style={{ color: '#ef4444' }}>* </span>Trade</label>
          {noTrades ? (
            <div style={{ fontSize: 13, color: '#9CA3AF' }}>
              This sub has no approved trades. Add pricing in the Subs Directory first.
            </div>
          ) : (
            <select className="finp" value={trade} onChange={e => setTrade(e.target.value)} disabled={!subId}>
              <option value="">— Select trade —</option>
              {trades.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>

        {/* Bid origination */}
        <div className="fg">
          <label className="flbl"><span style={{ color: '#ef4444' }}>* </span>Bid Origination</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#0A1F44', cursor: 'pointer' }}>
              <input type="radio" name="bidType" value="sub_drafted" checked={bidType === 'sub_drafted'} onChange={() => setBidType('sub_drafted')} />
              Sub drafts the bid
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#0A1F44', cursor: 'pointer' }}>
              <input type="radio" name="bidType" value="gc_drafted" checked={bidType === 'gc_drafted'} onChange={() => setBidType('gc_drafted')} />
              We draft from their rates
            </label>
          </div>
        </div>

        {/* Scope description */}
        <div className="fg">
          <label className="flbl">Scope Description</label>
          <textarea className="finp" rows={3} value={scopeDescription} onChange={e => setScopeDescription(e.target.value)} placeholder="What's the scope for this engagement?" style={{ resize: 'vertical' }} />
        </div>

        {/* Due date */}
        <div className="fg">
          <label className="flbl">Due Date</label>
          <input className="finp" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </div>

        {/* Budget min / max */}
        <div className="fg" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label className="flbl">Budget Min ($)</label>
            <input className="finp" type="number" min="0" value={budgetMin} onChange={e => setBudgetMin(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="flbl">Budget Max ($)</label>
            <input className="finp" type="number" min="0" value={budgetMax} onChange={e => setBudgetMax(e.target.value)} placeholder="0" />
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-navy" style={{ flex: 2 }} onClick={handleSubmit} disabled={submitting || noTrades}>
            {submitting ? 'Saving…' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
