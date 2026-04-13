import { useState, useRef } from 'react';
import { sb, AV_USER_ID, sbNote, sbPhoto, sbNotify } from '../../../lib/supabase';
import { Ic, fDT } from '../../../lib/utils';
import PhotoLightbox from '../../shared/PhotoLightbox';

export function NotesTab({ job, upd, profile }) {
  const [nt, setNt] = useState('');
  const [na, setNa] = useState(() => profile?.full_name || 'Kalin');
  const [saving, setSaving] = useState(false);

  const addNote = async () => {
    if (!nt.trim()) return;
    setSaving(true);
    const s = await sbNote(job.id, nt.trim(), na);
    if (s) {
      upd({ activity: [s, ...(job.activity || [])] });
      sbNotify('note_posted', `Note on ${job.address}`, nt.trim().slice(0, 120), job.id, AV_USER_ID);
      setNt('');
    }
    setSaving(false);
  };

  return (
    <div>
      <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 10 }}>Posting as <strong style={{ color: '#0A1F44' }}>{na}</strong></div>
        <textarea className="finp fta" value={nt} onChange={e => setNt(e.target.value)} placeholder="Site conditions, phase updates, sub notes..." rows={3} style={{ marginBottom: 10 }} />
        <button className={`btn ${nt.trim() ? 'btn-navy' : 'btn-ghost'}`} style={{ width: '100%' }} onClick={addNote} disabled={saving || !nt.trim()}>{saving ? 'Saving...' : 'Add Note'}</button>
      </div>
      {!(job.activity || []).length && <div className="empty">{Ic.note}<div className="empty-t">No notes yet</div><div>Add the first note above</div></div>}
      {(job.activity || []).map((n, i) => (
        <div key={n.id || i} className="note-item">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#0A1F44', textTransform: 'uppercase', letterSpacing: 1 }}>{n.author}</span>
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>{fDT(n.created_at)}</span>
          </div>
          <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.7 }}>{n.content}</div>
        </div>
      ))}
    </div>
  );
}

export function PhotosTab({ job, upd }) {
  const [upl, setUpl] = useState(false);
  const [uplPct, setUplPct] = useState(0);
  const [lbIdx, setLbIdx] = useState(null);
  const pr = useRef();
  const vr = useRef();

  const onFile = async e => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUpl(true); setUplPct(0);
    const res = [];
    for (let i = 0; i < files.length; i++) {
      const p = await sbPhoto(job.id, files[i]);
      if (p) res.push(p);
      setUplPct(Math.round(((i + 1) / files.length) * 100));
    }
    if (res.length) upd({ photos: [...(job.photos || []), ...res] });
    setUpl(false); setUplPct(0);
  };

  const delP = async id => {
    const p = (job.photos || []).find(x => x.id === id);
    if (p?.url) {
      try {
        const path = p.url.split('/job-photos/')[1];
        if (path) await sb.storage.from('job-photos').remove([path]);
        await sb.from('photos').delete().eq('id', id);
      } catch (e) {}
    }
    upd({ photos: (job.photos || []).filter(x => x.id !== id) });
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input ref={pr} type="file" accept="image/*" multiple onChange={onFile} style={{ display: 'none' }} />
        <input ref={vr} type="file" accept="video/*" multiple onChange={onFile} style={{ display: 'none' }} />
        <button className="btn btn-outline" style={{ flex: 1, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={() => pr.current.click()} disabled={upl}><span style={{ width: 16, height: 16 }}>{Ic.cam}</span>Add Photos</button>
        <button className="btn btn-outline" style={{ flex: 1, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={() => vr.current.click()} disabled={upl}><span style={{ width: 16, height: 16 }}>{Ic.vid}</span>Add Video</button>
      </div>
      {upl && <div className="upbar"><div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Uploading to cloud</span><span style={{ fontSize: 11, color: '#C9A84C', fontWeight: 700 }}>{uplPct}%</span></div><div className="uptr"><div className="upfl" style={{ width: `${uplPct}%` }} /></div></div>}
      {!(job.photos || []).length && !upl && <div className="empty">{Ic.cam}<div className="empty-t">No photos yet</div><div>Tap Add Photos to get started</div></div>}
      <div className="pgrid">
        {(job.photos || []).map((p, i) => (
          <div key={p.id} className="pcell" onClick={() => setLbIdx(i)} style={{ cursor: 'pointer' }}>
            <div style={{ position: 'absolute', inset: 0 }}>
              {p.type === 'video' ? <video src={p.url || p.data} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={p.url || p.data} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <button className="pdel" onClick={e => { e.stopPropagation(); delP(p.id); }}>✕</button>
          </div>
        ))}
      </div>
      {lbIdx !== null && <PhotoLightbox photos={job.photos || []} startIdx={lbIdx} onClose={() => setLbIdx(null)} />}
    </div>
  );
}
