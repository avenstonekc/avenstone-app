import { useState, useEffect, useRef } from 'react';
import { sb, AV_USER_ID, AV_TENANT, sbToggleOhShitProposal, sbRunGapAnalysis, sbCreateCOFromOhShit, sbLoadJobRoomScopes, sbLoadEngagementsForJob } from '../../../lib/supabase';
import { sessionToEstimatePrefill } from '../../../lib/sessionToEstimatePrefill';
import { Ic, f$, isMob, ls } from '../../../lib/utils';
import GapResolutionModal from '../consultation/GapResolutionModal';
import MeasurePanel from '../consultation/MeasurePanel';
import AmbientPanel from '../consultation/AmbientPanel';
import RecapPanel from '../consultation/RecapPanel';

const NAV = 'var(--navy-900)';
const GOLD = 'var(--gold-500)';
const CREAM = 'var(--bg)';
const BORDER = 'var(--border)';

const LIKELIHOOD_COLORS = {
  low:    { bg: 'var(--green-bg)',  text: 'var(--green-text-strong)',  border: '#6EE7B7' },
  medium: { bg: 'var(--amber-bg)', text: 'var(--amber-text-strong)',   border: 'var(--amber-border)' },
  high:   { bg: 'var(--red-bg)',   text: 'var(--red-text-strong)',   border: 'var(--red-border)' },
};

