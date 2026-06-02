import { useState, useEffect, useRef } from 'react';
import { sb, AV_USER_ID, AV_TENANT, ANON_KEY, GENERATE_ESTIMATE_URL, sbLoadOhShitMoments, sbToggleOhShitProposal, sbRunGapAnalysis } from '../../../lib/supabase';
import { sbCommitEstimate } from '../../../lib/commitEstimate';
import { Ic, f$, isMob } from '../../../lib/utils';
import GapResolutionModal from '../consultation/GapResolutionModal';
import MeasurePanel from '../consultation/MeasurePanel';
import AmbientPanel from '../consultation/AmbientPanel';

const NAV = '#0A1F44';
const GOLD = '#C9A84C';
const CREAM = '#F7F5F0';
const BORDER = '#E8E4DC';

const LIKELIHOOD_COLORS = {
  low: { bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7' },
  medium: { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D' },
  high: { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
};

function StatusBadge({ status }) {
  const map = {
    idle: { bg: '#E5E7EB', text: '#374151', label: 'Idle' },
    ambient: { bg: '#DBEAFE', text: '#1E40AF', label: 'Ambient' },
    measure: { bg: '#FEF3C7', text: '#92400E', label: 'Measuring' },
    complete: { bg: '#D1FAE5', text: '#065F46', label: 'Complete' },
  };
  const s = map[status] || map.idle;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 20,
        background: s.bg,
        color: s.text,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: 0.3,
      }}
    >
      {s.label}
    </span>
  );
}

