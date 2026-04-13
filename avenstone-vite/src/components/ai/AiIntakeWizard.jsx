import { useState, useEffect, useRef } from 'react';
import { sb, AV_TENANT, AV_USER_ID, sbNotify, ANON_KEY } from '../../lib/supabase';

const AI_INTAKE_URL = 'https://cbfftukmhqvvjlrlnltk.supabase.co/functions/v1/ai-intake';

const INITIAL_MESSAGE = {
  role: 'assistant',
  content:
    "Hi! I'm here to help gather information about your project so we can put together an accurate estimate. To get started — what kind of project are you thinking about?",
};

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '10px 14px' }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: '#C9A84C',
            display: 'inline-block',
            animation: 'avDot 1.2s infinite',
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}

function StepDots({ step }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {[1, 2, 3].map((s) => (
        <span
          key={s}
          style={{
            width: s === step ? 22 : 8,
            height: 8,
            borderRadius: 4,
            background: s === step ? '#C9A84C' : s < step ? '#C9A84C88' : '#ffffff44',
            transition: 'all 0.3s',
          }}
        />
      ))}
    </div>
  );
}

function calcSqft(room) {
  const l = parseFloat(room.length);
  const w = parseFloat(room.width);
  if (!isNaN(l) && !isNaN(w) && l > 0 && w > 0) return Math.round(l * w);
  return null;
}

