import { useState, useEffect } from 'react';
import { sb, AV_USER_ID, sbNotify, sbSendContractEmail, sbSendClientLink, sbGetClientLink, sbLoadDocs } from '../../../lib/supabase';
import { Ic, f$, fD } from '../../../lib/utils';
import { buildGenericPDF } from '../../../lib/pdf';
import ContractModal from '../../modals/ContractModal';
import CompletionSignoffModal from '../../modals/CompletionSignoffModal';
import PhaseAdvanceCard from '../PhaseAdvanceCard';
import JobTodosBlock from '../JobTodosBlock';

function ClientLinkButton({ job }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');
  const [fallbackUrl, setFallbackUrl] = useState('');
  const send = async () => {
    setSending(true); setErr('');
    const res = await sbSendClientLink(job.client_email, job.client_name, job.address, job.id);
    if (res.error) setErr(res.error);
    else setSent(true);
    setSending(false);
  };
  const copyLink = async () => {
    setCopying(true); setErr(''); setFallbackUrl('');
    // Step 1: generate the link server-side
    let url;
    try {
      const res = await sbGetClientLink(job.client_email, job.client_name, job.address, job.id);
      if (res.error || !res.url) { setErr(res.error || 'Could not generate link'); setCopying(false); return; }
      url = res.url;
    } catch (_) {
      setErr('Could not generate link');
      setCopying(false);
      return;
    }
    // Step 2: try clipboard API (may fail after async gap — gesture context may be stale).
    // execCommand fallback removed: invisible/collapsed textarea elements fail to receive
    // focus+selection, so execCommand copies stale page selection instead of url and
    // returns true anyway (false positive). Always show the URL inline as a reliable fallback.
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch (_) {}
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 3000); }
    // Always surface the URL so user can verify what was copied or copy manually if clipboard failed.
    setFallbackUrl(url);
    setCopying(false);
  };
  return (
    <div style={{ gridColumn: '1/-1', background: '#F7F5F0', border: '1px solid #E8E4DC', padding: '12px 14px', marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0A1F44' }}>Client Portal</div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>Send {job.client_name || job.client_email} a magic link to view progress and message you</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '6px 14px', whiteSpace: 'nowrap' }} onClick={copyLink} disabled={copying}>
            {copied ? '✓ Copied!' : copying ? 'Getting...' : 'Copy link'}
          </button>
          {sent ? (
            <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 600, display: 'flex', alignItems: 'center' }}>✓ Sent!</div>
          ) : (
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '6px 14px', whiteSpace: 'nowrap' }} onClick={send} disabled={sending}>{sending ? 'Sending...' : 'Send to client'}</button>
          )}
        </div>
      </div>
      {err && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>{err}</div>}
      {fallbackUrl && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: copied ? '#22c55e' : '#6B7280', marginBottom: 4 }}>
            {copied ? '✓ Copied — link also shown below:' : 'Auto-copy failed — tap to select and copy:'}
          </div>
          <input
            readOnly
            value={fallbackUrl}
            onClick={e => e.target.select()}
            style={{ width: '100%', fontSize: 11, padding: '6px 8px', border: `1px solid ${copied ? '#22c55e' : '#C9A84C'}`, borderRadius: 4, background: '#fff', color: '#0A1F44', boxSizing: 'border-box' }}
          />
        </div>
      )}
    </div>
  );
}

function StatusLinkButton({ token }) {
  const [copied, setCopied] = useState(false);
  const url = `https://avenstone-app.vercel.app/?st=${token}`;
  const copy = () => {
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); }).catch(() => {});
  };
  return (
    <div style={{ gridColumn: '1/-1', background: '#F7F5F0', border: '1px solid #E8E4DC', padding: '12px 14px', marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0A1F44' }}>Realtor Status Link</div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</div>
        </div>
        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '6px 14px', flexShrink: 0, whiteSpace: 'nowrap' }} onClick={copy}>
          {copied ? '✓ Copied!' : 'Copy Link'}
        </button>
      </div>
    </div>
  );
}

