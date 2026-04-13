import { useState, useEffect } from 'react';
import { sb, AV_USER_ID, sbNotify, sbSendContractEmail, sbLoadJobSubs, sbLoadSubDirectory, sbAssignSub, sbUnassignSub, sbSendClientLink, sbLoadDocs } from '../../../lib/supabase';
import { Ic, f$, fD } from '../../../lib/utils';
import { buildGenericPDF } from '../../../lib/pdf';
import ContractModal from '../../modals/ContractModal';
import CompletionSignoffModal from '../../modals/CompletionSignoffModal';

function ClientLinkButton({ job }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const send = async () => {
    setSending(true); setErr('');
    const res = await sbSendClientLink(job.client_email, job.client_name, job.address, job.id);
    if (res.error) setErr(res.error);
    else setSent(true);
    setSending(false);
  };
  return (
    <div style={{ gridColumn: '1/-1', background: '#F7F5F0', border: '1px solid #E8E4DC', padding: '12px 14px', marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0A1F44' }}>Client Portal</div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>Send {job.client_name || job.client_email} a magic link to view progress and message you</div>
        </div>
        {sent ? (
          <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>✓ Link sent!</div>
        ) : (
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '6px 14px', flexShrink: 0, whiteSpace: 'nowrap' }} onClick={send} disabled={sending}>{sending ? 'Sending...' : 'Send Client Link'}</button>
        )}
      </div>
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

export default function InfoTab({ job, upd, del, profile, inf, setInf, editInf, setEditInf }) {
  const [jobSubs, setJobSubs] = useState([]);
  const [jobSubsLoaded, setJobSubsLoaded] = useState(false);
  const [allSubs, setAllSubs] = useState([]);
  const [showSubPicker, setShowSubPicker] = useState(false);
  const [showContract, setShowContract] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [contractSentBanner, setContractSentBanner] = useState('');
  const [proposalDoc, setProposalDoc] = useState(null);

  useEffect(() => {
    if (jobSubsLoaded) return;
    sbLoadJobSubs(job.id).then(d => setJobSubs(d));
    sbLoadSubDirectory().then(d => setAllSubs(d));
    sbLoadDocs(job.id).then(docs => {
      const p = docs.find(d => d.file_type === 'proposal');
      if (p) setProposalDoc(p);
    });
    setJobSubsLoaded(true);
  }, [jobSubsLoaded]);

  const saveInf = () => { upd({ ...inf }); setEditInf(false); };

  const assignSub = async sub => {
    const row = await sbAssignSub(job.id, sub.id);
    if (row) setJobSubs(p => [...p, { ...row, profile: sub }]);
    sbNotify('assigned_to_job', `Assigned to ${job.address}`, `You've been added to this project`, job.id, sub.id);
    setShowSubPicker(false);
  };

  const unassignSub = async sub => {
    await sbUnassignSub(job.id, sub.id);
    setJobSubs(p => p.filter(js => js.sub_id !== sub.id));
  };

  return (
    <div>
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
          {job.client_email && <ClientLinkButton job={job} />}
          {job.status_token && <StatusLinkButton token={job.status_token} />}
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

{['owner', 'sales_rep', 'project_manager'].includes(profile?.role) && ['complete', 'punch'].includes(job.status) && (
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

      <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: 16, marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 }}>Assigned Subs</div>
          <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setShowSubPicker(true)}><span style={{ width: 12, height: 12, display: 'flex' }}>{Ic.plus}</span>Add Sub</button>
        </div>
        {!jobSubs.length && <div style={{ textAlign: 'center', padding: '16px 0', color: '#9CA3AF', fontSize: 13 }}>No subs assigned yet</div>}
        {jobSubs.map(js => { const p = js.profile || {}; return (
          <div key={js.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #F3F0E8' }}>
            <div style={{ width: 32, height: 32, background: '#0A1F4422', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#0A1F44', flexShrink: 0 }}>{(p.full_name || '?')[0].toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44' }}>{p.full_name || p.email}</div>
              {p.trade && <div style={{ fontSize: 11, color: '#9CA3AF' }}>{p.trade}</div>}
            </div>
            <button onClick={() => unassignSub(p)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4, fontSize: 16, lineHeight: 1 }} title="Remove">✕</button>
          </div>
        ); })}
      </div>

      <button className="btn btn-danger" style={{ width: '100%', marginTop: 8, padding: 11 }} onClick={del}>Delete Job</button>

      {showSubPicker && <div className="overlay" onClick={() => setShowSubPicker(false)}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-title">Assign Sub</div>
        {!allSubs.length && <div style={{ textAlign: 'center', padding: 20, color: '#9CA3AF', fontSize: 13 }}>No subs in directory yet.</div>}
        {allSubs.filter(s => !jobSubs.find(js => js.sub_id === s.id)).map(s => (
          <button key={s.id} onClick={() => assignSub(s)} style={{ width: '100%', background: '#fff', border: '1px solid #E8E4DC', padding: '12px 14px', cursor: 'pointer', textAlign: 'left', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }} onMouseEnter={e => e.currentTarget.style.borderColor = '#C9A84C'} onMouseLeave={e => e.currentTarget.style.borderColor = '#E8E4DC'}>
            <div style={{ width: 32, height: 32, background: '#0A1F4422', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#0A1F44' }}>{(s.full_name || s.email || '?')[0].toUpperCase()}</div>
            <div><div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44' }}>{s.full_name || s.email}</div>{s.trade && <div style={{ fontSize: 11, color: '#9CA3AF' }}>{s.trade}</div>}</div>
          </button>
        ))}
        <button className="btn btn-ghost" style={{ width: '100%', marginTop: 4 }} onClick={() => setShowSubPicker(false)}>Cancel</button>
      </div></div>}
      {showContract && <ContractModal job={job} onClose={() => setShowContract(false)} onSent={(email, name) => { upd({ client_email: email, client_name: name }); setShowContract(false); setContractSentBanner(email); setTimeout(() => setContractSentBanner(''), 4000); }} proposalDoc={proposalDoc} />}
      {showCompletion && <CompletionSignoffModal job={job} onClose={() => setShowCompletion(false)} onSigned={() => setShowCompletion(false)} />}
    </div>
  );
}
