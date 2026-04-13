import { Ic, fDT } from '../../lib/utils';

export default function NotifPanel({ notifs, onClose, onMarkAllRead, onClickNotif }) {
  const unread = notifs.filter(n => !n.read).length;
  const typeIcon = { note_posted: 'note', phase_complete: 'check', co_submitted: 'warn', co_approved: 'check', co_rejected: 'warn', message: 'note', assigned_to_job: 'home', phase_overdue: 'warn', document_uploaded: 'folder', daily_log_submitted: 'clip', contract_unsigned: 'doc', payment_overdue: 'warn', phase_starting_soon: 'sched', no_daily_log: 'clip', co_pending_approval: 'warn', job_stale: 'info', new_lead: 'plus' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,31,68,0.45)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 400, background: '#fff', display: 'flex', flexDirection: 'column', height: '100%', boxShadow: '-8px 0 32px rgba(10,31,68,0.2)' }}>
        <div style={{ padding: '20px 20px 16px', paddingTop: 'max(20px,calc(env(safe-area-inset-top) + 12px))', borderBottom: '1px solid #E8E4DC', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: '#0A1F44', flex: 1 }}>Notifications</div>
          {unread > 0 && <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 12px' }} onClick={onMarkAllRead}>Mark all read</button>}
          {unread > 0 && <span style={{ background: '#C9A84C', color: '#0A1F44', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>{unread}</span>}
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4, display: 'flex', alignItems: 'center', width: 28, height: 28 }}>
            <span style={{ width: 18, height: 18, display: 'flex' }}>{Ic.back}</span>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {!notifs.length && <div className="empty" style={{ paddingTop: 60 }}>{Ic.bell}<div className="empty-t">All clear</div><div>No notifications yet</div></div>}
          {notifs.map(n => (
            <div key={n.id} onClick={() => onClickNotif(n)}
              style={{ padding: '14px 20px', borderBottom: '1px solid #F3F0E8', cursor: 'pointer', background: n.read ? '#fff' : 'rgba(201,168,76,0.04)', display: 'flex', gap: 12, alignItems: 'flex-start' }}
              onMouseEnter={e => e.currentTarget.style.background = '#F7F5F0'}
              onMouseLeave={e => e.currentTarget.style.background = n.read ? '#fff' : 'rgba(201,168,76,0.04)'}
            >
              <div style={{ width: 32, height: 32, background: n.read ? '#F7F5F0' : 'rgba(201,168,76,0.12)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: n.read ? '#9CA3AF' : '#C9A84C' }}>
                <span style={{ width: 14, height: 14, display: 'flex' }}>{Ic[typeIcon[n.type]] || Ic.bell}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: n.read ? 400 : 600, color: '#0A1F44', marginBottom: 2, lineHeight: 1.4 }}>{n.title}</div>
                {n.body && <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.5, marginBottom: 4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{n.body}</div>}
                <div style={{ fontSize: 11, color: '#9CA3AF' }}>{fDT(n.created_at)}</div>
              </div>
              {!n.read && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#C9A84C', flexShrink: 0, marginTop: 5 }} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
