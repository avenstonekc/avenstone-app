import { useState } from 'react';
import { sb, AV_TENANT } from '../../lib/supabase';

const NAV  = '#0A1F44';
const GOLD = '#C9A84C';

// Each step maps to a knowledge entry
// `field` = form key, `category` = ai_knowledge category
// `toContent` = how to convert the answer into a knowledge string for the AI
const STEPS = [
  {
    id: 'labor_rate',
    title: 'Labor Rate',
    category: 'pricing',
    question: 'What is your standard general labor rate?',
    hint: 'This is what you charge per hour for general labor on most jobs.',
    type: 'number',
    placeholder: '85',
    prefix: '$',
    suffix: '/hr',
    toContent: v => `Our standard general labor rate is $${v}/hr.`,
  },
  {
    id: 'material_markup',
    title: 'Material Markup',
    category: 'pricing',
    question: 'What is your standard material markup?',
    hint: 'The percentage you add on top of material costs.',
    type: 'number',
    placeholder: '25',
    suffix: '%',
    toContent: v => `Our standard material markup is ${v}%.`,
  },
  {
    id: 'draw_structure',
    title: 'Payment / Draw Structure',
    category: 'pricing',
    question: 'How do you structure payment draws on a typical job?',
    hint: 'e.g. 30% deposit, 40% at rough-in, 30% at completion.',
    type: 'text',
    placeholder: '30% deposit, 40% at rough-in, 30% at completion',
    toContent: v => `Our standard payment draw structure: ${v}.`,
  },
  {
    id: 'lead_time',
    title: 'Scheduling Lead Time',
    category: 'scheduling',
    question: 'How much lead time do you need after signing before work begins?',
    hint: 'On average, how many days or weeks from contract signed to demo/start?',
    type: 'text',
    placeholder: 'e.g. 2 weeks',
    toContent: v => `We typically need ${v} of lead time after contract signing before work begins.`,
  },
  {
    id: 'client_comms',
    title: 'Client Communication',
    category: 'client_comms',
    question: 'How do you prefer to keep clients updated during a job?',
    hint: 'Weekly texts, calls, photos? When and how often?',
    type: 'text',
    placeholder: 'e.g. Weekly Friday text update with photos',
    toContent: v => `Our standard client communication practice: ${v}.`,
  },
  {
    id: 'change_order',
    title: 'Change Order Policy',
    category: 'process',
    question: 'What is your change order policy?',
    hint: 'How do you handle scope changes — approval process, timing, etc.',
    type: 'text',
    placeholder: 'e.g. All change orders must be signed before any additional work starts',
    toContent: v => `Our change order policy: ${v}.`,
  },
  {
    id: 'company_strengths',
    title: 'What You Do Best',
    category: 'general',
    question: 'What types of jobs does your company specialize in?',
    hint: 'This helps the AI highlight your strengths in client conversations.',
    type: 'text',
    placeholder: 'e.g. Basement finishes, kitchen remodels, full gut renovations',
    toContent: v => `Our company specializes in: ${v}.`,
  },
];