export default function AiIntakeWizard({ profile, onClose, onJobCreated }) {
  const [step, setStep] = useState(1);
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [readyForMeasurements, setReadyForMeasurements] = useState(false);
  const [rooms, setRooms] = useState([{ name: '', length: '', width: '', height: '' }]);
  const [extracted, setExtracted] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [fields, setFields] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);
  const msgsEndRef = useRef();
  const inputRef = useRef();

  // Scroll to bottom of chat on new messages
  useEffect(() => {
    if (msgsEndRef.current) {
      msgsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  // Extract on entering step 3
  useEffect(() => {
    if (step === 3 && !extracted) {
      runExtract();
    }
  }, [step]);

  const conversationHistory = messages.map((m) => ({ role: m.role, content: m.content }));

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg = { role: 'user', content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(AI_INTAKE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({
          conversation_history: nextMessages.map((m) => ({ role: m.role, content: m.content })),
          message: text,
          tenant_id: AV_TENANT,
          mode: 'chat',
        }),
      });
      if (!res.ok) throw new Error(`AI service error (${res.status})`);
      const data = await res.json();
      const aiMsg = { role: 'assistant', content: data.reply || data.message || 'Got it!' };
      setMessages((prev) => [...prev, aiMsg]);
      if (data.ready_for_measurements) setReadyForMeasurements(true);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const showContinueBtn = readyForMeasurements || messages.length >= 7;

  async function runExtract() {
    setExtracting(true);
    setError(null);
    try {
      const res = await fetch(AI_INTAKE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({
          conversation_history: conversationHistory,
          message: '',
          tenant_id: AV_TENANT,
          mode: 'extract',
        }),
      });
      if (!res.ok) throw new Error(`Extraction error (${res.status})`);
      const data = await res.json();
      const ext = data.extracted || data;
      setExtracted(ext);
      setFields({
        project_type: ext.project_type || '',
        address: ext.address || '',
        client_name: ext.client_name || '',
        client_email: ext.client_email || '',
        client_phone: ext.client_phone || '',
        scope_summary: ext.scope_summary || '',
        budget_range: ext.budget_range || '',
        timeline: ext.timeline || '',
        sqft_estimate: ext.sqft_estimate || '',
      });
    } catch (err) {
      setError(err.message || 'Could not extract project details. You can still fill them in manually.');
      setExtracted({});
      setFields({});
    } finally {
      setExtracting(false);
    }
  }

  const totalSqft = rooms.reduce((sum, r) => {
    const s = calcSqft(r);
    return s ? sum + s : sum;
  }, 0);

  function updateRoom(idx, key, val) {
    setRooms((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: val } : r)));
  }

  function addRoom() {
    setRooms((prev) => [...prev, { name: '', length: '', width: '', height: '' }]);
  }

  function removeRoom(idx) {
    setRooms((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateField(key, val) {
    setFields((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const jobId = crypto.randomUUID();
      const { data: job, error: insertErr } = await sb
        .from('jobs')
        .insert({
          id: jobId,
          tenant_id: AV_TENANT,
          address: fields.address || 'Address TBD',
          status: 'lead',
          client_name: fields.client_name || '',
          client_email: fields.client_email || '',
          client_phone: fields.client_phone || '',
          scope: fields.scope_summary || '',
          sqft: totalSqft ? String(totalSqft) : fields.sqft_estimate || '',
          intake_answers: {
            ...extracted,
            rooms: rooms,
            conversation_history: conversationHistory,
            submitted_at: new Date().toISOString(),
            submitted_by_role: profile?.role || 'client',
          },
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertErr) throw new Error(insertErr.message);

      await sbNotify(
        'new_lead',
        'New project intake submitted',
        fields.scope_summary?.slice(0, 120) || fields.project_type,
        jobId,
        AV_USER_ID
      );

      setSubmitted(true);
      if (onJobCreated && job) onJobCreated(job);
    } catch (err) {
      setError(err.message || 'Submit failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const scopeItems =
    extracted?.scope_items ||
    extracted?.items ||
    (Array.isArray(extracted?.scope) ? extracted.scope : []);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @keyframes avDot {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
        .av-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          background: #fff;
          display: flex;
          flex-direction: column;
          font-family: 'DM Sans', sans-serif;
        }
        .av-header {
          background: #0A1F44;
          color: #fff;
          padding: 0 20px;
          height: 60px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
        }
        .av-header h2 {
          font-family: 'DM Serif Display', serif;
          font-size: 18px;
          margin: 0;
          color: #fff;
        }
        .av-close-btn {
          background: none;
          border: none;
          color: #fff;
          font-size: 22px;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 6px;
          line-height: 1;
          opacity: 0.85;
          transition: opacity 0.2s;
        }
        .av-close-btn:hover:not(:disabled) { opacity: 1; }
        .av-close-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .av-body {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
        }
        .av-chat-list {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding-bottom: 8px;
        }
        .av-bubble {
          max-width: 78%;
          padding: 10px 14px;
          border-radius: 10px;
          font-size: 15px;
          line-height: 1.5;
          word-break: break-word;
        }
        .av-bubble.assistant {
          background: #F7F5F0;
          border: 1px solid #E8E4DC;
          align-self: flex-start;
          color: #0A1F44;
        }
        .av-bubble.user {
          background: #0A1F44;
          color: #fff;
          align-self: flex-end;
        }
        .av-input-row {
          display: flex;
          gap: 8px;
          padding: 12px 20px 16px;
          background: #fff;
          border-top: 1px solid #E8E4DC;
          flex-shrink: 0;
        }
        .av-input-row textarea {
          flex: 1;
          resize: none;
          min-height: 42px;
          max-height: 120px;
          overflow-y: auto;
          font-size: 15px;
          font-family: 'DM Sans', sans-serif;
          padding: 10px 12px;
          border: 1.5px solid #E8E4DC;
          border-radius: 8px;
          outline: none;
          color: #0A1F44;
          background: #F7F5F0;
          transition: border-color 0.2s;
        }
        .av-input-row textarea:focus { border-color: #C9A84C; }
        .av-send-btn {
          background: #C9A84C;
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 0 18px;
          font-size: 15px;
          font-family: 'DM Sans', sans-serif;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.2s;
          white-space: nowrap;
          align-self: flex-end;
          height: 42px;
        }
        .av-send-btn:hover:not(:disabled) { opacity: 0.88; }
        .av-send-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .av-error {
          background: #FEE2E2;
          color: #EF4444;
          border: 1px solid #EF4444;
          border-radius: 8px;
          padding: 10px 14px;
          font-size: 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 12px;
          flex-shrink: 0;
        }
        .av-section-label {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #7a7060;
          margin-bottom: 6px;
          margin-top: 18px;
        }
        .av-room-card {
          border: 1.5px solid #E8E4DC;
          border-radius: 10px;
          padding: 14px;
          margin-bottom: 10px;
          background: #F7F5F0;
        }
        .av-room-grid {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 1fr auto;
          gap: 8px;
          align-items: end;
        }
        @media (max-width: 600px) {
          .av-room-grid {
            grid-template-columns: 1fr 1fr;
            grid-template-rows: auto auto;
          }
          .av-room-grid .av-room-name { grid-column: 1 / -1; }
          .av-room-grid .av-room-del { grid-column: 2; justify-self: end; }
        }
        .av-sqft-badge {
          font-size: 12px;
          color: #7a7060;
          margin-top: 6px;
          text-align: right;
        }
        .av-lidar-card {
          border: 1.5px solid #C9A84C55;
          border-radius: 10px;
          padding: 14px 16px;
          background: #fffdf5;
          display: flex;
          gap: 12px;
          align-items: center;
          margin-top: 18px;
        }
        .av-lidar-icon {
          font-size: 26px;
          flex-shrink: 0;
        }
        .av-lidar-text {
          font-size: 13.5px;
          color: #5a4e38;
          line-height: 1.4;
        }
        .av-chip {
          display: inline-block;
          background: #0A1F4415;
          color: #0A1F44;
          border-radius: 20px;
          padding: 3px 11px;
          font-size: 13px;
          margin: 3px 3px 3px 0;
          font-weight: 500;
        }
        .av-summary-card {
          border: 1.5px solid #E8E4DC;
          border-radius: 12px;
          padding: 18px;
          background: #F7F5F0;
          margin-bottom: 16px;
        }
        .av-field-row {
          margin-bottom: 12px;
        }
        .av-spinner {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 14px;
          padding: 60px 20px;
          color: #7a7060;
          font-size: 15px;
        }
        .av-spinner-ring {
          width: 36px;
          height: 36px;
          border: 3px solid #E8E4DC;
          border-top-color: #C9A84C;
          border-radius: 50%;
          animation: avSpin 0.8s linear infinite;
        }
        @keyframes avSpin {
          to { transform: rotate(360deg); }
        }
        .av-success {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          padding: 60px 24px;
          text-align: center;
        }
        .av-success-icon {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: #D1FAE5;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 32px;
          color: #22c55e;
        }
        .av-success h3 {
          font-family: 'DM Serif Display', serif;
          font-size: 22px;
          color: #0A1F44;
          margin: 0;
        }
        .av-success p {
          color: #5a4e38;
          font-size: 15px;
          max-width: 340px;
          margin: 0;
          line-height: 1.5;
        }
        .av-step-footer {
          padding: 16px 20px 24px;
          border-top: 1px solid #E8E4DC;
          display: flex;
          flex-direction: column;
          gap: 10px;
          flex-shrink: 0;
        }
        .av-skip {
          text-align: center;
          font-size: 13px;
          color: #9a8f7f;
          cursor: pointer;
          text-decoration: underline;
          background: none;
          border: none;
          padding: 0;
          font-family: 'DM Sans', sans-serif;
        }
        .av-skip:hover { color: #0A1F44; }
        .av-total-sqft {
          background: #0A1F44;
          color: #C9A84C;
          border-radius: 8px;
          padding: 8px 14px;
          font-size: 14px;
          font-weight: 600;
          text-align: center;
          margin-top: 4px;
        }
        .av-input-mini {
          width: 100%;
          padding: 8px 10px;
          font-size: 14px;
          font-family: 'DM Sans', sans-serif;
          border: 1.5px solid #E8E4DC;
          border-radius: 8px;
          background: #fff;
          color: #0A1F44;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.2s;
        }
        .av-input-mini:focus { border-color: #C9A84C; }
        .av-textarea-mini {
          width: 100%;
          padding: 8px 10px;
          font-size: 14px;
          font-family: 'DM Sans', sans-serif;
          border: 1.5px solid #E8E4DC;
          border-radius: 8px;
          background: #fff;
          color: #0A1F44;
          outline: none;
          box-sizing: border-box;
          resize: vertical;
          min-height: 80px;
          transition: border-color 0.2s;
        }
        .av-textarea-mini:focus { border-color: #C9A84C; }
        .av-del-btn {
          background: none;
          border: none;
          color: #EF4444;
          font-size: 18px;
          cursor: pointer;
          padding: 4px 6px;
          border-radius: 6px;
          line-height: 1;
          transition: background 0.15s;
        }
        .av-del-btn:hover { background: #FEE2E2; }
      `}</style>

      <div className="av-overlay" role="dialog" aria-modal="true" aria-label="New Project Intake">
        {/* Header */}
        <div className="av-header">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h2>
              {step === 1
                ? 'New Project Intake'
                : step === 2
                ? 'Step 2 of 3 — Measurements'
                : 'Step 3 of 3 — Review & Submit'}
            </h2>
            <StepDots step={step} />
          </div>
          <button
            className="av-close-btn"
            onClick={onClose}
            disabled={loading || submitting}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* ── Step 1: AI Chat ─────────────────────────────────────────────── */}
        {step === 1 && (
          <>
            <div className="av-body" style={{ paddingBottom: 0 }}>
              {error && (
                <div className="av-error">
                  <span>{error}</span>
                  <button
                    onClick={() => setError(null)}
                    style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 16, padding: 0 }}
                    aria-label="Dismiss error"
                  >
                    ×
                  </button>
                </div>
              )}
              <div className="av-chat-list">
                {messages.map((msg, i) => (
                  <div key={i} className={`av-bubble ${msg.role}`}>
                    {msg.content}
                  </div>
                ))}
                {loading && (
                  <div className="av-bubble assistant">
                    <TypingDots />
                  </div>
                )}
                <div ref={msgsEndRef} />
              </div>
            </div>

            {showContinueBtn && !loading && (
              <div style={{ padding: '10px 20px 0', flexShrink: 0 }}>
                <button
                  className="btn btn-gold"
                  style={{ width: '100%' }}
                  onClick={() => setStep(2)}
                >
                  Continue to Measurements →
                </button>
              </div>
            )}

            <div className="av-input-row">
              <textarea
                ref={inputRef}
                className="finp"
                style={{
                  flex: 1,
                  resize: 'none',
                  minHeight: 42,
                  maxHeight: 120,
                  overflowY: 'auto',
                  fontSize: 15,
                  fontFamily: "'DM Sans', sans-serif",
                  padding: '10px 12px',
                  border: '1.5px solid #E8E4DC',
                  borderRadius: 8,
                  outline: 'none',
                  color: '#0A1F44',
                  background: '#F7F5F0',
                  transition: 'border-color 0.2s',
                }}
                placeholder="Type your message…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                rows={1}
                aria-label="Message input"
              />
              <button
                className="av-send-btn"
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                aria-label="Send message"
              >
                Send
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: Measurements ─────────────────────────────────────────── */}
        {step === 2 && (
          <>
            <div className="av-body">
              {error && (
                <div className="av-error">
                  <span>{error}</span>
                  <button
                    onClick={() => setError(null)}
                    style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 16, padding: 0 }}
                    aria-label="Dismiss error"
                  >
                    ×
                  </button>
                </div>
              )}

              <p style={{ fontSize: 14, color: '#5a4e38', marginTop: 0, lineHeight: 1.6 }}>
                Help us understand the size of the space. A precise scan happens on-site — this gives our estimators a head start.
              </p>

              <div className="av-section-label">Rooms / Areas</div>

              {rooms.map((room, idx) => {
                const sqft = calcSqft(room);
                return (
                  <div className="av-room-card" key={idx}>
                    <div className="av-room-grid">
                      <div className="av-room-name">
                        <label style={{ fontSize: 12, color: '#7a7060', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                          Area Name
                        </label>
                        <input
                          className="av-input-mini"
                          placeholder="e.g. Living Room"
                          value={room.name}
                          onChange={(e) => updateRoom(idx, 'name', e.target.value)}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, color: '#7a7060', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                          Length (ft)
                        </label>
                        <input
                          className="av-input-mini"
                          type="number"
                          min="0"
                          placeholder="0"
                          value={room.length}
                          onChange={(e) => updateRoom(idx, 'length', e.target.value)}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, color: '#7a7060', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                          Width (ft)
                        </label>
                        <input
                          className="av-input-mini"
                          type="number"
                          min="0"
                          placeholder="0"
                          value={room.width}
                          onChange={(e) => updateRoom(idx, 'width', e.target.value)}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, color: '#7a7060', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                          Height (ft)
                        </label>
                        <input
                          className="av-input-mini"
                          type="number"
                          min="0"
                          placeholder="opt."
                          value={room.height}
                          onChange={(e) => updateRoom(idx, 'height', e.target.value)}
                        />
                      </div>
                      <div className="av-room-del" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 1 }}>
                        {rooms.length > 1 && (
                          <button
                            className="av-del-btn"
                            onClick={() => removeRoom(idx)}
                            aria-label={`Remove ${room.name || 'area'}`}
                            title="Remove"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                    {sqft !== null && (
                      <div className="av-sqft-badge">{sqft.toLocaleString()} sq ft</div>
                    )}
                  </div>
                );
              })}

              <button
                className="btn btn-ghost"
                style={{ width: '100%', marginTop: 4 }}
                onClick={addRoom}
              >
                + Add Area
              </button>

              {totalSqft > 0 && (
                <div className="av-total-sqft">
                  Total: {totalSqft.toLocaleString()} sq ft
                </div>
              )}

              <div className="av-lidar-card">
                <div className="av-lidar-icon">📱</div>
                <div className="av-lidar-text">
                  <strong>Precise LiDAR scanning</strong> available in the Avenstone mobile app. Capture exact room dimensions with your phone's depth sensor.
                </div>
              </div>
            </div>

            <div className="av-step-footer">
              <button
                className="btn btn-gold"
                style={{ width: '100%' }}
                onClick={() => setStep(3)}
              >
                Continue to Review →
              </button>
              <button
                className="av-skip"
                onClick={() => {
                  setRooms([{ name: '', length: '', width: '', height: '' }]);
                  setStep(3);
                }}
              >
                Skip — I don't have measurements yet
              </button>
            </div>
          </>
        )}

        {/* ── Step 3: Review & Submit ───────────────────────────────────────── */}
        {step === 3 && (
          <>
            {submitted ? (
              <div className="av-body" style={{ justifyContent: 'center' }}>
                <div className="av-success">
                  <div className="av-success-icon">✓</div>
                  <h3>Request Submitted!</h3>
                  <p>
                    Your project request has been submitted. Our team will be in touch soon.
                  </p>
                  <button
                    className="btn btn-navy"
                    style={{ marginTop: 8 }}
                    onClick={onClose}
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : extracting ? (
              <div className="av-body" style={{ justifyContent: 'center' }}>
                <div className="av-spinner">
                  <div className="av-spinner-ring" />
                  <span>Analyzing your conversation…</span>
                </div>
              </div>
            ) : (
              <>
                <div className="av-body">
                  {error && (
                    <div className="av-error" style={{ marginBottom: 14 }}>
                      <span>{error}</span>
                      <button
                        onClick={() => setError(null)}
                        style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 16, padding: 0 }}
                        aria-label="Dismiss error"
                      >
                        ×
                      </button>
                    </div>
                  )}

                  <div className="av-summary-card">
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#C9A84C', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
                      Project Details
                    </div>

                    <div className="av-field-row">
                      <label className="flbl" style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: '#7a7060', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Project Type
                      </label>
                      <input
                        className="av-input-mini finp"
                        value={fields.project_type || ''}
                        onChange={(e) => updateField('project_type', e.target.value)}
                        placeholder="e.g. Kitchen Remodel"
                      />
                    </div>

                    <div className="av-field-row">
                      <label className="flbl" style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: '#7a7060', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Address
                      </label>
                      <input
                        className="av-input-mini finp"
                        value={fields.address || ''}
                        onChange={(e) => updateField('address', e.target.value)}
                        placeholder="Project address"
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                      <div>
                        <label className="flbl" style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: '#7a7060', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Budget Range
                        </label>
                        <input
                          className="av-input-mini finp"
                          value={fields.budget_range || ''}
                          onChange={(e) => updateField('budget_range', e.target.value)}
                          placeholder="e.g. $20k–$40k"
                        />
                      </div>
                      <div>
                        <label className="flbl" style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: '#7a7060', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Timeline
                        </label>
                        <input
                          className="av-input-mini finp"
                          value={fields.timeline || ''}
                          onChange={(e) => updateField('timeline', e.target.value)}
                          placeholder="e.g. 3 months"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="av-summary-card">
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#C9A84C', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
                      Client Info
                    </div>

                    <div className="av-field-row">
                      <label className="flbl" style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: '#7a7060', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Name
                      </label>
                      <input
                        className="av-input-mini finp"
                        value={fields.client_name || ''}
                        onChange={(e) => updateField('client_name', e.target.value)}
                        placeholder="Client name"
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label className="flbl" style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: '#7a7060', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Email
                        </label>
                        <input
                          className="av-input-mini finp"
                          type="email"
                          value={fields.client_email || ''}
                          onChange={(e) => updateField('client_email', e.target.value)}
                          placeholder="email@example.com"
                        />
                      </div>
                      <div>
                        <label className="flbl" style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: '#7a7060', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Phone
                        </label>
                        <input
                          className="av-input-mini finp"
                          type="tel"
                          value={fields.client_phone || ''}
                          onChange={(e) => updateField('client_phone', e.target.value)}
                          placeholder="(555) 000-0000"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="av-summary-card">
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#C9A84C', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
                      Scope
                    </div>

                    <div className="av-field-row">
                      <label className="flbl" style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: '#7a7060', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Summary
                      </label>
                      <textarea
                        className="av-textarea-mini finp"
                        value={fields.scope_summary || ''}
                        onChange={(e) => updateField('scope_summary', e.target.value)}
                        placeholder="Describe the project scope…"
                      />
                    </div>

                    {scopeItems && scopeItems.length > 0 && (
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#7a7060', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                          Scope Items
                        </div>
                        <div>
                          {scopeItems.map((item, i) => (
                            <span key={i} className="av-chip">{item}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {rooms.some((r) => r.name || calcSqft(r)) && (
                    <div className="av-summary-card">
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#C9A84C', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
                        Measurements
                      </div>
                      {rooms.filter((r) => r.name || calcSqft(r)).map((room, i) => {
                        const sqft = calcSqft(room);
                        return (
                          <div
                            key={i}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '6px 0',
                              borderBottom: '1px solid #E8E4DC',
                              fontSize: 14,
                              color: '#0A1F44',
                            }}
                          >
                            <span>{room.name || `Area ${i + 1}`}</span>
                            <span style={{ color: '#7a7060', fontSize: 13 }}>
                              {sqft ? `${sqft.toLocaleString()} sq ft` : '—'}
                            </span>
                          </div>
                        );
                      })}
                      {totalSqft > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontWeight: 700, fontSize: 14, color: '#0A1F44' }}>
                          <span>Total</span>
                          <span style={{ color: '#C9A84C' }}>{totalSqft.toLocaleString()} sq ft</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="av-step-footer">
                  <button
                    className="btn btn-navy"
                    style={{ width: '100%', opacity: submitting ? 0.6 : 1 }}
                    onClick={handleSubmit}
                    disabled={submitting}
                  >
                    {submitting ? 'Submitting…' : 'Submit Project Request'}
                  </button>
                  <button
                    className="av-skip"
                    onClick={() => setStep(2)}
                    disabled={submitting}
                  >
                    ← Back to Measurements
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
