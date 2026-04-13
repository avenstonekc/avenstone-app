import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://cbfftukmhqvvjlrlnltk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQ2ODgsImV4cCI6MjA5MTE5MDY4OH0.isj52drLT3pj7BF94Wa9w_y_f8U1M3W5AcgWsRaTwBQ'
);

function Stars({ rating, size = 16 }) {
  const full = Math.round(rating);
  return (
    <span style={{ display: 'inline-flex', gap: 1 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} style={{ fontSize: size, color: i <= full ? '#C9A84C' : '#E5E7EB', lineHeight: 1 }}>★</span>
      ))}
    </span>
  );
}

function avgRating(review) {
  const vals = [review.rating_quality, review.rating_communication, review.rating_timeliness].filter(v => v != null);
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function formatMonthYear(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function Spinner() {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7F5F0' }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        border: '4px solid #E8E4DC',
        borderTop: '4px solid #C9A84C',
        animation: 'pp-spin 0.8s linear infinite'
      }} />
    </div>
  );
}

export default function PublicProfile({ tenantId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', project_type: '', description: '' });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!tenantId) { setError(true); setLoading(false); return; }
    fetch(`https://cbfftukmhqvvjlrlnltk.supabase.co/functions/v1/get-contractor-profile?tenant=${tenantId}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [tenantId]);

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Required';
    if (!form.phone.trim()) errs.phone = 'Required';
    if (!form.email.trim()) errs.email = 'Required';
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Enter a valid email';
    return errs;
  };

  const handleSubmit = async e => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setFormErrors(errs); return; }
    setSubmitting(true);
    try {
      await sb.from('contacts').insert({
        tenant_id: tenantId,
        full_name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        project_type: form.project_type || null,
        description: form.description.trim() || null,
        source: 'network_profile',
      });
      setSubmitted(true);
    } catch {
      // silently fail — show success anyway (best UX for lead capture)
      setSubmitted(true);
    }
    setSubmitting(false);
  };

  if (loading) return (
    <>
      <style>{`@keyframes pp-spin { to { transform: rotate(360deg); } }`}</style>
      <Spinner />
    </>
  );

  if (error || !data) return (
    <div style={{ minHeight: '100dvh', background: '#F7F5F0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: '#0A1F44', marginBottom: 12 }}>Profile Not Found</h2>
        <p style={{ color: '#6B7280', fontSize: 15, lineHeight: 1.6 }}>This contractor profile wasn't found. They may not have set up their public profile yet.</p>
        <a href="https://avenstone-app.vercel.app" style={{ display: 'inline-block', marginTop: 24, padding: '12px 28px', background: '#0A1F44', color: '#fff', borderRadius: 6, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>Visit Avenstone Network</a>
      </div>
    </div>
  );

  const { company, stats, reviews = [], specialties = [], trades = [] } = data;
  const memberYear = stats?.member_since ? new Date(stats.member_since).getFullYear() : null;
  const displayedReviews = reviews.slice(0, 5);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes pp-spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { margin: 0; }
        .pp-root { font-family: 'DM Sans', sans-serif; background: #F7F5F0; color: #0A1F44; }
        .pp-topbar {
          position: sticky; top: 0; z-index: 100;
          background: #0A1F44; height: 56px;
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 20px;
        }
        .pp-logo { font-family: 'DM Serif Display', serif; font-size: 22px; color: #C9A84C; letter-spacing: 0.3px; text-decoration: none; }
        .pp-join-btn {
          border: 1.5px solid #C9A84C; background: transparent; color: #C9A84C;
          padding: 7px 16px; border-radius: 6px; font-size: 13px; font-weight: 600;
          cursor: pointer; font-family: 'DM Sans', sans-serif; text-decoration: none;
          transition: background 0.15s, color 0.15s;
        }
        .pp-join-btn:hover { background: #C9A84C; color: #0A1F44; }
        .pp-hero { background: #0A1F44; padding: 48px 20px 40px; text-align: center; }
        .pp-avatar {
          width: 80px; height: 80px; border-radius: 50%;
          background: #C9A84C; color: #0A1F44;
          font-family: 'DM Serif Display', serif; font-size: 28px; font-weight: 400;
          display: inline-flex; align-items: center; justify-content: center;
          margin-bottom: 20px; letter-spacing: 1px;
        }
        .pp-company-name { font-family: 'DM Serif Display', serif; font-size: 28px; color: #fff; margin-bottom: 6px; line-height: 1.2; }
        .pp-location { font-size: 14px; color: #C9A84C; font-weight: 500; margin-bottom: 10px; }
        .pp-tagline { font-size: 15px; color: rgba(255,255,255,0.7); font-style: italic; margin-bottom: 18px; line-height: 1.5; max-width: 520px; margin-left: auto; margin-right: auto; }
        .pp-rating-row { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 24px; }
        .pp-rating-num { font-size: 16px; color: #fff; font-weight: 600; }
        .pp-rating-count { font-size: 13px; color: rgba(255,255,255,0.55); }
        .pp-hero-btns { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
        .pp-btn-gold {
          background: #C9A84C; color: #0A1F44; border: none;
          padding: 13px 28px; border-radius: 6px; font-size: 15px; font-weight: 700;
          cursor: pointer; font-family: 'DM Sans', sans-serif; text-decoration: none;
          transition: opacity 0.15s; display: inline-flex; align-items: center;
        }
        .pp-btn-gold:hover { opacity: 0.88; }
        .pp-btn-ghost {
          background: transparent; color: #fff;
          border: 1.5px solid rgba(255,255,255,0.35);
          padding: 13px 24px; border-radius: 6px; font-size: 15px; font-weight: 600;
          cursor: pointer; font-family: 'DM Sans', sans-serif; text-decoration: none;
          transition: border-color 0.15s; display: inline-flex; align-items: center; gap: 6px;
        }
        .pp-btn-ghost:hover { border-color: rgba(255,255,255,0.7); }
        .pp-badges { background: #F7F5F0; padding: 20px; display: flex; flex-wrap: wrap; justify-content: center; gap: 0; border-bottom: 1px solid #E8E4DC; }
        .pp-badge-item {
          display: flex; align-items: center; gap: 7px;
          padding: 10px 18px; font-size: 13px; font-weight: 500; color: #374151;
          border-right: 1px solid #E8E4DC;
        }
        .pp-badge-item:last-child { border-right: none; }
        .pp-badge-check { color: #C9A84C; font-size: 15px; font-weight: 700; flex-shrink: 0; }
        .pp-section { padding: 40px 20px; }
        .pp-section-white { background: #fff; }
        .pp-section-cream { background: #F7F5F0; }
        .pp-container { max-width: 860px; margin: 0 auto; }
        .pp-section-title { font-family: 'DM Serif Display', serif; font-size: 22px; color: #0A1F44; margin-bottom: 24px; }
        .pp-card {
          background: #fff; border: 1px solid #E8E4DC; border-radius: 10px;
          padding: 28px; margin-bottom: 14px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.04);
        }
        .pp-form-card { background: #fff; border: 1px solid #E8E4DC; border-radius: 12px; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); max-width: 600px; margin: 0 auto; }
        .pp-form-title { font-family: 'DM Serif Display', serif; font-size: 22px; color: #0A1F44; margin-bottom: 6px; }
        .pp-form-sub { font-size: 14px; color: #6B7280; margin-bottom: 24px; }
        .pp-field { margin-bottom: 16px; }
        .pp-label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 5px; }
        .pp-input {
          width: 100%; padding: 10px 13px; border: 1.5px solid #E8E4DC; border-radius: 6px;
          font-size: 14px; font-family: 'DM Sans', sans-serif; color: #0A1F44;
          background: #fff; outline: none; transition: border-color 0.15s;
        }
        .pp-input:focus { border-color: #C9A84C; }
        .pp-input.err { border-color: #EF4444; }
        .pp-err-txt { font-size: 12px; color: #EF4444; margin-top: 3px; }
        .pp-textarea { resize: vertical; min-height: 90px; }
        .pp-submit-btn {
          width: 100%; padding: 14px; background: #0A1F44; color: #fff;
          border: none; border-radius: 6px; font-size: 15px; font-weight: 700;
          cursor: pointer; font-family: 'DM Sans', sans-serif; margin-top: 4px;
          transition: opacity 0.15s;
        }
        .pp-submit-btn:hover:not(:disabled) { opacity: 0.85; }
        .pp-submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .pp-success { background: #ECFDF5; border: 1.5px solid #6EE7B7; border-radius: 10px; padding: 28px; text-align: center; }
        .pp-success-icon { font-size: 36px; margin-bottom: 10px; }
        .pp-success-title { font-family: 'DM Serif Display', serif; font-size: 20px; color: #065F46; margin-bottom: 6px; }
        .pp-success-sub { font-size: 14px; color: #047857; }
        .pp-review-card { background: #fff; border: 1px solid #E8E4DC; border-radius: 10px; padding: 22px 24px; margin-bottom: 14px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
        .pp-review-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
        .pp-review-name { font-weight: 700; font-size: 15px; color: #0A1F44; }
        .pp-review-date { font-size: 12px; color: #9CA3AF; margin-top: 2px; }
        .pp-recommend-badge { background: #ECFDF5; color: #065F46; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; border: 1px solid #6EE7B7; white-space: nowrap; }
        .pp-review-text { font-size: 14px; color: #374151; line-height: 1.65; }
        .pp-no-reviews { text-align: center; padding: 32px 0; color: #9CA3AF; font-size: 15px; font-style: italic; }
        .pp-specialty-text { font-size: 15px; color: #374151; line-height: 1.7; margin-bottom: 16px; padding: 16px 20px; background: #fff; border-radius: 8px; border-left: 3px solid #C9A84C; }
        .pp-footer { background: #0A1F44; color: rgba(255,255,255,0.55); text-align: center; padding: 32px 20px; }
        .pp-footer-main { font-size: 14px; color: rgba(255,255,255,0.8); margin-bottom: 10px; }
        .pp-footer-link { color: #C9A84C; text-decoration: none; font-weight: 600; }
        .pp-footer-link:hover { text-decoration: underline; }
        .pp-footer-small { font-size: 12px; margin-top: 8px; }
        @media (max-width: 600px) {
          .pp-topbar { padding: 0 14px; }
          .pp-hero { padding: 36px 16px 32px; }
          .pp-company-name { font-size: 22px; }
          .pp-section { padding: 28px 16px; }
          .pp-form-card { padding: 22px 16px; }
          .pp-card { padding: 18px 16px; }
          .pp-badge-item { padding: 8px 12px; font-size: 12px; }
          .pp-review-card { padding: 18px 16px; }
        }
      `}</style>

      <div className="pp-root">
        {/* Top bar */}
        <div className="pp-topbar">
          <a href="https://avenstone-app.vercel.app" className="pp-logo">Avenstone</a>
          <a href="https://avenstone-app.vercel.app" className="pp-join-btn">Join the Network</a>
        </div>

        {/* Hero */}
        <div className="pp-hero">
          <div className="pp-avatar">{getInitials(company?.company_name)}</div>
          <h1 className="pp-company-name">{company?.company_name || 'Contractor'}</h1>
          {(company?.city || company?.state) && (
            <div className="pp-location">
              {[company.city, company.state].filter(Boolean).join(', ')}
            </div>
          )}
          {company?.tagline && <p className="pp-tagline">"{company.tagline}"</p>}
          {stats?.avg_rating > 0 && (
            <div className="pp-rating-row">
              <Stars rating={stats.avg_rating} size={20} />
              <span className="pp-rating-num">{Number(stats.avg_rating).toFixed(1)}</span>
              <span className="pp-rating-count">({stats.total_reviews || 0} reviews)</span>
            </div>
          )}
          <div className="pp-hero-btns">
            <a
              href="#estimate-form"
              className="pp-btn-gold"
              onClick={e => { e.preventDefault(); document.getElementById('estimate-form')?.scrollIntoView({ behavior: 'smooth' }); }}
            >
              Get Free Estimate
            </a>
            {company?.phone && (
              <a href={`tel:${company.phone}`} className="pp-btn-ghost">
                <span>📞</span>
                {company.phone}
              </a>
            )}
          </div>
        </div>

        {/* Trust badges */}
        <div className="pp-badges">
          {stats?.completed_jobs > 0 && (
            <div className="pp-badge-item">
              <span className="pp-badge-check">✓</span>
              {stats.completed_jobs} Projects Completed
            </div>
          )}
          {memberYear && (
            <div className="pp-badge-item">
              <span className="pp-badge-check">✓</span>
              Member Since {memberYear}
            </div>
          )}
          {company?.insurance_verified && (
            <div className="pp-badge-item">
              <span className="pp-badge-check">✓</span>
              Licensed &amp; Insured
            </div>
          )}
          <div className="pp-badge-item">
            <span className="pp-badge-check">✓</span>
            Avenstone Verified Network Member
          </div>
        </div>

        {/* Estimate form */}
        <div className="pp-section pp-section-white" id="estimate-form">
          <div className="pp-container">
            <div className="pp-form-card">
              {submitted ? (
                <div className="pp-success">
                  <div className="pp-success-icon">✅</div>
                  <div className="pp-success-title">Request Sent!</div>
                  <div className="pp-success-sub">We'll be in touch within 24 hours!</div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} noValidate>
                  <div className="pp-form-title">Ready to Start Your Project?</div>
                  <div className="pp-form-sub">Fill out the form below and {company?.company_name || 'this contractor'} will reach out within 24 hours.</div>

                  <div className="pp-field">
                    <label className="pp-label">Full Name *</label>
                    <input
                      className={`pp-input${formErrors.name ? ' err' : ''}`}
                      type="text"
                      placeholder="Jane Smith"
                      value={form.name}
                      onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setFormErrors(fe => ({ ...fe, name: '' })); }}
                    />
                    {formErrors.name && <div className="pp-err-txt">{formErrors.name}</div>}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div className="pp-field">
                      <label className="pp-label">Phone *</label>
                      <input
                        className={`pp-input${formErrors.phone ? ' err' : ''}`}
                        type="tel"
                        placeholder="(555) 000-0000"
                        value={form.phone}
                        onChange={e => { setForm(f => ({ ...f, phone: e.target.value })); setFormErrors(fe => ({ ...fe, phone: '' })); }}
                      />
                      {formErrors.phone && <div className="pp-err-txt">{formErrors.phone}</div>}
                    </div>
                    <div className="pp-field">
                      <label className="pp-label">Email *</label>
                      <input
                        className={`pp-input${formErrors.email ? ' err' : ''}`}
                        type="email"
                        placeholder="jane@email.com"
                        value={form.email}
                        onChange={e => { setForm(f => ({ ...f, email: e.target.value })); setFormErrors(fe => ({ ...fe, email: '' })); }}
                      />
                      {formErrors.email && <div className="pp-err-txt">{formErrors.email}</div>}
                    </div>
                  </div>

                  <div className="pp-field">
                    <label className="pp-label">Project Type</label>
                    <select
                      className="pp-input"
                      value={form.project_type}
                      onChange={e => setForm(f => ({ ...f, project_type: e.target.value }))}
                      style={{ appearance: 'auto' }}
                    >
                      <option value="">Select a project type…</option>
                      <option>Kitchen Remodel</option>
                      <option>Bathroom Remodel</option>
                      <option>Basement Finish</option>
                      <option>Room Addition</option>
                      <option>Roof Replacement</option>
                      <option>Deck/Patio</option>
                      <option>Full Renovation</option>
                      <option>Other</option>
                    </select>
                  </div>

                  <div className="pp-field">
                    <label className="pp-label">Brief Description</label>
                    <textarea
                      className="pp-input pp-textarea"
                      placeholder="Tell us a bit about your project…"
                      value={form.description}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    />
                  </div>

                  <button type="submit" className="pp-submit-btn" disabled={submitting}>
                    {submitting ? 'Sending…' : 'Request Free Estimate'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>

        {/* What We Do */}
        {specialties.length > 0 && (
          <div className="pp-section pp-section-cream">
            <div className="pp-container">
              <h2 className="pp-section-title">What We Do</h2>
              {specialties.map((s, i) => (
                <div key={i} className="pp-specialty-text">{s}</div>
              ))}
            </div>
          </div>
        )}

        {/* Reviews */}
        <div className="pp-section pp-section-white">
          <div className="pp-container">
            <h2 className="pp-section-title">What Our Clients Say</h2>
            {displayedReviews.length === 0 ? (
              <div className="pp-no-reviews">Be the first to leave a review after your project.</div>
            ) : (
              displayedReviews.map((r, i) => {
                const avg = avgRating(r);
                return (
                  <div key={i} className="pp-review-card">
                    <div className="pp-review-header">
                      <div>
                        <div className="pp-review-name">{r.client_name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <Stars rating={avg} size={14} />
                          <span className="pp-review-date">{formatMonthYear(r.created_at)}</span>
                        </div>
                      </div>
                      {r.would_recommend && (
                        <span className="pp-recommend-badge">✓ Would Recommend</span>
                      )}
                    </div>
                    {r.review_text && <p className="pp-review-text">"{r.review_text}"</p>}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pp-footer">
          <div className="pp-footer-main">Powered by <a href="https://avenstone-app.vercel.app" className="pp-footer-link">Avenstone Network</a></div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
            Are you a contractor?{' '}
            <a href="https://avenstone-app.vercel.app" className="pp-footer-link">Join the network →</a>
          </div>
          <div className="pp-footer-small">Real ratings from real clients.</div>
        </div>
      </div>
    </>
  );
}
