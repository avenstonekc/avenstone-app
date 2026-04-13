import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://cbfftukmhqvvjlrlnltk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQ2ODgsImV4cCI6MjA5MTE5MDY4OH0.isj52drLT3pj7BF94Wa9w_y_f8U1M3W5AcgWsRaTwBQ'
);

export default function CompletionPage({ jobId }) {
  const [data, setData]     = useState(null);
  const [step, setStep]     = useState('loading'); // loading | ready | error
  const [flipped, setFlipped] = useState(false); // mobile swipe between before/after

  useEffect(() => {
    const load = async () => {
      if (!jobId) { setStep('error'); return; }

      // Load job + photos + company
      const [{ data: job }, { data: photos }] = await Promise.all([
        sb.from('jobs').select('id,address,client_name,tenant_id,status').eq('id', jobId).maybeSingle(),
        sb.from('photos').select('id,url,label,type').eq('job_id', jobId).in('label', ['before','after']),
      ]);

      if (!job) { setStep('error'); return; }

      const { data: company } = await sb.from('company_profiles')
        .select('company_name,city,state,phone,website')
        .eq('tenant_id', job.tenant_id).maybeSingle();

      const before = photos?.find(p => p.label === 'before');
      const after  = photos?.find(p => p.label === 'after');

      if (!before || !after) { setStep('error'); return; }

      setData({ job, before, after, company });
      setStep('ready');
    };
    load();
  }, [jobId]);

  if (step === 'loading') return (
    <div style={{ minHeight: '100dvh', background: '#0A1F44', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, border: '3px solid rgba(201,168,76,0.3)', borderTopColor: '#C9A84C', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  if (step === 'error') return (
    <div style={{ minHeight: '100dvh', background: '#0A1F44', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 24 }}>
      <div style={{ fontSize: 48 }}>🏗️</div>
      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: '#fff' }}>Not Found</div>
      <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>This completion package isn't available yet.</div>
    </div>
  );

  const { job, before, after, company } = data;
  const coName   = company?.company_name || 'Your Contractor';
  const initials = coName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const location = job.address?.split(',').slice(-2).join(',').trim() || '';

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; background: #0A1F44; }
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        .fade { animation: fadeUp 0.5s ease forwards; }
        .photo-half {
          position: relative; overflow: hidden; background: #111;
          display: flex; align-items: center; justify-content: center;
        }
        .photo-half img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .photo-label {
          position: absolute; top: 12px; left: 12px;
          font-size: 11px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase;
          padding: 4px 12px; border-radius: 20px;
        }
        @media (max-width: 640px) {
          .split { flex-direction: column !important; }
          .photo-half { height: 50vw !important; min-height: 220px; }
        }
      `}</style>

      <div style={{ minHeight: '100dvh', background: '#0A1F44', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: '1px solid rgba(201,168,76,0.15)', flexShrink: 0 }}>
          <div style={{ width: 48, height: 48, background: 'rgba(201,168,76,0.15)', border: '2px solid #C9A84C', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#C9A84C', flexShrink: 0 }}>
            {initials}
          </div>
          <div>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: '#fff', lineHeight: 1.2 }}>{coName}</div>
            {company?.city && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{company.city}{company.state ? `, ${company.state}` : ''}</div>}
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#C9A84C', letterSpacing: 2, textTransform: 'uppercase' }}>Project Complete</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
          </div>
        </div>

        {/* Title */}
        <div style={{ padding: '24px 24px 16px', textAlign: 'center' }} className="fade">
          <div style={{ fontSize: 11, fontWeight: 700, color: '#C9A84C', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8 }}>
            The Transformation
          </div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 28, color: '#fff', lineHeight: 1.2, marginBottom: 6 }}>
            {location || job.address}
          </div>
          {job.client_name && (
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>for {job.client_name}</div>
          )}
        </div>

        {/* Before / After split */}
        <div className="split fade" style={{ display: 'flex', flex: 1, minHeight: 0, gap: 2, margin: '0 0 2px' }}>
          <div className="photo-half" style={{ flex: 1, minHeight: 300 }}>
            <img src={before.url} alt="Before" />
            <div className="photo-label" style={{ background: 'rgba(0,0,0,0.7)', color: '#fff' }}>Before</div>
          </div>
          <div className="photo-half" style={{ flex: 1, minHeight: 300 }}>
            <img src={after.url} alt="After" />
            <div className="photo-label" style={{ background: '#C9A84C', color: '#0A1F44' }}>After</div>
          </div>
        </div>

        {/* Footer CTA */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, flexShrink: 0 }}>
          {/* Share button */}
          <button
            onClick={() => {
              if (navigator.share) {
                navigator.share({ title: `${coName} — Project Complete`, url: window.location.href });
              } else {
                navigator.clipboard.writeText(window.location.href);
                alert('Link copied!');
              }
            }}
            style={{
              background: '#C9A84C', color: '#0A1F44', border: 'none', borderRadius: 10,
              padding: '13px 36px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
            📤 Share This Project
          </button>

          {company?.phone && (
            <a href={`tel:${company.phone}`} style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>
              Ready for your project? Call {company.phone}
            </a>
          )}

          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>
            Powered by <span style={{ color: 'rgba(201,168,76,0.5)', fontWeight: 600 }}>Avenstone Network</span>
          </div>
        </div>
      </div>
    </>
  );
}
