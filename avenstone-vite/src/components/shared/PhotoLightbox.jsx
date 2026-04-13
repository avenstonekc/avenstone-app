import { useState, useEffect } from 'react';

export default function PhotoLightbox({ photos, startIdx, onClose }) {
  const [idx, setIdx] = useState(startIdx || 0);
  const p = photos[idx];

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'ArrowRight') setIdx(i => Math.min(i + 1, photos.length - 1));
      else if (e.key === 'ArrowLeft') setIdx(i => Math.max(i - 1, 0));
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [photos.length, onClose]);

  if (!p) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 20, background: 'transparent', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer', lineHeight: 1 }}>✕</button>
      <div style={{ position: 'absolute', top: 16, left: 20, color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{idx + 1} / {photos.length}</div>
      <div style={{ maxWidth: '90vw', maxHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
        {p.type === 'video'
          ? <video src={p.url || p.data} controls style={{ maxWidth: '90vw', maxHeight: '80vh', borderRadius: 4 }} />
          : <img src={p.url || p.data} alt="" style={{ maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 4 }} />}
      </div>
      {photos.length > 1 && <>
        <button onClick={e => { e.stopPropagation(); setIdx(i => Math.max(i - 1, 0)); }} disabled={idx === 0} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', width: 40, height: 40, borderRadius: '50%', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: idx === 0 ? 0.3 : 1 }}>‹</button>
        <button onClick={e => { e.stopPropagation(); setIdx(i => Math.min(i + 1, photos.length - 1)); }} disabled={idx === photos.length - 1} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', width: 40, height: 40, borderRadius: '50%', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: idx === photos.length - 1 ? 0.3 : 1 }}>›</button>
        <div style={{ position: 'absolute', bottom: 20, display: 'flex', gap: 6 }}>
          {photos.map((_, i) => <div key={i} onClick={e => { e.stopPropagation(); setIdx(i); }} style={{ width: i === idx ? 20 : 6, height: 6, borderRadius: 3, background: i === idx ? '#C9A84C' : 'rgba(255,255,255,0.3)', cursor: 'pointer', transition: 'all 0.2s' }} />)}
        </div>
      </>}
    </div>
  );
}