function LikelihoodBadge({ likelihood }) {
  const c = LIKELIHOOD_COLORS[likelihood] || LIKELIHOOD_COLORS.medium;
  return (
    <span
      style={{
        padding: '2px 10px',
        borderRadius: 20,
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
        fontSize: 12,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      {likelihood}
    </span>
  );
}

export default function ConsultationTab({ job, profile, setTab }) {
  const mob = isMob();
  const [sessionId, setSessionId] = useState(null);
  const [phase, setPhase] = useState('idle');
  const [transcript, setTranscript] = useState('');
  const [extraction, setExtraction] = useState(null);
  const [measurements, setMeasurements] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [ohShitToggled, setOhShitToggled] = useState({});
  const [ohShitDbRows, setOhShitDbRows] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [viewSession, setViewSession] = useState(null);
  const [err, setErr] = useState('');
  const [savingEstimate, setSavingEstimate] = useState(false);
  const [estimateSaved, setEstimateSaved] = useState(false);
  const [gapRunning, setGapRunning] = useState(false);
  const [gapAnalysis, setGapAnalysis] = useState(null);
  const [showGapModal, setShowGapModal] = useState(false);

  const sessionIdRef = useRef(null);

  // Keep sessionIdRef in sync
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Load past sessions + scans on mount
  useEffect(() => {
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);

  const loadSessions = async () => {
    if (!job?.id) return;
    try {
      const { data, error } = await sb
        .from('consultation_sessions')
        .select('*, extractions:consultation_extractions(*), measurements:consultation_measurements(*)')
        .eq('job_id', job.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setSessions(data || []);
    } catch (e) {
      console.error('Failed to load sessions:', e);
    }
  };

  const getHeaders = () => ({
    Authorization: `Bearer ${ANON_KEY}`,
    'Content-Type': 'application/json',
  });

  // ─── Start Session ─────────────────────────────────────────────────────────

  const startSession = async () => {
    setErr('');
    try {
      const userId = AV_USER_ID || profile?.id;
      const tenantId = AV_TENANT || profile?.tenant_id;

      const { data, error } = await sb
        .from('consultation_sessions')
        .insert({
          job_id: job.id,
          started_by: userId,
          tenant_id: tenantId,
          status: 'active',
          started_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;

      setSessionId(data.id);
      sessionIdRef.current = data.id;
      setPhase('ambient');
      setTranscript('');
      setExtraction(null);
      setMeasurements([]);
      setResult(null);
      setEstimateSaved(false);
      // AmbientPanel auto-starts mic on mount
    } catch (e) {
      setErr(`Failed to start session: ${e.message}`);
    }
  };

  // ─── Ensure a session exists (create one if needed) ────────────────────────

  const ensureSession = async () => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const userId = AV_USER_ID || profile?.id;
    const tenantId = AV_TENANT || profile?.tenant_id;
    const { data, error } = await sb
      .from('consultation_sessions')
      .insert({
        job_id: job.id,
        started_by: userId,
        tenant_id: tenantId,
        status: 'active',
        started_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    setSessionId(data.id);
    sessionIdRef.current = data.id;
    return data.id;
  };

  // ─── Transition to Measure ─────────────────────────────────────────────────

  const startMeasuring = () => {
    setErr('');
    // Flush + mic stop handled by AmbientPanel before calling this callback
    setPhase('measure');
  };

  // ─── Run Gap Analyzer ─────────────────────────────────────────────────────

  const runGapAnalyzer = async () => {
    setErr('');
    setGapRunning(true);
    setPhase('complete');
    try {
      const sid = sessionIdRef.current;
      const res = await sbRunGapAnalysis(sid, job.id);
      if (res.error) throw new Error(res.error);
      if (res.gaps?.length) {
        setGapAnalysis(res);
        setShowGapModal(true);
      } else {
        generateEstimate([]);
      }
    } catch (e) {
      console.error('Gap analyzer failed, proceeding to estimate:', e);
      generateEstimate([]);
    } finally {
      setGapRunning(false);
    }
  };

  // ─── Done Measuring → Gap Analyze → Generate ──────────────────────────────

  const doneMeasuring = async () => {
    setErr('');
    try {
      const sid = sessionIdRef.current;
      if (sid) await sb.from('consultation_sessions').update({ status: 'complete' }).eq('id', sid);
      runGapAnalyzer();
    } catch (e) {
      setErr(`Failed to finish measuring: ${e.message}`);
    }
  };

  // ─── End Session from Ambient (skip measure) ──────────────────────────────

  const endSessionFromAmbient = async () => {
    setErr('');
    // Flush + mic stop handled by AmbientPanel before calling this callback
    try {
      const sid2 = sessionIdRef.current;
      if (sid2) await sb.from('consultation_sessions').update({ status: 'complete' }).eq('id', sid2);
      runGapAnalyzer();
    } catch (e) {
      setErr(`Failed to end session: ${e.message}`);
    }
  };

  // ─── Generate Estimate ─────────────────────────────────────────────────────

  const generateEstimate = async (unresolvedGaps = []) => {
    setGenerating(true);
    setErr('');
    try {
      const headers = getHeaders();
      const res = await fetch(GENERATE_ESTIMATE_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ session_id: sessionIdRef.current, job_id: job.id, unresolved_gaps: unresolvedGaps }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setResult(json);

      if (json.oh_shit_moments?.length) {
        // Fetch DB rows (with IDs) so toggles can persist
        const dbRows = await sbLoadOhShitMoments(job.id);
        const sessionRows = dbRows.filter(r => r.session_id === sessionIdRef.current);
        setOhShitDbRows(sessionRows);
        const defaults = {};
        json.oh_shit_moments.forEach((m, i) => {
          const dbRow = sessionRows.find(r => r.condition === (m.condition || m.issue || m.title)) || sessionRows[i];
          const key = dbRow?.id ?? i;
          defaults[key] = dbRow ? dbRow.included_in_proposal : true;
        });
        setOhShitToggled(defaults);
      }

      await loadSessions();
    } catch (e) {
      setErr(`Generate failed: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  // ─── Save Estimate to job_estimates ───────────────────────────────────────

  const saveEstimate = async () => {
    if (!result || savingEstimate) return;
    setSavingEstimate(true);
    setErr('');
    try {
      const userId = AV_USER_ID || profile?.id;
      const tenantId = AV_TENANT || profile?.tenant_id;
      // Upsert keyed on job_id — coexists with Estimator chat row (writes messages only).
      // Multi-source split deferred until Estimator produces structured iterative output.
      // oh_shit_moments snapshot omitted — live oh_shit_moments table with included_in_proposal is truth.
      const { data: estRow, error } = await sb.from('job_estimates').upsert({
        job_id: job.id,
        session_id: sessionIdRef.current,
        tenant_id: tenantId,
        created_by: userId,
        estimate_data: result.estimate,
        total: result.estimate?.total,
        source: 'ai_consultation',
      }, { onConflict: 'job_id' }).select('id').single();
      if (error) throw error;

      // Persist line items for Budget vs Actual
      const trades = result.estimate?.trades || [];
      const commitItems = trades.flatMap(trade =>
        (trade.line_items || []).map(li => ({
          source:      'consultation',
          trade:       trade.trade,
          category:    'labor',
          description: li.description || trade.trade,
          quantity:    Number(li.qty  ?? 1),
          unit:        li.unit  || null,
          unit_cost:   Number(li.unit_cost ?? li.total ?? 0),
          multiplier:  1.0,
          markup_pct:  0,
          notes:       null,
          waste_pct:   null,
        }))
      );
      if (commitItems.length) {
        const commitResult = await sbCommitEstimate(sb, tenantId, userId, {
          source:     'consultation',
          jobId:      job.id,
          estimateId: estRow?.id || null,
          items:      commitItems,
        });
        if (!commitResult.ok) throw new Error(commitResult.error);
      }

      setEstimateSaved(true);
      setTab?.('estimate');
    } catch (e) {
      setErr(`Save failed: ${e.message}`);
    } finally {
      setSavingEstimate(false);
    }
  };

  // ─── Render Helpers ───────────────────────────────────────────────────────

  const ExtractionPills = ({ ext }) => {
    if (!ext) return null;
    const categories = [
      { key: 'client_concerns', label: 'Concern', color: '#FEE2E2', textColor: '#991B1B' },
      { key: 'risk_flags', label: 'Risk', color: '#FEF3C7', textColor: '#92400E' },
      { key: 'budget_signals', label: 'Budget', color: '#D1FAE5', textColor: '#065F46' },
      { key: 'priorities', label: 'Priority', color: '#DBEAFE', textColor: '#1E40AF' },
      { key: 'notes', label: 'Note', color: '#EDE9FE', textColor: '#5B21B6' },
    ];
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {categories.map(({ key, label, color, textColor }) =>
          (ext[key] || []).map((item, i) => (
            <span
              key={`${key}-${i}`}
              style={{
                padding: '3px 10px',
                borderRadius: 20,
                background: color,
                color: textColor,
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              <span style={{ opacity: 0.7, marginRight: 4 }}>{label}:</span>
              {item}
            </span>
          ))
        )}
      </div>
    );
  };

  // ─── Idle Phase ────────────────────────────────────────────────────────────

  const renderIdle = () => (
    <div>
      <div style={{ display: 'flex', flexDirection: mob ? 'column' : 'row', gap: 10, marginBottom: 28 }}>
        <button className="btn btn-gold" style={{ flex: 1, fontSize: 16, padding: '16px 0' }} onClick={startSession}>
          Start Consultation + Listen
        </button>
        <button className="btn btn-navy" style={{ flex: 1, fontSize: 16, padding: '16px 0' }} onClick={startMeasuring}>
          Jump to Measuring
        </button>
      </div>

      {sessions.length > 0 && (
        <div>
          <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 16, color: NAV, marginBottom: 12 }}>
            Past Sessions
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => setViewSession(viewSession === s.id ? null : s.id)}
                style={{
                  border: `1px solid ${BORDER}`,
                  borderRadius: 10,
                  padding: '12px 16px',
                  background: viewSession === s.id ? '#F0EDE8' : '#fff',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: NAV, fontWeight: 600 }}>
                    {new Date(s.created_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                  <StatusBadge status={s.status} />
                </div>
                {viewSession === s.id && (
                  <div style={{ marginTop: 12 }}>
                    {s.extractions?.[0] && (
                      <>
                        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          Insights
                        </div>
                        <ExtractionPills ext={s.extractions[0]} />
                      </>
                    )}
                    {s.measurements?.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          Trades Measured
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {s.measurements.map((m, i) => (
                            <span key={i} style={{ padding: '2px 10px', background: '#D1FAE5', color: '#065F46', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                              ✓ {m.trade}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: sessions.length > 0 ? 28 : 0, padding: '12px 16px', background: 'rgba(201,168,76,0.08)', borderRadius: 8, fontSize: 13, color: '#666' }}>
        Floor plan scanning has moved to the <strong>Scanner</strong> tab.
      </div>
    </div>
  );

  // ─── Complete / Result Phase ───────────────────────────────────────────────

  const renderComplete = () => {
    if (gapRunning) {
      return (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 22, color: NAV, marginBottom: 12 }}>
            Analyzing Consultation Gaps…
          </div>
          <div style={{ color: '#6B7280', fontSize: 14 }}>
            Reviewing what was asked and flagging anything that could cause a change order.
          </div>
          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center' }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              border: `4px solid ${BORDER}`,
              borderTopColor: GOLD,
              animation: 'spin 0.8s linear infinite',
            }} />
          </div>
        </div>
      );
    }

    if (generating) {
      return (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 22, color: NAV, marginBottom: 12 }}>
            Generating Estimate…
          </div>
          <div style={{ color: '#6B7280', fontSize: 14 }}>
            AI is analyzing session data, measuring takeoffs, and flagging risks.
          </div>
          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center' }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              border: `4px solid ${BORDER}`,
              borderTopColor: GOLD,
              animation: 'spin 0.8s linear infinite',
            }} />
          </div>
        </div>
      );
    }

    if (!result) {
      return (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ color: '#6B7280', marginBottom: 16 }}>No result yet.</div>
          <button className="btn btn-navy" onClick={generateEstimate}>Retry Generate</button>
        </div>
      );
    }

    const est = result.estimate || {};
    const trades = est.trades || est.line_items || [];
    const ohShitMoments = result.oh_shit_moments || [];
    const total = est.total ?? trades.reduce((sum, t) => sum + (t.subtotal || t.total || t.amount || 0), 0);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Estimate breakdown */}
        <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ background: NAV, color: '#fff', padding: mob ? '12px 14px' : '14px 20px' }}>
            <span style={{ fontFamily: 'DM Serif Display, serif', fontSize: 18 }}>Estimate Breakdown</span>
          </div>
          <div style={{ padding: 0 }}>
            {trades.length === 0 && (
              <div style={{ padding: '20px', color: '#6B7280', fontSize: 14 }}>No trade breakdown available.</div>
            )}
            {trades.map((trade, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  padding: mob ? '10px 14px' : '14px 20px',
                  borderBottom: i < trades.length - 1 ? `1px solid ${BORDER}` : 'none',
                  background: i % 2 === 0 ? '#fff' : CREAM,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, color: NAV, fontSize: 14 }}>
                    {trade.trade || trade.name || trade.category}
                  </div>
                  {trade.description && (
                    <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{trade.description}</div>
                  )}
                  {/* Line item details */}
                  {(trade.line_items || []).length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {(trade.line_items || []).map((li, j) => (
                        <div key={j} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                          <div style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.4, flex: 1 }}>
                            {li.description || li.name}
                            {li.qty && li.unit ? <span style={{ color: '#9CA3AF' }}> · {li.qty} {li.unit}</span> : null}
                          </div>
                          <div style={{ fontSize: 11, color: '#374151', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {f$(li.total || li.amount || (li.qty && li.unit_cost ? li.qty * li.unit_cost : 0) || 0)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {trade.confidence !== undefined && (
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                      Confidence: {Math.round((trade.confidence || 0) * 100)}%
                    </div>
                  )}
                </div>
                <div style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, color: NAV, fontSize: 15, whiteSpace: 'nowrap', marginLeft: 16, alignSelf: 'flex-start' }}>
                  {f$(trade.subtotal || trade.total || trade.amount || (trade.line_items || []).reduce((s, li) => s + (li.total || li.amount || (li.qty && li.unit_cost ? li.qty * li.unit_cost : 0) || 0), 0) || 0)}
                </div>
              </div>
            ))}
            {/* Total row */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: mob ? '12px 14px' : '16px 20px',
              background: NAV,
              color: '#fff',
            }}>
              <span style={{ fontFamily: 'DM Serif Display, serif', fontSize: 16 }}>Total Estimate</span>
              <span style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 800, fontSize: 20, color: GOLD }}>
                {f$(total)}
              </span>
            </div>
          </div>
        </div>

        {/* OH SHIT moments */}
        {ohShitMoments.length > 0 && (
          <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ background: '#7F1D1D', color: '#fff', padding: mob ? '12px 14px' : '14px 20px' }}>
              <span style={{ fontFamily: 'DM Serif Display, serif', fontSize: 18 }}>
                OH SHIT Moments
              </span>
              <div style={{ fontSize: 12, color: '#FCA5A5', marginTop: 2 }}>
                Risks to surface with the client
              </div>
            </div>
            <div>
              {ohShitMoments.map((m, i) => {
                const dbRow = ohShitDbRows.find(r => r.condition === (m.condition || m.issue || m.title)) || ohShitDbRows[i];
                const key = dbRow?.id ?? i;
                const included = !!ohShitToggled[key];
                return (
                  <div
                    key={key}
                    style={{
                      padding: mob ? '12px 14px' : '16px 20px',
                      borderBottom: i < ohShitMoments.length - 1 ? `1px solid ${BORDER}` : 'none',
                      background: included ? '#FFFBEB' : '#fff',
                      transition: 'background 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: mob ? 'column' : 'row', justifyContent: 'space-between', alignItems: mob ? 'flex-start' : 'flex-start', gap: mob ? 8 : 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <LikelihoodBadge likelihood={m.likelihood || 'medium'} />
                          <span style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, color: NAV, fontSize: 14 }}>
                            {m.condition || m.title || m.issue}
                          </span>
                        </div>
                        {m.description && (
                          <div style={{ fontSize: 13, color: '#4B5563', lineHeight: 1.5, marginBottom: 6 }}>
                            {m.description}
                          </div>
                        )}
                        {m.how_to_present && (
                          <div style={{ fontSize: 12, color: '#6B7280', fontStyle: 'italic', marginBottom: 6 }}>
                            <span style={{ fontWeight: 600, fontStyle: 'normal', color: NAV }}>How to present: </span>
                            {m.how_to_present}
                          </div>
                        )}
                        {(m.estimated_cost_low || m.estimated_cost_high || m.cost_low || m.cost_high || m.cost_range) && (
                          <div style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>
                            Potential cost:{' '}
                            {m.cost_range
                              ? m.cost_range
                              : `${f$(m.estimated_cost_low || m.cost_low || 0)} – ${f$(m.estimated_cost_high || m.cost_high || 0)}`}
                          </div>
                        )}
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>
                        <input
                          type="checkbox"
                          checked={included}
                          onChange={() => {
                            const next = !included;
                            setOhShitToggled(prev => ({ ...prev, [key]: next }));
                            if (dbRow?.id) sbToggleOhShitProposal(dbRow.id, next);
                          }}
                          style={{ width: 16, height: 16, accentColor: GOLD, cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap' }}>Include in proposal</span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Save to estimate tab */}
        <div style={{ display: 'flex', flexDirection: mob ? 'column' : 'row', gap: 10 }}>
          <button
            className="btn btn-gold"
            style={{ flex: 1, fontSize: 15, padding: '14px 0' }}
            onClick={saveEstimate}
            disabled={savingEstimate || estimateSaved}
          >
            {estimateSaved ? '✓ Saved — opening Estimate tab…' : savingEstimate ? 'Saving…' : 'Save estimate'}
          </button>
          <button
            className="btn btn-ghost"
            style={{ minWidth: mob ? 'auto' : 120 }}
            onClick={() => {
              setPhase('idle');
              setSessionId(null);
              setResult(null);
              setExtraction(null);
              setMeasurements([]);
              setTranscript('');
              setEstimateSaved(false);
              setGapAnalysis(null);
              setShowGapModal(false);
            }}
          >
            New Session
          </button>
        </div>
      </div>
    );
  };

  // ─── Root Render ───────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div
        style={{
          background: CREAM,
          borderRadius: 14,
          padding: mob ? 14 : 24,
          fontFamily: 'DM Sans, sans-serif',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2
              style={{
                fontFamily: 'DM Serif Display, serif',
                fontSize: mob ? 18 : 22,
                color: NAV,
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              AI Consultation
            </h2>
            <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>
              {job?.name || job?.title || 'Job'} — Ambient · Measure · Generate
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {gapAnalysis && (
              <span style={{ padding: '2px 10px', borderRadius: 20, background: '#D1FAE5', color: '#065F46', fontSize: 11, fontWeight: 700, letterSpacing: 0.3 }}>
                Gaps reviewed
              </span>
            )}
            <StatusBadge status={phase} />
          </div>
        </div>

        {/* Error banner */}
        {err && (
          <div
            style={{
              background: '#FEE2E2',
              border: '1px solid #FCA5A5',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 16,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ color: '#991B1B', fontSize: 13 }}>{err}</span>
            <button
              onClick={() => setErr('')}
              style={{ background: 'none', border: 'none', color: '#991B1B', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}
            >
              ×
            </button>
          </div>
        )}

        {/* Phase content */}
        {phase === 'idle' && renderIdle()}
        {phase === 'ambient' && (
          <AmbientPanel
            jobId={job.id}
            sessionId={sessionId}
            getSessionId={() => sessionIdRef.current}
            onTranscriptUpdate={setTranscript}
            onExtractionUpdate={setExtraction}
            onStartMeasuring={startMeasuring}
            onEnd={endSessionFromAmbient}
          />
        )}
        {phase === 'measure' && (
          <MeasurePanel
            jobId={job.id}
            sessionId={sessionId}
            getSessionId={() => sessionIdRef.current}
            profile={profile}
            transcriptContext={transcript}
            onSessionCreate={ensureSession}
            onMeasurementsUpdate={ms => setMeasurements(ms)}
            onDone={doneMeasuring}
          />
        )}
        {phase === 'complete' && renderComplete()}
      </div>

      <GapResolutionModal
        open={showGapModal && gapAnalysis?.gaps?.length > 0}
        gaps={gapAnalysis?.gaps || []}
        busy={generating}
        onClose={() => setShowGapModal(false)}
        onGenerate={generateEstimate}
      />

    </>
  );
}