function StatusBadge({ status }) {
  const map = {
    idle:     { bg: '#E5E7EB',             text: 'var(--text-secondary)', label: 'Idle' },
    ambient:  { bg: 'var(--blue-bg)',      text: 'var(--blue-text)',      label: 'Ambient' },
    measure:  { bg: 'var(--amber-bg)',     text: 'var(--amber-text-strong)',               label: 'Measuring' },
    complete: { bg: 'var(--green-bg)',     text: 'var(--green-text-strong)',               label: 'Complete' },
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
  const [result, setResult] = useState(null);
  const [ohShitToggled, setOhShitToggled] = useState({});
  const [ohShitDbRows, setOhShitDbRows] = useState([]);
  const [convertingMomentId, setConvertingMomentId] = useState(null);
  const [convertAmt, setConvertAmt] = useState('');
  const [convertSaving, setConvertSaving] = useState(false);
  const [convertMsgs, setConvertMsgs] = useState({});
  const [sessions, setSessions] = useState([]);
  const [viewSession, setViewSession] = useState(null);
  const [err, setErr] = useState('');
  const [savingEstimate, setSavingEstimate] = useState(false);
  const [estimateSaved, setEstimateSaved] = useState(false);
  const [gapRunning, setGapRunning] = useState(false);
  const [gapAnalysis, setGapAnalysis] = useState(null);
  const [showGapModal, setShowGapModal] = useState(false);
  const [unresolvedGaps, setUnresolvedGaps] = useState([]);

  // WALKTHROUGH_TYPES — session audience picker (client walk default vs sub walk)
  const [walkType, setWalkType] = useState('client_walk');
  const [engagements, setEngagements] = useState([]);
  const [selectedTrades, setSelectedTrades] = useState([]);
  const [selectedSubId, setSelectedSubId] = useState('');

  const sessionIdRef = useRef(null);

  // Keep sessionIdRef in sync
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Load past sessions + scans on mount
  useEffect(() => {
    loadSessions();
    loadEngagements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);

  // WALKTHROUGH_TYPES — engaged subs/trades power the sub-walk trade + sub pickers
  const loadEngagements = async () => {
    if (!job?.id) return;
    const res = await sbLoadEngagementsForJob(job.id);
    if (res?.ok) setEngagements(res.data || []);
  };

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

  // ─── Start Session ─────────────────────────────────────────────────────────
  // WALKTHROUGH_TYPES — the insert carries the audience type + trade scope. Client
  // walk stores type only; sub walk also stores the trade full-path(s) and (optionally)
  // the specific engaged sub. Consumed by the coach (Slice 2) and recap (Slice 3).

  const startSession = async () => {
    setErr('');
    try {
      const isSub = walkType === 'sub_walk';
      const { data, error } = await sb
        .from('consultation_sessions')
        .insert({
          job_id: job.id,
          started_by: AV_USER_ID || profile?.id,
          tenant_id: AV_TENANT || profile?.tenant_id,
          status: 'active',
          started_at: new Date().toISOString(),
          session_type: walkType,
          trade_scope: isSub && selectedTrades.length ? selectedTrades : null,
          walk_sub_id: isSub && selectedSubId ? selectedSubId : null,
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
    const isSub = walkType === 'sub_walk';
    const { data, error } = await sb
      .from('consultation_sessions')
      .insert({
        job_id: job.id,
        started_by: AV_USER_ID || profile?.id,
        tenant_id: AV_TENANT || profile?.tenant_id,
        status: 'active',
        started_at: new Date().toISOString(),
        session_type: walkType,
        trade_scope: isSub && selectedTrades.length ? selectedTrades : null,
        walk_sub_id: isSub && selectedSubId ? selectedSubId : null,
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
        finishToComplete([]);
      }
    } catch (e) {
      console.error('Gap analyzer failed, proceeding:', e);
      finishToComplete([]);
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

  // ─── Session captured → complete phase ─────────────────────────────────────
  // The old generate-estimate-from-session path (invented pricing + a dead cost-plus
  // hardcode) is RETIRED. Risk capture (oh_shit_moments) now rides the user-triggered
  // recap compose call (compose-consultation-recap), which also absorbs unresolved gaps.
  // Pricing lives only in the Rate Book estimator via the session→estimate prefill.

  const finishToComplete = (gaps = []) => {
    setUnresolvedGaps(gaps);
    setResult({ captured: true });
    loadSessions();
  };

  // Called after the rep composes the recap — the compose fn returns this session's
  // oh_shit rows (with IDs) so the toggles + CO conversion persist.
  const handleRecapComposed = (rows) => {
    const sessionRows = rows || [];
    setOhShitDbRows(sessionRows);
    const defaults = {};
    sessionRows.forEach((r) => { defaults[r.id] = r.included_in_proposal; });
    setOhShitToggled(defaults);
  };

  // ─── Convert oh-shit moment to a pending change order ─────────────────────

  const handleConvertToCO = async (momentId, defaultAmt) => {
    if (convertingMomentId !== momentId) {
      setConvertingMomentId(momentId);
      setConvertAmt(String(defaultAmt || ''));
      setConvertMsgs(prev => ({ ...prev, [momentId]: '' }));
      return;
    }
    setConvertSaving(true);
    const result = await sbCreateCOFromOhShit({
      ohShitMomentId: momentId,
      jobId: job.id,
      amount: convertAmt !== '' ? Number(convertAmt) : defaultAmt,
    });
    setConvertSaving(false);
    if (result.ok) {
      setOhShitDbRows(prev => prev.map(r => r.id === momentId ? { ...r, converted_to_co_id: result.data.id } : r));
      setConvertMsgs(prev => ({ ...prev, [momentId]: 'CO created — approve it in the Change Orders tab.' }));
      setConvertingMomentId(null);
    } else {
      setConvertMsgs(prev => ({ ...prev, [momentId]: result.error }));
    }
    setConvertSaving(false);
  };

  // ─── Draft estimate from session (P1A reroute) ────────────────────────────
  // The session no longer generates/commits its own priced estimate (that path
  // invented prices with no Rate Book). Instead the captured data PREFILLS the
  // ai-estimator entry and hands off to the Estimate tab, where the rep runs the
  // Rate Book interview OVER the prefill — feeds the interview, never bypasses it.
  const draftEstimateFromSession = async () => {
    if (savingEstimate) return;
    setSavingEstimate(true);
    setErr('');
    try {
      const sid = sessionIdRef.current;
      const [extRes, measRes, roomScopes] = await Promise.all([
        sb.from('consultation_extractions').select('*').eq('session_id', sid).maybeSingle(),
        sb.from('consultation_measurements').select('*').eq('session_id', sid),
        sbLoadJobRoomScopes(job.id),
      ]);
      const prefill = sessionToEstimatePrefill({
        extraction: extRes.data,
        measurements: measRes.data || [],
        roomScopes: roomScopes || [],
        jobScope: job.scope || '',
        sessionId: sid,
        sessionDate: new Date().toISOString(),
      });
      ls(`av_estimate_prefill_${job.id}`, prefill);
      setEstimateSaved(true);
      setTab?.('estimate');
    } catch (e) {
      setErr(`Couldn't draft estimate: ${e.message}`);
    } finally {
      setSavingEstimate(false);
    }
  };

  // ─── Render Helpers ───────────────────────────────────────────────────────

  const ExtractionPills = ({ ext }) => {
    if (!ext) return null;
    const categories = [
      { key: 'client_concerns', label: 'Concern', color: 'var(--red-bg)', textColor: 'var(--red-text-strong)' },
      { key: 'risk_flags', label: 'Risk', color: '#FEF3C7', textColor: 'var(--amber-text-strong)' },
      { key: 'budget_signals', label: 'Budget', color: 'var(--green-bg)', textColor: 'var(--green-text-strong)' },
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

  const renderIdle = () => {
    // WALKTHROUGH_TYPES — derive the sub-walk pickers from the job's engaged subs
    const engagedTrades = [...new Set(engagements.map((e) => e.trade).filter(Boolean))];
    const subsForTrades = engagements.filter(
      (e) => !selectedTrades.length || selectedTrades.includes(e.trade)
    );
    const subOptions = [
      ...new Map(subsForTrades.filter((e) => e.sub?.id).map((e) => [e.sub.id, e.sub])).values(),
    ];
    const subWalkReady = walkType === 'client_walk' || selectedTrades.length > 0;

    return (
    <div>
      {/* WALKTHROUGH_TYPES — pick the audience for this walk before starting */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
          Walkthrough type
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { key: 'client_walk', label: 'Client Walkthrough', sub: 'Homeowner recap' },
            { key: 'sub_walk', label: 'Sub Walkthrough', sub: 'Trade scope for a sub' },
          ].map((opt) => {
            const on = walkType === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => {
                  setWalkType(opt.key);
                  if (opt.key === 'client_walk') { setSelectedTrades([]); setSelectedSubId(''); }
                }}
                style={{
                  flex: 1, textAlign: 'left', cursor: 'pointer',
                  border: `2px solid ${on ? GOLD : BORDER}`,
                  background: on ? 'rgba(201,168,76,0.10)' : '#fff',
                  borderRadius: 10, padding: '10px 14px',
                }}
              >
                <div style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: 14, color: NAV }}>{opt.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{opt.sub}</div>
              </button>
            );
          })}
        </div>

        {walkType === 'sub_walk' && (
          <div style={{ marginTop: 12, padding: '12px 14px', border: `1px solid ${BORDER}`, borderRadius: 10, background: '#fff' }}>
            {engagedTrades.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                No subs engaged on this job yet. Engage a sub in the <strong>Subs</strong> tab first, or run a client walkthrough.
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8 }}>
                  Which trade(s) is this walk for?
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {engagedTrades.map((tr) => {
                    const on = selectedTrades.includes(tr);
                    return (
                      <button
                        key={tr}
                        onClick={() => setSelectedTrades(on ? selectedTrades.filter((t) => t !== tr) : [...selectedTrades, tr])}
                        style={{
                          cursor: 'pointer', borderRadius: 20, fontSize: 13, fontWeight: 600, padding: '5px 12px',
                          border: `1px solid ${on ? GOLD : BORDER}`,
                          background: on ? GOLD : '#fff',
                          color: on ? NAV : 'var(--text-secondary)',
                        }}
                      >
                        {on ? '✓ ' : ''}{tr}
                      </button>
                    );
                  })}
                </div>
                {subOptions.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>
                      Sub (optional)
                    </div>
                    <select
                      value={selectedSubId}
                      onChange={(e) => setSelectedSubId(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 14, fontFamily: 'DM Sans, sans-serif', background: '#fff', color: NAV }}
                    >
                      <option value="">— Not specified —</option>
                      {subOptions.map((s) => (
                        <option key={s.id} value={s.id}>{s.full_name || s.email}</option>
                      ))}
                    </select>
                  </div>
                )}
                {!subWalkReady && (
                  <div style={{ fontSize: 12, color: 'var(--amber-text-strong)', marginTop: 10 }}>
                    Pick at least one trade to start a sub walk.
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: mob ? 'column' : 'row', gap: 10, marginBottom: 28 }}>
        <button className="btn btn-gold" style={{ flex: 1, fontSize: 16, padding: '16px 0', opacity: subWalkReady ? 1 : 0.5 }} onClick={startSession} disabled={!subWalkReady}>
          {walkType === 'sub_walk' ? 'Start Sub Walk + Listen' : 'Start Consultation + Listen'}
        </button>
        <button className="btn btn-navy" style={{ flex: 1, fontSize: 16, padding: '16px 0', opacity: subWalkReady ? 1 : 0.5 }} onClick={startMeasuring} disabled={!subWalkReady}>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: NAV, fontWeight: 600 }}>
                    {new Date(s.created_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {s.session_type === 'sub_walk' && (
                      <span style={{ padding: '2px 8px', borderRadius: 20, background: '#EDE9FE', color: '#5B21B6', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        Sub Walk{s.trade_scope?.length ? ` · ${s.trade_scope.join(', ')}` : ''}
                      </span>
                    )}
                    <StatusBadge status={s.status} />
                  </div>
                </div>
                {viewSession === s.id && (
                  <div style={{ marginTop: 12 }}>
                    {s.extractions?.[0] && (
                      <>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          Insights
                        </div>
                        <ExtractionPills ext={s.extractions[0]} />
                      </>
                    )}
                    {s.measurements?.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          Trades Measured
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {s.measurements.map((m, i) => (
                            <span key={i} style={{ padding: '2px 10px', background: 'var(--green-bg)', color: 'var(--green-text-strong)', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
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
  };

  // ─── Complete / Result Phase ───────────────────────────────────────────────

  const renderComplete = () => {
    if (gapRunning) {
      return (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 22, color: NAV, marginBottom: 12 }}>
            Analyzing Consultation Gaps…
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
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

    if (!result) {
      return (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: 16 }}>No result yet.</div>
          <button className="btn btn-navy" onClick={() => finishToComplete([])}>Continue</button>
        </div>
      );
    }

    const ohShitMoments = ohShitDbRows;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Session captured — estimate drafts in the Estimate tab (Rate Book pricing) */}
        <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, padding: mob ? '14px 16px' : '18px 22px' }}>
          <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 18, color: NAV, marginBottom: 6 }}>
            Session captured
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Risks below are saved to this job. Draft the estimate in the Estimate tab — your
            on-site scope, rooms, and notes prefill the estimator, then you run it over the
            Rate Book (your configured markup + PM fee) and confirm what the session assumed.
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
                const dbRow = m;
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
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 6 }}>
                            <span style={{ fontWeight: 600, fontStyle: 'normal', color: NAV }}>How to present: </span>
                            {m.how_to_present}
                          </div>
                        )}
                        {(m.estimated_cost_low || m.estimated_cost_high || m.cost_low || m.cost_high || m.cost_range) && (
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
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
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Include in proposal</span>
                      </label>
                    </div>
                    {/* CO conversion row — owner/PM only, requires a persisted DB row */}
                    {dbRow?.id && ['owner', 'project_manager'].includes(profile?.role) && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #F3F4F6', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                        {dbRow.converted_to_co_id ? (
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#15803d', background: 'var(--green-bg)', borderRadius: 6, padding: '3px 10px' }}>
                            → CO created
                          </span>
                        ) : convertingMomentId === dbRow.id ? (
                          <>
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Amount: $</span>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={convertAmt}
                              onChange={e => setConvertAmt(e.target.value)}
                              style={{ width: 90, padding: '4px 8px', borderRadius: 6, border: '1px solid #D1D5DB', fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}
                            />
                            <button
                              className="btn btn-gold"
                              style={{ fontSize: 12, padding: '4px 12px' }}
                              disabled={convertSaving}
                              onClick={() => handleConvertToCO(dbRow.id, 0)}
                            >
                              {convertSaving ? 'Creating…' : 'Create CO'}
                            </button>
                            <button
                              className="btn btn-ghost"
                              style={{ fontSize: 12, padding: '4px 10px' }}
                              disabled={convertSaving}
                              onClick={() => { setConvertingMomentId(null); setConvertMsgs(prev => ({ ...prev, [dbRow.id]: '' })); }}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn btn-ghost"
                            style={{ fontSize: 12, padding: '4px 12px', border: '1px solid #D1D5DB' }}
                            onClick={() => {
                              const low = Number(m.estimated_cost_low || m.cost_low || 0);
                              const high = Number(m.estimated_cost_high || m.cost_high || 0);
                              const mid = Math.round(((low + high) / 2) * 100) / 100;
                              handleConvertToCO(dbRow.id, mid);
                            }}
                          >
                            → Create CO from this risk
                          </button>
                        )}
                        {convertMsgs[dbRow.id] ? (
                          <span style={{ fontSize: 12, color: convertMsgs[dbRow.id].startsWith('CO created') ? '#15803d' : '#ef4444' }}>
                            {convertMsgs[dbRow.id]}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Client recap — scope-only branded PDF, emailed to the client. Composing it also
            runs risk capture (oh_shit_moments), absorbing the retired generate-estimate path. */}
        {sessionIdRef.current && (
          <RecapPanel
            job={job}
            sessionId={sessionIdRef.current}
            unresolvedGaps={unresolvedGaps}
            onComposed={handleRecapComposed}
            sessionType={walkType}
            tradeScope={selectedTrades}
          />
        )}

        {/* Draft estimate from session → Estimate tab (Rate Book) */}
        <div style={{ display: 'flex', flexDirection: mob ? 'column' : 'row', gap: 10 }}>
          <button
            className="btn btn-gold"
            style={{ flex: 1, fontSize: 15, padding: '14px 0' }}
            onClick={draftEstimateFromSession}
            disabled={savingEstimate || estimateSaved}
          >
            {estimateSaved ? '✓ Opening Estimate tab…' : savingEstimate ? 'Drafting…' : 'Draft Estimate from Session →'}
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
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
              {job?.name || job?.title || 'Job'} — Ambient · Measure · Generate
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {gapAnalysis && (
              <span style={{ padding: '2px 10px', borderRadius: 20, background: 'var(--green-bg)', color: 'var(--green-text-strong)', fontSize: 11, fontWeight: 700, letterSpacing: 0.3 }}>
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
              background: 'var(--red-bg)',
              border: '1px solid #FCA5A5',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 16,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ color: 'var(--red-text-strong)', fontSize: 13 }}>{err}</span>
            <button
              onClick={() => setErr('')}
              style={{ background: 'none', border: 'none', color: 'var(--red-text-strong)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}
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
            tradeScope={walkType === 'sub_walk' ? selectedTrades : null}
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
        busy={false}
        onClose={() => setShowGapModal(false)}
        onGenerate={(gaps) => { setShowGapModal(false); finishToComplete(gaps || []); }}
      />

    </>
  );
}
