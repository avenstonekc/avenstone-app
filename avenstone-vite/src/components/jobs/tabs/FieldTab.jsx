import { useState } from 'react';
import { NotesTab, PhotosTab } from './NotesPhotosTab';
import LogsTab from './LogsTab';
import MaterialsTab from './MaterialsTab';

const SUB_TABS = [
  { id: 'notes',     lb: 'Notes' },
  { id: 'photos',    lb: 'Photos' },
  { id: 'logs',      lb: 'Daily Logs' },
  { id: 'materials', lb: 'Materials' },
];

export default function FieldTab({ job, upd, profile }) {
  const [sub, setSub] = useState('notes');

  return (
    <div>
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid #E8E4DC' }}>
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSub(t.id)} style={{
            padding: '8px 14px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: 'none', borderBottom: `2px solid ${sub === t.id ? '#C9A84C' : 'transparent'}`,
            marginBottom: -2, color: sub === t.id ? '#0A1F44' : '#9CA3AF', transition: 'color 0.15s',
          }}>
            {t.lb}
          </button>
        ))}
      </div>

      {sub === 'notes'     && <NotesTab job={job} upd={upd} profile={profile} />}
      {sub === 'photos'    && <PhotosTab job={job} upd={upd} />}
      {sub === 'logs'      && <LogsTab job={job} />}
      {sub === 'materials' && <MaterialsTab job={job} profile={profile} />}
    </div>
  );
}
