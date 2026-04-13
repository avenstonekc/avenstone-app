import { useState } from 'react';
import { sb } from '../../lib/supabase';

export default function PushEnableButton({ profile }) {
  const [status, setStatus] = useState(() => {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  });
  const [loading, setLoading] = useState(false);

  const enable = async () => {
    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setStatus(perm);
      if (perm === 'granted') {
        const reg = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        const VAPID_PUBLIC = 'BOwPGVdaON00Aqor0hyG7HLR6nx9VX3YA1FhlrwahMiBnBhAqTk_zPUu6BfuQ0F0aRh70r7ru0uxrDR4Is5DVXI';
        const b64ToUint8 = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
        let sub = await reg.pushManager.getSubscription();
        if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(VAPID_PUBLIC) });
        const { endpoint, keys } = sub.toJSON();
        await sb.from('push_subscriptions').upsert({ user_id: profile.id, endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: 'user_id,endpoint' });
      }
    } catch (e) { console.warn('push enable error', e); }
    setLoading(false);
  };

  if (status === 'unsupported') return null;

  if (status === 'granted') return (
    <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 4, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <span style={{ color: '#16a34a', fontSize: 16 }}>✓</span>
      <span style={{ color: '#16a34a', fontWeight: 600 }}>Push notifications enabled on this device</span>
    </div>
  );

  if (status === 'denied') return (
    <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 4, padding: '10px 14px', fontSize: 12, color: '#DC2626' }}>
      Notifications blocked. Go to your browser/phone Settings → Notifications → find this site and allow it.
    </div>
  );

  return (
    <button className="btn btn-outline" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={enable} disabled={loading}>
      <span style={{ fontSize: 16 }}>🔔</span>{loading ? 'Enabling...' : 'Enable Push Notifications on This Device'}
    </button>
  );
}