export default function InfoTab({ job, upd, del, profile, inf, setInf, editInf, setEditInf, setTab }) {
  const [jobSubs, setJobSubs] = useState([]);
  const [jobSubsLoaded, setJobSubsLoaded] = useState(false);
  const [showContract, setShowContract] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [contractSentBanner, setContractSentBanner] = useState('');
  const [proposalDoc, setProposalDoc] = useState(null);

  useEffect(() => {
    if (jobSubsLoaded) return;
    sb.from('job_sub_engagements')
      .select('id, trade, sub:profiles!sub_id(id, full_name, email)')
      .eq('job_id', job.id)
      .eq('status', 'active')
      .order('activated_at', { ascending: true })
      .then(({ data }) => setJobSubs(data || []));
    sbLoadDocs(job.id).then(docs => {
      const p = docs.find(d => d.file_type === 'proposal');
      if (p) setProposalDoc(p);
    });
    setJobSubsLoaded(true);
  }, [jobSubsLoaded]);

  const saveInf = () => { upd({ ...inf }); setEditInf(false); };

  return (
    <div>
      {['owner', 'sales_rep', 'project_manager'].includes(profile?.role) && (
        <PhaseAdvanceCard jobId={job.id} jobStatus={job.status} />
      )}
      {['owner', 'sales_rep', 'project_manager'].includes(profile?.role) && (
        <JobTodosBlock job={job} profile={profile} />
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 }}>Job Details</div>
        <button className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: 11 }} onClick={() => setEditInf(!editInf)}>{editInf ? 'Cancel' : 'Edit'}</button>
      </div>
      {editInf ? (
        <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: 16, marginBottom: 16 }}>
          {[['client_name','Client Name','John Smith'],['client_phone','Phone','(816) 555-1234'],['client_email','Email','john@email.com'],['spouse_name','Spouse Name','Jane Smith'],['spouse_phone','Spouse Phone','(816) 555-5678'],['spouse_email','Spouse Email','jane@email.com'],['assigned_rep','Rep','Kalin'],['assigned_subs','Subs','KC Electric, etc.'],['contract_value','Contract Value ($)','85000'],['target_completion','Target Completion','June 15, 2026'],['sqft','Sqft','1879'],['referring_realtor_name','Referring Realtor','Jane Smith'],['referring_realtor_phone','Realtor Phone','(816) 555-9876'],['referring_realtor_email','Realtor Email','jane@realty.com']].map(([k, lb, ph]) => (
            <div className="fg" key={k}><label className="flbl">{lb}</label><input className="finp" value={inf[k] || ''} onChange={e => setInf(p => ({ ...p, [k]: e.target.value }))} placeholder={ph} /></div>
          ))}
          <div className="fg"><label className="flbl">Client Communication</label>
            <select className="finp" style={{ appearance: 'none' }} value={inf.client_notify || 'portal'} onChange={e => setInf(p => ({ ...p, client_notify: e.target.value }))}>
              <option value="portal">Portal Only</option>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="all">Email + SMS</option>
            </select>
          </div>
          <button className="btn btn-gold" style={{ width: '100%', marginTop: 4 }} onClick={saveInf}>Save Details</button>
        </div>
      ) : (
        <div className="ig">
          {[['Client', job.client_name], ['Phone', job.client_phone], ['Email', job.client_email], ['Spouse', job.spouse_name], ['Spouse Ph', job.spouse_phone], ['Spouse Em', job.spouse_email], ['Rep', job.assigned_rep], ['Subs', job.assigned_subs], ['Sqft', job.sqft], ['Target', job.target_completion], ['Created', fD(job.created)], ['Notify', { portal: 'Portal Only', email: 'Email', sms: 'SMS', all: 'Email + SMS' }[job.client_notify || 'portal']], ['Realtor', job.referring_realtor_name], ['Realtor Ph', job.referring_realtor_phone], ['Realtor Em', job.referring_realtor_email]].filter(([, v]) => v).map(([lb, v]) => (
            <div className="ii" key={lb}><div className="ii-l">{lb}</div><div className="ii-v">{v}</div></div>
          ))}
          {!job.client_name && <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '20px', color: '#9CA3AF', fontSize: 13, background: '#fff', border: '1px solid #E8E4DC' }}>Tap Edit to add client and job details</div>}
        </div>
      )}

      {['owner', 'sales_rep', 'project_manager'].includes(profile?.role) && (
        <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: 16, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 }}>Contract</div>
              {job.contract_signed && <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 600, marginTop: 3 }}>✓ Signed by client</div>}
              {!job.contract_signed && job.client_email && <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 3 }}>{proposalDoc ? `Using: ${proposalDoc.name}` : 'Awaiting signature'}</div>}
              {!job.client_email && <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 3 }}>Add client email to send contract</div>}
              {contractSentBanner && <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 600, marginTop: 3 }}>✓ Contract sent to {contractSentBanner}</div>}
            </div>
            {job.client_email && !job.contract_signed && (
              <button className="btn btn-navy" style={{ fontSize: 12, padding: '7px 16px' }} onClick={() => setShowContract(true)}>Send Contract</button>
            )}
            {job.contract_signed && (
              <span style={{ fontSize: 11, background: '#F0FDF4', color: '#16a34a', padding: '4px 12px', border: '1px solid #BBF7D0', fontWeight: 600 }}>Signed</span>
            )}
          </div>
        </div>
      )}

      {['owner', 'sales_rep', 'project_manager'].includes(profile?.role) && job.client_email && (
        <div style={{ marginTop: 16 }}><ClientLinkButton job={job} /></div>
      )}
      {['owner', 'sales_rep', 'project_manager'].includes(profile?.role) && job.status_token && (
        <div style={{ marginTop: 8 }}><StatusLinkButton token={job.status_token} /></div>
      )}

