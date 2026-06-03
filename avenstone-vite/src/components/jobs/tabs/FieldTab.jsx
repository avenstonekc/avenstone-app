import { NotesTab, PhotosTab } from './NotesPhotosTab';
import LogsTab from './LogsTab';
import WalkthroughsTab from './WalkthroughsTab';

const SUB_TABS = [
  { id: 'logs',         lb: 'Daily Logs' },
  { id: 'walkthroughs', lb: 'Walkthroughs' },
  { id: 'photos',       lb: 'Photos' },
  { id: 'notes',        lb: 'Notes' },
];

export default function FieldTab({ job, upd, profile, sub, setSub, onOpenWalkthrough }) {

  return (
    <div>
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid #E8E4DC', overflowX: 'auto' }}>
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSub(t.id)} style={{
            padding: '8px 14px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: 'none', borderBottom: `2px solid ${sub === t.id ? '#C9A84C' : 'transparent'}`,
            marginBottom: -2, color: sub === t.id ? '#0A1F44' : '#9CA3AF', transition: 'color 0.15s',
            whiteSpace: 'nowrap', flex: 'none',
          }}>
            {t.lb}
          </button>
        ))}
      </div>

      {sub === 'logs'         && <LogsTab job={job} />}
      {sub === 'walkthroughs' && <WalkthroughsTab job={job} onOpenWalkthrough={onOpenWalkthrough} />}
      {sub === 'photos'       && <PhotosTab job={job} upd={upd} />}
      {sub === 'notes'        && <NotesTab job={job} upd={upd} profile={profile} />}
    </div>
  );
}
