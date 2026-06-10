import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, ANON_KEY } from '../../lib/supabase';

const sb = createClient(SUPABASE_URL, ANON_KEY);

function Stars({ value, onChange }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span
          key={n}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          style={{ fontSize: 32, cursor: 'pointer', lineHeight: 1, transition: 'transform 0.1s', transform: (hover || value) >= n ? 'scale(1.1)' : 'scale(1)', filter: (hover || value) >= n ? 'none' : 'grayscale(100%) opacity(0.25)' }}>
          ⭐
        </span>
      ))}
    </div>
  );
}

export default function ReviewPage({ jobId, tenantId }) {
  const [company, setCompany]       = useState(null);
  const [step, setStep]             = useState('loading'); // loading | form | done | already | error
  const [form, setForm]             = useState({ name: '', quality: 0, communication: 0, timeliness: 0, recommend: null, text: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const init = async () => {
      if (!tenantId) { setStep('error'); return; }

      // Load company name
      const { data: co } = await sb
        .from('company_profiles')
        .select('company_name, city, state')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      setCompany(co || { company_name: 'Your Contractor' });

      // Check if already reviewed
      if (jobId) {
        const { data: existing } = await sb
          .from('job_reviews')
          .select('id')
          .eq('job_id', jobId)
          .maybeSingle();
        if (existing) { setStep('already'); return; }
      }

      setStep('form');
    };
    init();
  }, [jobId, tenantId]);

  const submit = async () => {
    if (!form.quality || !form.communication || !form.timeliness || form.recommend === null) return;
    setSubmitting(true);
    const { error } = await sb.from('job_reviews').insert({
      job_id:               jobId   || null,
      tenant_id:            tenantId,
      client_name:          form.name  || null,
      rating_quality:       form.quality,
      rating_communication: form.communication,
      rating_timeliness:    form.timeliness,
      would_recommend:      form.recommend,
      review_text:          form.text  || null,
      created_at:           new Date().toISOString(),
    });
    setSubmitting(false);
    if (!error) setStep('done');
  };

  const canSubmit = form.quality && form.communication && form.timeliness && form.recommend !== null;

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (step === 'loading') return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--navy-900)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  const coName = company?.company_name || 'Your Contractor';
  const initials = coName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; background: #F7F5F0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .finp { width: 100%; border: 1px solid #E8E4DC; border-radius: 6px; padding: 10px 12px; font-size: 14px; font-family: 'DM Sans', sans-serif; outline: none; }
        .finp:focus { border-color: #0A1F44; }
      `}</style>

      <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ width: '100%', maxWidth: 480 }}>

          {/* Brand header */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ width: 60, height: 60, background: 'var(--navy-900)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 20, fontWeight: 700, color: 'var(--gold-500)' }}>
              {initials}
            </div>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: 'var(--navy-900)' }}>{coName}</div>
            {company?.city && (
              <div style={{ fontSize: 13, color: 'var(--text-subtle)', marginTop: 2 }}>
                {company.city}{company.state ? `, ${company.state}` : ''}
              </div>
            )}
          </div>

          {/* Card */}
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>

            {/* ── Already submitted ── */}
            {step === 'already' && (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: 44, marginBottom: 14 }}>✅</div>
                <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: 'var(--navy-900)', marginBottom: 8 }}>Already Submitted</div>
                <div style={{ fontSize: 13, color: 'var(--text-subtle)', lineHeight: 1.7 }}>Your review has been recorded. Thank you!</div>
              </div>
            )}

            {/* ── Done ── */}
            {step === 'done' && (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: 44, marginBottom: 14 }}>🌟</div>
                <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: 'var(--navy-900)', marginBottom: 8 }}>Thank You!</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, maxWidth: 320, margin: '0 auto' }}>
                  Your review helps {coName} earn more trusted clients. We genuinely appreciate you taking the time.
                </div>
              </div>
            )}

            {/* ── Error ── */}
            {step === 'error' && (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: 44, marginBottom: 14 }}>⚠️</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy-900)', marginBottom: 6 }}>Invalid Review Link</div>
                <div style={{ fontSize: 13, color: 'var(--text-subtle)' }}>This link appears to be incomplete. Please ask your contractor to resend it.</div>
              </div>
            )}

            {/* ── Form ── */}
            {step === 'form' && (
              <>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy-900)', marginBottom: 4 }}>How was your experience?</div>
                <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginBottom: 24, lineHeight: 1.6 }}>
                  Your honest feedback helps future homeowners make confident decisions.
                </div>

                {/* Star ratings */}
                {[
                  { key: 'quality',       lb: 'Quality of Work' },
                  { key: 'communication', lb: 'Communication' },
                  { key: 'timeliness',    lb: 'On Time & On Budget' },
                ].map(({ key, lb }) => (
                  <div key={key} style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>{lb}</div>
                    <Stars value={form[key]} onChange={v => setForm(p => ({ ...p, [key]: v }))} />
                  </div>
                ))}

                {/* Recommend */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                    Would you recommend {coName}?
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {[
                      { val: true,  label: '👍 Yes',       active: 'var(--green-dot)', bg: '#F0FDF4', text: '#15803D' },
                      { val: false, label: '👎 Not Really', active: '#EF4444', bg: '#FEF2F2', text: '#DC2626' },
                    ].map(({ val, label, active, bg, text }) => (
                      <button
                        key={String(val)}
                        onClick={() => setForm(p => ({ ...p, recommend: val }))}
                        style={{
                          flex: 1, padding: '12px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600,
                          border: `2px solid ${form.recommend === val ? active : 'var(--border)'}`,
                          background: form.recommend === val ? bg : '#fff',
                          color: form.recommend === val ? text : 'var(--text-muted)',
                          transition: 'all 0.15s',
                        }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Name */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                    Your Name <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                  </label>
                  <input
                    className="finp"
                    value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="Jane H."
                  />
                </div>

                {/* Review text */}
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                    Tell us more <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                  </label>
                  <textarea
                    className="finp"
                    rows={3}
                    value={form.text}
                    onChange={e => setForm(p => ({ ...p, text: e.target.value }))}
                    placeholder="What stood out? What would future homeowners want to know?"
                    style={{ resize: 'vertical' }}
                  />
                </div>

                <button
                  onClick={submit}
                  disabled={submitting || !canSubmit}
                  style={{
                    width: '100%', padding: '14px', borderRadius: 8, border: 'none', cursor: canSubmit ? 'pointer' : 'not-allowed',
                    background: canSubmit ? 'var(--navy-900)' : 'var(--border)',
                    color: canSubmit ? 'var(--gold-500)' : 'var(--text-subtle)',
                    fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 15,
                    transition: 'all 0.2s',
                  }}>
                  {submitting ? 'Submitting…' : 'Submit Review'}
                </button>

                <div style={{ fontSize: 11, color: 'var(--text-subtle)', textAlign: 'center', marginTop: 14 }}>
                  Powered by <span style={{ color: 'var(--gold-500)', fontWeight: 600 }}>Avenstone Network</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