{['owner', 'sales_rep', 'project_manager'].includes(profile?.role) && ['complete', 'final_touches'].includes(job.status) && (
        <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: 16, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 }}>Completion Sign-off</div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 3 }}>Have the client sign off that work is complete</div>
            </div>
            {job.client_email && <button className="btn btn-gold" style={{ fontSize: 12, padding: '7px 16px' }} onClick={() => setShowCompletion(true)}>Send Sign-off</button>}
          </div>
        </div>
      )}

      {['owner', 'project_manager'].includes(profile?.role) && (
        <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '12px 16px', marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: 1 }}>
              <input type="checkbox" checked={inf.cost_plus || false} onChange={e => { const v = e.target.checked; setInf(p => ({ ...p, cost_plus: v })); upd({ cost_plus: v }); }} style={{ width: 16, height: 16 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44' }}>Cost-plus job</div>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>Client sees financials in their portal</div>
              </div>
            </label>
            {inf.cost_plus && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap' }}>Labor markup %</div>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={inf.labor_markup_pct ?? ''}
                    onChange={e => { const v = Number(e.target.value || 0); setInf(p => ({ ...p, labor_markup_pct: v })); upd({ labor_markup_pct: v }); }}
                    style={{ width: 64, border: '1px solid #E8E4DC', padding: '5px 8px', fontSize: 13, fontFamily: 'inherit', textAlign: 'center' }}
                  />
                  <div style={{ fontSize: 12, color: '#6B7280' }}>%</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap' }}>Material markup %</div>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={inf.material_markup_pct ?? ''}
                    onChange={e => { const v = Number(e.target.value || 0); setInf(p => ({ ...p, material_markup_pct: v })); upd({ material_markup_pct: v }); }}
                    style={{ width: 64, border: '1px solid #E8E4DC', padding: '5px 8px', fontSize: 13, fontFamily: 'inherit', textAlign: 'center' }}
                  />
                  <div style={{ fontSize: 12, color: '#6B7280' }}>%</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap' }}>Legacy markup % (deprecated — use labor + material above)</div>
                  <input
                    type="number"
                    min="0"
                    max="200"
                    value={inf.default_markup_pct ?? ''}
                    onChange={e => { const v = Number(e.target.value || 0); setInf(p => ({ ...p, default_markup_pct: v })); upd({ default_markup_pct: v }); }}
                    style={{ width: 64, border: '1px solid #E8E4DC', padding: '5px 8px', fontSize: 13, fontFamily: 'inherit', textAlign: 'center' }}
                  />
                  <div style={{ fontSize: 12, color: '#6B7280' }}>%</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap' }}>PM Fee ($)</div>
                  <input type="number" step="100" min="0"
                    value={inf.pm_fee ?? 0}
                    onChange={e => { const v = Number(e.target.value || 0); setInf(p => ({ ...p, pm_fee: v })); upd({ pm_fee: v }); }}
                    style={{ width: 80, border: '1px solid #E8E4DC', padding: '5px 8px', fontSize: 13, fontFamily: 'inherit', textAlign: 'center' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap' }}>Retainage (%)</div>
                  <input type="number" step="0.5" min="0" max="50"
                    value={inf.retainage_pct ?? 0}
                    onChange={e => { const v = Math.min(50, Math.max(0, Number(e.target.value || 0))); setInf(p => ({ ...p, retainage_pct: v })); upd({ retainage_pct: v }); }}
                    style={{ width: 64, border: '1px solid #E8E4DC', padding: '5px 8px', fontSize: 13, fontFamily: 'inherit', textAlign: 'center' }}
                  />
                  <div style={{ fontSize: 12, color: '#6B7280' }}>%</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: 16, marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 }}>Assigned Subs</div>
          <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }} onClick={() => setTab && setTab('subs')}>Manage in Subs tab →</button>
        </div>
        {!jobSubs.length && <div style={{ textAlign: 'center', padding: '16px 0', color: '#9CA3AF', fontSize: 13 }}>No subs assigned yet</div>}
        {jobSubs.map(js => { const p = js.sub || {}; return (
          <div key={js.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #F3F0E8' }}>
            <div style={{ width: 32, height: 32, background: '#0A1F4422', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#0A1F44', flexShrink: 0 }}>{(p.full_name || '?')[0].toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44' }}>{p.full_name || p.email}</div>
              {js.trade && <div style={{ fontSize: 11, color: '#9CA3AF' }}>{js.trade}</div>}
            </div>
          </div>
        ); })}
      </div>

      <button className="btn btn-danger" style={{ width: '100%', marginTop: 8, padding: 11 }} onClick={del}>Delete Job</button>
      {showContract && <ContractModal job={job} onClose={() => setShowContract(false)} onSent={(email, name) => { upd({ client_email: email, client_name: name }); setShowContract(false); setContractSentBanner(email); setTimeout(() => setContractSentBanner(''), 4000); }} proposalDoc={proposalDoc} />}
      {showCompletion && <CompletionSignoffModal job={job} onClose={() => setShowCompletion(false)} onSigned={() => setShowCompletion(false)} />}
    </div>
  );
}
