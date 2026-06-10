import { useState } from 'react';
import { sbShareFolderBundle } from '../../../../lib/supabase';

export default function ShareFolderModal({ folderLabel, files, job, onClose, onSent }) {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // Build quick-pick list from job fields (no contacts.job_id FK exists)
  const quickPicks = [];
  if (job?.client_email) {
    quickPicks.push({
      label: `${job.client_name || 'Client'} (${job.client_email})`,
      email: job.client_email,
      name: job.client_name || '',
    });
  }
  if (job?.referring_realtor_email) {
    quickPicks.push({
      label: `${job.referring_realtor_name || 'Realtor'} (${job.referring_realtor_email})`,
      email: job.referring_realtor_email,
      name: job.referring_realtor_name || '',
    });
  }

  async function handleSend() {
    if (!recipientEmail.trim()) { setError('Email is required'); return; }
    setSending(true);
    setError('');
    const result = await sbShareFolderBundle({
      fileIds: files.map(f => f.id),
      recipientEmail: recipientEmail.trim(),
      recipientName: recipientName.trim() || undefined,
      message: message.trim() || undefined,
      folderLabel,
    });
    setSending(false);
    if (result?.ok) {
      onSent?.();
      onClose();
    } else {
      setError(result?.error || 'Send failed — check the console');
    }
  }

  const canSend = !!recipientEmail.trim() && !sending;
  const fileCount = files.length;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2200,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: 12, padding: 24,
          width: '100%', maxWidth: 440,
          boxShadow: '0 8px 32px rgba(10,31,68,0.18)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--navy-900)' }}>
          Share folder
        </h3>
        <p style={{ margin: '0 0 18px', fontSize: 12, color: 'var(--text-subtle)' }}>
          {folderLabel} · {fileCount} file{fileCount !== 1 ? 's' : ''} · 7-day signed links
        </p>

        {/* Quick pick */}
        {quickPicks.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Quick pick
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {quickPicks.map(q => (
                <button
                  key={q.email}
                  onClick={() => { setRecipientEmail(q.email); setRecipientName(q.name); }}
                  style={{
                    padding: '4px 10px', fontSize: 12, borderRadius: 20, cursor: 'pointer',
                    border: recipientEmail === q.email ? '1.5px solid #C9A84C' : '1px solid #E8E4DC',
                    background: recipientEmail === q.email ? '#FFFBEB' : '#F7F5F0',
                    color: 'var(--navy-900)', fontWeight: 500, transition: 'all 0.12s',
                  }}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Email */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Email *
          </label>
          <input
            type="email"
            value={recipientEmail}
            onChange={e => setRecipientEmail(e.target.value)}
            placeholder="recipient@example.com"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '8px 10px', fontSize: 14,
              border: '1px solid #E8E4DC', borderRadius: 6,
              outline: 'none', color: 'var(--navy-900)', background: '#fff',
            }}
            onFocus={e => { e.target.style.borderColor = '#C9A84C'; }}
            onBlur={e => { e.target.style.borderColor = 'var(--border)'; }}
          />
        </div>

        {/* Name */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Name (optional)
          </label>
          <input
            type="text"
            value={recipientName}
            onChange={e => setRecipientName(e.target.value)}
            placeholder="Recipient name"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '8px 10px', fontSize: 14,
              border: '1px solid #E8E4DC', borderRadius: 6,
              outline: 'none', color: 'var(--navy-900)', background: '#fff',
            }}
            onFocus={e => { e.target.style.borderColor = '#C9A84C'; }}
            onBlur={e => { e.target.style.borderColor = 'var(--border)'; }}
          />
        </div>

        {/* Message */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Message (optional)
          </label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Add a note to include in the email…"
            rows={3}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '8px 10px', fontSize: 14,
              border: '1px solid #E8E4DC', borderRadius: 6,
              outline: 'none', resize: 'vertical',
              color: 'var(--navy-900)', fontFamily: 'inherit', background: '#fff',
            }}
            onFocus={e => { e.target.style.borderColor = '#C9A84C'; }}
            onBlur={e => { e.target.style.borderColor = 'var(--border)'; }}
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{
            marginBottom: 12, padding: '8px 12px',
            background: '#FEE2E2', color: '#991b1b',
            borderRadius: 6, fontSize: 12,
          }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', fontSize: 13, borderRadius: 6,
              border: '1px solid #E8E4DC', background: '#fff',
              color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 500,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={!canSend}
            style={{
              padding: '8px 16px', fontSize: 13, borderRadius: 6,
              border: 'none',
              background: canSend ? 'var(--navy-900)' : 'var(--border)',
              color: canSend ? '#C9A84C' : 'var(--text-subtle)',
              cursor: canSend ? 'pointer' : 'default',
              fontWeight: 600, transition: 'all 0.12s',
            }}
          >
            {sending ? 'Sending…' : `Send ${fileCount} file${fileCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
