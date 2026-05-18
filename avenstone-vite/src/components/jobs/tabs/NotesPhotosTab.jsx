import { useState, useRef } from 'react';
import { sb, AV_USER_ID, sbNote, sbPhoto, sbLabelPhoto, sbNotify } from '../../../lib/supabase';
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
    if (s.ok) {
      upd({ activity: [s.data, ...(job.activity || [])] });
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
  const [uplErr, setUplErr] = useState(null);
  const [lbIdx, setLbIdx] = useState(null);
  const pr = useRef();   // gallery picker
  const vr = useRef();   // video gallery picker
  const cr = useRef();   // direct camera capture (photo)
  const cvr = useRef();  // direct camera capture (video)

  const labelPhoto = async (photoId, newLabel) => {
    await sbLabelPhoto(job.id, photoId, newLabel);
    upd({ photos: (job.photos || []).map(p => {
      if (p.id === photoId) return { ...p, label: newLabel };
      if (newLabel && p.label === newLabel) return { ...p, label: null };
      return p;
    })});
  };

  const onFile = async e => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUpl(true); setUplPct(0); setUplErr(null);
    const res = [];
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      const p = await sbPhoto(job.id, files[i]);
      if (p.ok) res.push(p.data);
      else failed++;
      setUplPct(Math.round(((i + 1) / files.length) * 100));
    }
    if (res.length) upd({ photos: [...(job.photos || []), ...res] });
    setUpl(false); setUplPct(0);
    if (failed) setUplErr(`${failed} photo${failed > 1 ? 's' : ''} failed to save — check your connection and try again.`);
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
      {/* Hidden inputs */}
      <input ref={pr}  type="file" accept="image/*" multiple onChange={onFile} style={{ display: 'none' }} />
      <input ref={vr}  type="file" accept="video/*" multiple onChange={onFile} style={{ display: 'none' }} />
      <input ref={cr}  type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: 'none' }} />
      <input ref={cvr} type="file" accept="video/*" capture="environment" onChange={onFile} style={{ display: 'none' }} />

      {/* Primary: direct camera buttons */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
        <button
          className="btn btn-navy"
          style={{ flex: 1, padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14, fontWeight: 700 }}
          onClick={() => cr.current.click()} disabled={upl}>
          📷 Take Photo
        </button>
        <button
          className="btn btn-navy"
          style={{ flex: 1, padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14, fontWeight: 700 }}
          onClick={() => cvr.current.click()} disabled={upl}>
          🎥 Record Video
        </button>
      </div>

      {/* Secondary: choose from library */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <button className="btn btn-ghost" style={{ flex: 1, padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12 }} onClick={() => pr.current.click()} disabled={upl}>
          <span style={{ width: 14, height: 14 }}>{Ic.cam}</span>From Library
        </button>
        <button className="btn btn-ghost" style={{ flex: 1, padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12 }} onClick={() => vr.current.click()} disabled={upl}>
          <span style={{ width: 14, height: 14 }}>{Ic.vid}</span>From Library
        </button>
      </div>
      {upl && <div className="upbar"><div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Uploading to cloud</span><span style={{ fontSize: 11, color: '#C9A84C', fontWeight: 700 }}>{uplPct}%</span></div><div className="uptr"><div className="upfl" style={{ width: `${uplPct}%` }} /></div></div>}
      {uplErr && <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#991B1B', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>{uplErr}</span><button onClick={() => setUplErr(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991B1B', fontSize: 14, lineHeight: 1, marginLeft: 8 }}>✕</button></div>}
      {!(job.photos || []).length && !upl && <div className="empty">{Ic.cam}<div className="empty-t">No photos yet</div><div>Tap Add Photos to get started</div></div>}
      {/* Before/After hint */}
      {(job.photos || []).length > 0 && (
        <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ background: 'rgba(0,0,0,0.08)', padding: '2px 7px', borderRadius: 4, fontWeight: 700 }}>B</span>
          <span style={{ background: '#C9A84C22', color: '#C9A84C', padding: '2px 7px', borderRadius: 4, fontWeight: 700 }}>A</span>
          <span>Tap B/A on a photo to label it for the completion package</span>
        </div>
      )}
      <div className="pgrid">
        {(job.photos || []).map((p, i) => (
          <div key={p.id} className="pcell" onClick={() => setLbIdx(i)} style={{ cursor: 'pointer' }}>
            <div style={{ position: 'absolute', inset: 0 }}>
              {p.type === 'video' ? <video src={p.url || p.data} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={p.url || p.data} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <button className="pdel" onClick={e => { e.stopPropagation(); delP(p.id); }}>✕</button>
            {/* Label badge */}
            {p.label === 'before' && (
              <div style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 9, fontWeight: 800, letterSpacing: 1.5, padding: '3px 8px', borderRadius: 20, textTransform: 'uppercase', pointerEvents: 'none' }}>Before</div>
            )}
            {p.label === 'after' && (
              <div style={{ position: 'absolute', top: 6, left: 6, background: '#C9A84C', color: '#0A1F44', fontSize: 9, fontWeight: 800, letterSpacing: 1.5, padding: '3px 8px', borderRadius: 20, textTransform: 'uppercase', pointerEvents: 'none' }}>After</div>
            )}
            {/* Label buttons */}
            {p.type !== 'video' && (
              <div style={{ position: 'absolute', bottom: 5, right: 5, display: 'flex', gap: 3 }} onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => labelPhoto(p.id, p.label === 'before' ? null : 'before')}
                  style={{ background: p.label === 'before' ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.5)', border: p.label === 'before' ? '1.5px solid #fff' : '1px solid rgba(255,255,255,0.35)', color: '#fff', fontSize: 9, fontWeight: 800, padding: '3px 7px', borderRadius: 4, cursor: 'pointer', letterSpacing: 0.5 }}>
                  B
                </button>
                <button
                  onClick={() => labelPhoto(p.id, p.label === 'after' ? null : 'after')}
                  style={{ background: p.label === 'after' ? '#C9A84C' : 'rgba(0,0,0,0.5)', border: p.label === 'after' ? '1.5px solid #C9A84C' : '1px solid rgba(255,255,255,0.35)', color: p.label === 'after' ? '#0A1F44' : '#fff', fontSize: 9, fontWeight: 800, padding: '3px 7px', borderRadius: 4, cursor: 'pointer', letterSpacing: 0.5 }}>
                  A
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {lbIdx !== null && <PhotoLightbox photos={job.photos || []} startIdx={lbIdx} onClose={() => setLbIdx(null)} />}
    </div>
  );
}
