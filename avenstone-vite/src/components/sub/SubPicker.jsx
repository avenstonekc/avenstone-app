import { useState } from 'react';

export default function SubPicker({ subs = [], exclude = [], onSelect, emptyMsg = 'No subs found' }) {
  const [q, setQ] = useState('');
  const lower = q.toLowerCase();
  const filtered = subs.filter(s =>
    !exclude.includes(s.id) &&
    (s.full_name?.toLowerCase().includes(lower) || s.trade?.toLowerCase().includes(lower))
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input
        autoFocus
        placeholder="Search by name or trade…"
        value={q}
        onChange={e => setQ(e.target.value)}
        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #374151', background: '#1f2937', color: '#f9fafb', fontSize: 14, outline: 'none' }}
      />
      <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filtered.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: 14, textAlign: 'center', padding: '16px 0' }}>{emptyMsg}</p>
        ) : filtered.map(s => (
          <button
            key={s.id}
            onClick={() => onSelect(s)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#111827', border: '1px solid #374151', borderRadius: 8, cursor: 'pointer', textAlign: 'left' }}
          >
            <span style={{ fontWeight: 600, color: '#f9fafb', fontSize: 14 }}>{s.full_name}</span>
            {s.trade && <span style={{ fontSize: 12, color: '#9ca3af' }}>{s.trade}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