export default function AiSetupWizard({ profile, onDone }) {
  const [step, setStep]       = useState(0);
  const [answers, setAnswers] = useState({});
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');

  const cur = STEPS[step];
  const val = answers[cur.id] ?? '';
  const progress = ((step) / STEPS.length) * 100;
  const isLast = step === STEPS.length - 1;

  const next = async () => {
    if (!val.trim()) { setErr('Please enter an answer, or click Skip.'); return; }
    setErr('');
    if (isLast) { await finish(); return; }
    setStep(s => s + 1);
  };

  const skip = () => {
    setErr('');
    if (isLast) { finish(true); return; }
    setStep(s => s + 1);
  };

  const finish = async (skipLast = false) => {
    setSaving(true);
    try {
      const entries = STEPS
        .filter((s, i) => {
          if (skipLast && i === step) return false;
          const v = answers[s.id];
          return v && v.trim();
        })
        .map(s => ({
          tenant_id:  AV_TENANT,
          category:   s.category,
          content:    s.toContent(answers[s.id].trim()),
          active:     true,
          created_by: profile?.id ?? null,
        }));

      if (entries.length > 0) {
        const { error } = await sb.from('ai_knowledge').insert(entries);
        if (error) throw error;
      }
      onDone();
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(10,31,68,0.7)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: 520,
        boxShadow: '0 24px 60px rgba(10,31,68,0.25)',
        overflow: 'hidden',
      }}>
        {/* Progress bar */}
        <div style={{ height: 4, background: '#F3F4F6' }}>
          <div style={{
            height: '100%', background: GOLD,
            width: `${progress}%`, transition: 'width 0.4s ease',
          }} />
        </div>

        {/* Header */}
        <div style={{ background: NAV, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 18 }}>✦</span>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: '#fff' }}>
              Set Up Your AI
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.45)' }}>
            Step {step + 1} of {STEPS.length} — {cur.title}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '28px 28px 24px' }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: NAV, marginBottom: 8, lineHeight: 1.35 }}>
            {cur.question}
          </div>
          <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 20, lineHeight: 1.5 }}>
            {cur.hint}
          </div>

          {/* Input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 8 }}>
            {cur.prefix && (
              <span style={{
                padding: '9px 12px', background: '#F9FAFB', border: '1px solid #E5E7EB',
                borderRight: 'none', borderRadius: '6px 0 0 6px', fontSize: 14, color: '#6B7280', flexShrink: 0,
              }}>
                {cur.prefix}
              </span>
            )}
            <input
              type={cur.type === 'number' ? 'number' : 'text'}
              className="finp"
              style={{
                flex: 1, borderRadius: cur.prefix ? '0' : cur.suffix ? '6px 0 0 6px' : '6px',
                fontSize: 14,
              }}
              placeholder={cur.placeholder}
              value={val}
              onChange={e => { setAnswers(p => ({ ...p, [cur.id]: e.target.value })); setErr(''); }}
              onKeyDown={e => e.key === 'Enter' && next()}
              autoFocus
            />
            {cur.suffix && (
              <span style={{
                padding: '9px 12px', background: '#F9FAFB', border: '1px solid #E5E7EB',
                borderLeft: 'none', borderRadius: '0 6px 6px 0', fontSize: 14, color: '#6B7280', flexShrink: 0,
              }}>
                {cur.suffix}
              </span>
            )}
          </div>

          {/* Preview of what gets saved */}
          {val.trim() && (
            <div style={{
              background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 6,
              padding: '8px 12px', fontSize: 12, color: '#0369A1', marginBottom: 8, lineHeight: 1.5,
            }}>
              <strong>AI will learn:</strong> "{cur.toContent(val.trim())}"
            </div>
          )}

          {err && (
            <div style={{ fontSize: 12.5, color: '#DC2626', marginBottom: 8 }}>{err}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '0 28px 24px', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center',
        }}>
          <button
            onClick={skip}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#9CA3AF', fontSize: 13, padding: '8px 0',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#6B7280'}
            onMouseLeave={e => e.currentTarget.style.color = '#9CA3AF'}
          >
            Skip this question
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <button
                className="btn btn-ghost"
                onClick={() => { setStep(s => s - 1); setErr(''); }}
                style={{ fontSize: 13 }}
              >
                Back
              </button>
            )}
            <button
              className="btn btn-navy"
              onClick={next}
              disabled={saving}
              style={{ minWidth: 110 }}
            >
              {saving ? 'Saving…' : isLast ? 'Finish Setup' : 'Next →'}
            </button>
          </div>
        </div>

        {/* Dot progress */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, paddingBottom: 20 }}>
          {STEPS.map((_, i) => (
            <span key={i} style={{
              width: i === step ? 20 : 7, height: 7, borderRadius: 4,
              background: i < step ? GOLD : i === step ? NAV : '#E5E7EB',
              transition: 'all 0.3s', display: 'inline-block',
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}
