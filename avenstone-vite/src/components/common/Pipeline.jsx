import { useState } from 'react';
import { f$ } from '../../lib/utils';

const PIPELINE_COLS = [
  { id: 'lead',     lb: 'Lead',     c: '#6366f1' },
  { id: 'bid_sent', lb: 'Bid Sent', c: '#f59e0b' },
  { id: 'signed',   lb: 'Signed',   c: '#22c55e' },
  { id: 'active',   lb: 'Active',   c: '#0A1F44', ids: ['demo','framing','rough_mep','drywall','finish','punch'] },
  { id: 'complete', lb: 'Complete', c: '#9CA3AF' },
  { id: 'on_hold',  lb: 'On Hold',  c: '#ef4444' },
];

export default function Pipeline({ jobs, onStatusChange, onOpenJob }) {
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const colJobs = col => {
    if (col.ids) return jobs.filter(j => col.ids.includes(j.status));
    return jobs.filter(j => j.status === col.id);
  };

  const drop = async colId => {
    if (!dragging || dragging === colId) return;
    const newStatus = colId === 'active' ? 'demo' : colId;
    onStatusChange(dragging, newStatus);
    setDragging(null); setDragOver(null);
  };

  const colVal = col => colJobs(col).reduce((a, j) => a + Number(j.contract_value || 0), 0);

  return (
    <div style={{ overflowX: 'auto', padding: '0 0 16px' }}>
      <div style={{ display: 'flex', gap: 12, minWidth: PIPELINE_COLS.length * 220 + 'px' }}>
        {PIPELINE_COLS.map(col => {
          const cj = colJobs(col);
          const val = colVal(col);
          const isOver = dragOver === col.id;
          return (
            <div key={col.id}
              onDragOver={e => { e.preventDefault(); setDragOver(col.id); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => drop(col.id)}
              style={{ flex: '0 0 210px', background: isOver ? 'rgba(201,168,76,0.06)' : '#F7F5F0', border: `2px dashed ${isOver ? '#C9A84C' : '#E8E4DC'}`, borderRadius: 6, padding: 10, minHeight: 300, transition: 'all 0.15s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: col.c, flexShrink: 0 }} />
                <div style={{ fontSize: 11, fontWeight: 700, color: '#0A1F44', textTransform: 'uppercase', letterSpacing: 1, flex: 1 }}>{col.lb}</div>
                <span style={{ fontSize: 10, background: col.c + '18', color: col.c, padding: '1px 7px', fontWeight: 700 }}>{cj.length}</span>
              </div>
              {val > 0 && <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 8, fontWeight: 600 }}>{f$(val)}</div>}
              {cj.map(j => (
                <div key={j.id}
                  draggable
                  onDragStart={() => setDragging(j.id)}
                  onDragEnd={() => { setDragging(null); setDragOver(null); }}
                  onClick={() => onOpenJob(j)}
                  style={{ background: '#fff', border: '1px solid #E8E4DC', borderLeft: `3px solid ${col.c}`, padding: '10px 12px', marginBottom: 8, cursor: 'grab', userSelect: 'none', opacity: dragging === j.id ? 0.4 : 1, transition: 'box-shadow 0.1s', boxShadow: dragging === j.id ? 'none' : '0 1px 3px rgba(0,0,0,0.04)' }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(10,31,68,0.12)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = dragging === j.id ? 'none' : '0 1px 3px rgba(0,0,0,0.04)'}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#0A1F44', marginBottom: 3, lineHeight: 1.4 }}>{j.address}</div>
                  {j.client_name && <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 3 }}>{j.client_name}</div>}
                  {Number(j.contract_value) > 0 && <div style={{ fontSize: 11, fontWeight: 700, color: '#C9A84C' }}>{f$(Number(j.contract_value))}</div>}
                  {j.assigned_rep && <div style={{ fontSize: 10, color: '#D1C9B8', marginTop: 3 }}>{j.assigned_rep}</div>}
                </div>
              ))}
              {!cj.length && <div style={{ textAlign: 'center', padding: '20px 0', color: '#D1C9B8', fontSize: 12, fontStyle: 'italic' }}>Drop here</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
