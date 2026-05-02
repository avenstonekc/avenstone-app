import { useState, useEffect, useRef } from 'react';
import { AV_USER_ID, sbLoadMessages, sbPostMessage, sbNotify, sbNotifyEmail, sbLoadStaffMessages, sbPostStaffMessage } from '../../../lib/supabase';
import { Ic, fDT } from '../../../lib/utils';

export default function MessagesTab({ job, profile }) {
  const [thread, setThread] = useState('general'); // 'general' | 'staff'
  const [msgs, setMsgs] = useState([]);
  const [msgsLoaded, setMsgsLoaded] = useState(false);
  const [msgTxt, setMsgTxt] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const msgsEndRef = useRef();
  const [staffMsgs, setStaffMsgs] = useState([]);
  const [staffMsgsLoaded, setStaffMsgsLoaded] = useState(false);
  const [staffMsgTxt, setStaffMsgTxt] = useState('');
  const [sendingStaffMsg, setSendingStaffMsg] = useState(false);
  const staffMsgsEndRef = useRef();

  useEffect(() => {
    if (msgsLoaded) return;
    sbLoadMessages(job.id).then(d => { setMsgs(d); setMsgsLoaded(true); });
  }, [msgsLoaded]);

  useEffect(() => {
    if (thread !== 'staff' || staffMsgsLoaded) return;
    sbLoadStaffMessages(job.id).then(d => { setStaffMsgs(d); setStaffMsgsLoaded(true); });
  }, [thread, staffMsgsLoaded]);

  useEffect(() => {
    if (msgs.length && msgsEndRef.current) msgsEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  useEffect(() => {
    if (staffMsgs.length && staffMsgsEndRef.current) staffMsgsEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [staffMsgs]);

  const sendMsg = async () => {
    if (!msgTxt.trim()) return;
    setSendingMsg(true);
    const m = await sbPostMessage(job.id, msgTxt.trim());
    if (m.ok) {
      setMsgs(p => [...p, m.data]);
      sbNotify('job_message', `Message on ${job.address}`, msgTxt.trim().slice(0, 120), job.id, AV_USER_ID);
      sbNotifyEmail(job.client_user_id, `New message on your project`, msgTxt.trim().slice(0, 160), job.id);
      setMsgTxt('');
    }
    setSendingMsg(false);
  };

  const sendStaffMsg = async () => {
    if (!staffMsgTxt.trim()) return;
    setSendingStaffMsg(true);
    const m = await sbPostStaffMessage(job.id, staffMsgTxt.trim());
    if (m.ok) {
      setStaffMsgs(p => [...p, m.data]);
      sbNotify('staff_message', `Staff message — ${job.address}`, staffMsgTxt.trim().slice(0, 120), job.id, AV_USER_ID);
      setStaffMsgTxt('');
    }
    setSendingStaffMsg(false);
  };

  const renderThread = (messages, loaded, sendFn, txt, setTxt, sending, endRef, isStaff) => (
    <>
      {!loaded && <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF', fontSize: 13 }}>Loading messages...</div>}
      {loaded && <>
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
          {!messages.length && <div className="empty">{Ic.note}<div className="empty-t">No messages yet</div><div>{isStaff ? 'Staff-only thread — not visible to the client' : 'Start the conversation below'}</div></div>}
          {messages.map(m => {
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
          <div ref={endRef} />
        </div>
        <div style={{ borderTop: '1px solid #E8E4DC', paddingTop: 12, flexShrink: 0, background: '#F7F5F0' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea className="finp fta" value={txt} onChange={e => setTxt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFn(); } }} placeholder="Type a message… (Enter to send)" rows={2} style={{ flex: 1, marginBottom: 0, resize: 'none' }} />
            <button className={`btn ${txt.trim() ? 'btn-navy' : 'btn-ghost'}`} style={{ padding: '10px 16px', flexShrink: 0 }} onClick={sendFn} disabled={sending || !txt.trim()}>{sending ? '...' : 'Send'}</button>
          </div>
        </div>
      </>}
    </>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 400 }}>
      {/* Thread switcher */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 12, border: '1px solid #E8E4DC', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
        <button onClick={() => setThread('general')} style={{ flex: 1, padding: '8px 12px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: thread === 'general' ? '#0A1F44' : '#fff', color: thread === 'general' ? '#fff' : '#6B7280' }}>
          Client Thread
        </button>
        <button onClick={() => setThread('staff')} style={{ flex: 1, padding: '8px 12px', fontSize: 12, fontWeight: 600, border: 'none', borderLeft: '1px solid #E8E4DC', cursor: 'pointer', background: thread === 'staff' ? '#0A1F44' : '#fff', color: thread === 'staff' ? '#fff' : '#6B7280' }}>
          PM / Sub Chat
        </button>
      </div>
      {thread === 'general' && renderThread(msgs, msgsLoaded, sendMsg, msgTxt, setMsgTxt, sendingMsg, msgsEndRef, false)}
      {thread === 'staff' && renderThread(staffMsgs, staffMsgsLoaded, sendStaffMsg, staffMsgTxt, setStaffMsgTxt, sendingStaffMsg, staffMsgsEndRef, true)}
    </div>
  );
}
