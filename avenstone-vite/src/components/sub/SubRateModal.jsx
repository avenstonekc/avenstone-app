import { useState, useEffect } from 'react';
import { sbLoadSubRatings, sbSubmitRating } from '../../lib/supabase';
import StarRating from '../shared/StarRating';

export default function SubRateModal({ sub, onClose, profile }) {
  const [ratings, setRatings] = useState([]);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const canRate = profile && ['client', 'sales_rep', 'owner'].includes(profile.role);

  useEffect(() => { sbLoadSubRatings(sub.id).then(setRatings); }, [sub.id]);

  const avg = ratings.length ? ratings.reduce((a, r) => a + r.stars, 0) / ratings.length : 0;

  const submit = async () => {
    if (!stars) return;
    setSaving(true);
    const { error } = await sbSubmitRating(sub.id, stars, comment, null);
    if (!error) { setDone(true); sbLoadSubRatings(sub.id).then(setRatings); }
    setSaving(false);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div className="modal-title" style={{ marginBottom: 4 }}>{sub.full_name || sub.email}</div>
            {sub.trade && <div style={{ fontSize: 12, color: '#C9A84C', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>{sub.trade}</div>}
          </div>
          {ratings.length > 0 && <div style={{ textAlign: 'right' }}>
            <StarRating value={Math.round(avg)} readonly size={16} />
            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{avg.toFixed(1)} avg · {ratings.length} review{ratings.length !== 1 ? 's' : ''}</div>
          </div>}
        </div>
        {canRate && !done && <div style={{ background: '#F7F5F0', border: '1px solid #E8E4DC', borderRadius: 6, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44', marginBottom: 10 }}>Leave a Rating</div>
          <div style={{ marginBottom: 12 }}><StarRating value={stars} onChange={setStars} size={28} /></div>
          <textarea className="finp" rows={2} placeholder="Optional comment..." value={comment} onChange={e => setComment(e.target.value)} style={{ resize: 'vertical' }} />
          <button className="btn btn-navy" style={{ marginTop: 10, width: '100%' }} onClick={submit} disabled={saving || !stars}>{saving ? 'Saving...' : 'Submit Rating'}</button>
        </div>}
        {done && <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#16a34a', padding: '10px 14px', borderRadius: 4, fontSize: 13, marginBottom: 16, fontWeight: 600 }}>Rating submitted — thank you!</div>}
        {ratings.length > 0 && <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Reviews</div>
          {ratings.map(r => (
            <div key={r.id} style={{ borderBottom: '1px solid #F3F4F6', paddingBottom: 10, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <StarRating value={r.stars} readonly size={14} />
                <span style={{ fontSize: 11, color: '#9CA3AF' }}>{r.rater?.full_name || 'Anonymous'} · {new Date(r.created_at).toLocaleDateString()}</span>
              </div>
              {r.comment && <div style={{ fontSize: 13, color: '#6B7280' }}>{r.comment}</div>}
            </div>
          ))}
        </div>}
        {!ratings.length && !canRate && <div style={{ textAlign: 'center', padding: '20px 0', color: '#9CA3AF', fontSize: 13 }}>No ratings yet</div>}
        <button className="btn btn-ghost" style={{ width: '100%', marginTop: 4 }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
