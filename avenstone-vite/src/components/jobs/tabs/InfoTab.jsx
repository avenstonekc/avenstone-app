import { useState, useEffect } from 'react';
import { sb, AV_USER_ID, sbNotify, sbSendContractEmail, sbCreateClientLogin, sbLoadDocs } from '../../../lib/supabase';
import { Ic, f$, fD } from '../../../lib/utils';
import { buildGenericPDF } from '../../../lib/pdf';
import ContractModal from '../../modals/ContractModal';
import CompletionSignoffModal from '../../modals/CompletionSignoffModal';
import PhaseAdvanceCard from '../PhaseAdvanceCard';
import JobTodosBlock from '../JobTodosBlock';

function ClientLoginButton({ job }) {
  const [open, setOpen] = useState(false);
  const [pwd, setPwd] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    if (!pwd || pwd.length < 6) { setErr('Password must be at least 6 characters'); return; }
    setSaving(true); setErr('');
    try {
      const res = await sbCreateClientLogin(job.client_email, pwd, job.client_name, job.id);
      if (res.ok) { setDone(true); setOpen(false); setPwd(''); }
      else setErr(res.error || 'Failed to create login');
    } catch (_) { setErr('Failed to create login'); }
    setSaving(false);
  };

  return (
    <div style={{ gridColumn: '1/-1', background: '#F7F5F0', border: '1px solid #E8E4DC', padding: '12px 14px', marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0A1F44' }}>Client Portal Access</div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
            {done
              ? <span>Login active — <strong style={{ color: '#0A1F44' }}>{job.client_email}</strong> can sign in now</span>
              : `Set a password so ${job.client_name || job.client_email} can log into their portal`}
          </div>
        </div>
        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '6px 14px', flexShrink: 0, whiteSpace: 'nowrap' }} onClick={() => { setOpen(o => !o); setErr(''); setPwd(''); }}>
          {open ? 'Cancel' : done ? 'Reset password' : 'Set login'}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="password"
            value={pwd}
            onChange={e => setPwd(e.target.value)}
            placeholder="Password (min 6 chars)"
            className="finp"
            style={{ flex: 1, minWidth: 160, fontSize: 13, padding: '7px 10px' }}
            onKeyDown={e => e.key === 'Enter' && save()}
            autoFocus
          />
          <button className="btn btn-navy" style={{ fontSize: 11, padding: '7px 16px', flexShrink: 0 }} onClick={save} disabled={saving || !pwd}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}
      {done && !open && (
        <div style={{ fontSize: 11, color: '#22c55e', marginTop: 6, lineHeight: 1.5 }}>
          ✓ Login active. Give {job.client_name || 'the client'} their credentials:<br />
          <strong>Email:</strong> {job.client_email} · <strong>Password:</strong> the one you just set
        </div>
      )}
      {err && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>{err}</div>}
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
        <div style={{ marginTop: 16 }}><ClientLoginButton job={job} /></div>
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
