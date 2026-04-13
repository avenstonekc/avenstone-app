import { useRef, useState } from 'react';

export default function SignaturePad({ onSave, onCancel, label = 'Draw your signature below' }) {
  const cvs = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [empty, setEmpty] = useState(true);

  const getXY = (e, el) => {
    const r = el.getBoundingClientRect();
    if (e.touches) return [e.touches[0].clientX - r.left, e.touches[0].clientY - r.top];
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const down = e => {
    e.preventDefault();
    const c = cvs.current;
    const ctx = c.getContext('2d');
    const [x, y] = getXY(e, c);
    ctx.beginPath(); ctx.moveTo(x, y);
    setDrawing(true); setEmpty(false);
  };

  const move = e => {
    if (!drawing) return;
    e.preventDefault();
    const c = cvs.current;
    const ctx = c.getContext('2d');
    ctx.strokeStyle = '#0A1F44'; ctx.lineWidth = 2;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const [x, y] = getXY(e, c);
    ctx.lineTo(x, y); ctx.stroke();
  };

  const up = () => setDrawing(false);

  const clear = () => {
    const c = cvs.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    setEmpty(true);
  };

  const save = () => {
    if (empty) return;
    onSave(cvs.current.toDataURL('image/png'));
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #E8E4DC', borderRadius: 6, padding: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#0A1F44', marginBottom: 8 }}>{label}</div>
      <canvas
        ref={cvs} width={460} height={140}
        style={{ display: 'block', border: '2px solid #C9A84C', borderRadius: 4, cursor: 'crosshair', touchAction: 'none', maxWidth: '100%', background: '#FAFAF8' }}
        onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={up}
        onTouchStart={down} onTouchMove={move} onTouchEnd={up}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={clear}>Clear</button>
        {onCancel && <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>}
        <button className={`btn ${empty ? 'btn-ghost' : 'btn-gold'}`} style={{ flex: 2 }} onClick={save} disabled={empty}>Sign & Submit</button>
      </div>
    </div>
  );
}
