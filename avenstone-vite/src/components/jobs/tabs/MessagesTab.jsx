import { useState, useEffect, useRef } from 'react';
import { AV_USER_ID, sbLoadMessages, sbPostMessage, sbNotify } from '../../../lib/supabase';
import { Ic, fDT } from '../../../lib/utils';

export default function MessagesTab({ job }) {
  const [msgs, setMsgs] = useState([]);
  const [msgsLoaded, setMsgsLoaded] = useState(false);
  const [msgTxt, setMsgTxt] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const msgsEndRef = useRef();

  useEffect(() => {
    if (msgsLoaded) return;
    sbLoadMessages(job.id).then(d => { setMsgs(d); setMsgsLoaded(true); });
  }, [msgsLoaded]);

  useEffect(() => {
    if (msgs.length && msgsEndRef.current) msgsEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  const sendMsg = async () => {
    if (!msgTxt.trim()) return;
    setSendingMsg(true);
    const m = await sbPostMessage(job.id, msgTxt.trim());
    if (m) {
      setMsgs(p => [...p, m]);
      sbNotify('job_message', `Message on ${job.address}`, msgTxt.trim().slice(0, 120), job.id, AV_USER_ID);
      setMsgTxt('');
    }
    setSendingMsg(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 400 }}>
      {!msgsLoaded && <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF', fontSize: 13 }}>Loading messages...</div>}
      {msgsLoaded && <>
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
          {!msgs.length && <div className="empty">{Ic.note}<div className="empty-t">No messages yet</div><div>Start the conversation below</div></div>}
          {msgs.map(m => {
            const mine = m.sender_id === AV_USER_ID;
            const nm = m.sender?.full_name || 'Unknown';
            const rl = m.sender?.role || '';
            const roleBadge = { owner: 'Owner', sales_rep: 'Sales', project_manager: 'PM', sub: 'Sub', client: 'Client' }[rl] || rl;
            return (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  {!mine && <div style={{ width: 24, height: 24, background: '#0A1F4422', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#0A1F44' }}>{nm[0].toUpperCase()}</div>}
                  <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600 }}>{mine ? 'You' : nm}</span>
                  {!mine && roleBadge && <span style={{ fontSize: 9, background: '#E8E4DC', color: '#6B7280', padding: '1px 6px', borderRadius: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{roleBadge}</span>}
                  <span style={{ fontSize: 10, color: '#D1C9B8' }}>{fDT(m.created_at)}</span>
                </div>
                <div style={{ maxWidth: '80%', background: mine ? '#0A1F44' : '#fff', color: mine ? '#fff' : '#374151', padding: '10px 14px', borderRadius: mine ? '12px 12px 2px 12px' : '12px 12px 12px 2px', fontSize: 13, lineHeight: 1.55, border: mine ? 'none' : '1px solid #E8E4DC', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>{m.content}</div>
              </div>
            );
          })}
          <div ref={msgsEndRef} />
        </div>
        <div style={{ borderTop: '1px solid #E8E4DC', paddingTop: 12, flexShrink: 0, background: '#F7F5F0' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea className="finp fta" value={msgTxt} onChange={e => setMsgTxt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }} placeholder="Type a message… (Enter to send)" rows={2} style={{ flex: 1, marginBottom: 0, resize: 'none' }} />
            <button className={`btn ${msgTxt.trim() ? 'btn-navy' : 'btn-ghost'}`} style={{ padding: '10px 16px', flexShrink: 0 }} onClick={sendMsg} disabled={sendingMsg || !msgTxt.trim()}>{sendingMsg ? '...' : 'Send'}</button>
          </div>
        </div>
      </>}
    </div>
  );
}
