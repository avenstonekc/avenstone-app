import { useState, useEffect, useRef, useCallback } from 'react';
import { sb, AV_USER_ID, AV_TENANT, ANON_KEY, PROCESS_TRANSCRIPT_URL, GENERATE_ESTIMATE_URL, sbSaveEstimateLineItems, sbLoadOhShitMoments, sbToggleOhShitProposal, sbRunGapAnalysis } from '../../../lib/supabase';
import { Ic, f$, isMob } from '../../../lib/utils';

const NAV = '#0A1F44';
const GOLD = '#C9A84C';
const CREAM = '#F7F5F0';
const BORDER = '#E8E4DC';

const LIKELIHOOD_COLORS = {
  low: { bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7' },
  medium: { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D' },
  high: { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
};

function PulseRecording() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: '#EF4444',
        boxShadow: '0 0 0 0 rgba(239,68,68,0.7)',
        animation: 'pulse-rec 1.4s infinite',
        marginRight: 8,
        verticalAlign: 'middle',
      }}
    />
  );
}

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
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [extraction, setExtraction] = useState(null);
  const [measurements, setMeasurements] = useState([]);
  const [currentTrade, setCurrentTrade] = useState('');
  const [tradeMessages, setTradeMessages] = useState([]);
  const [repInput, setRepInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [ohShitToggled, setOhShitToggled] = useState({});
  const [ohShitDbRows, setOhShitDbRows] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [viewSession, setViewSession] = useState(null);
  const [err, setErr] = useState('');
  const [savingEstimate, setSavingEstimate] = useState(false);
  const [estimateSaved, setEstimateSaved] = useState(false);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [measureListening, setMeasureListening] = useState(false);
  const [gapRunning, setGapRunning] = useState(false);
  const [gapAnalysis, setGapAnalysis] = useState(null);
  const [showGapModal, setShowGapModal] = useState(false);
  const [gapResolutions, setGapResolutions] = useState({});
  const [gapNotes, setGapNotes] = useState({});
  const [gapNotesOpen, setGapNotesOpen] = useState({});

  const recognitionRef = useRef(null);
  const measureRecogRef = useRef(null);
  const transcriptRef = useRef('');
  const ambientIntervalRef = useRef(null);
  const chatBottomRef = useRef(null);
  const sessionIdRef = useRef(null);
  const voicesRef = useRef([]);

  // Load TTS voices
  useEffect(() => {
    const load = () => { voicesRef.current = window.speechSynthesis?.getVoices() || []; };
    load();
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = load;
  }, []);

  const speakMeasure = (text) => {
    if (!window.speechSynthesis || !text) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/[*_`#>\-]/g, '').replace(/\n+/g, '. ').trim();
    const utt = new SpeechSynthesisUtterance(clean);
    const voices = voicesRef.current;
    utt.voice = voices.find(v => v.name === 'Samantha') ||
                voices.find(v => v.name === 'Karen') ||
                voices.find(v => v.name.includes('Google') && v.lang === 'en-US') ||
                voices.find(v => v.lang.startsWith('en-US')) ||
                voices[0] || null;
    utt.rate = 1.0; utt.pitch = 1; utt.volume = 1;
    window.speechSynthesis.speak(utt);
  };

  const startMeasureMic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    window.speechSynthesis?.cancel();
    const recog = new SR();
    recog.continuous = false;
    recog.interimResults = false;
    recog.lang = 'en-US';
    recog.onstart = () => setMeasureListening(true);
    recog.onresult = e => {
      const text = e.results[0]?.[0]?.transcript || '';
      if (text) setRepInput(text);
    };
    recog.onend = () => { setMeasureListening(false); measureRecogRef.current = null; };
    recog.onerror = () => { setMeasureListening(false); measureRecogRef.current = null; };
    measureRecogRef.current = recog;
    recog.start();
  };

  const stopMeasureMic = () => {
    measureRecogRef.current?.stop();
    measureRecogRef.current = null;
    setMeasureListening(false);
  };

  // Keep sessionIdRef in sync
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Keep transcriptRef in sync
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  // Load past sessions on mount
  useEffect(() => {
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);

  // Scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [tradeMessages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMicCleanup();
      if (ambientIntervalRef.current) clearInterval(ambientIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ─── Mic / Speech Recognition ─────────────────────────────────────────────

  const startMic = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setErr('Speech recognition is not supported in this browser. Use Chrome for full functionality.');
        return false;
      }
      const accumulatedRef = { current: transcriptRef.current };
      const stillRecording = { current: true };

      const startRecog = () => {
        if (!stillRecording.current) return;
        const recog = new SpeechRecognition();
        recog.continuous = true;
        recog.interimResults = true;
        recog.lang = 'en-US';

        recog.onresult = (e) => {
          // Append only newly finalized results to avoid duplication
          let newText = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) {
              newText += e.results[i][0].transcript + ' ';
            }
          }
          if (newText) {
            accumulatedRef.current = (accumulatedRef.current + ' ' + newText).trim();
            setTranscript(accumulatedRef.current);
          }
        };

        recog.onerror = (e) => {
          if (e.error === 'not-allowed') {
            setErr('Microphone access denied. Allow mic in browser settings.');
            stillRecording.current = false;
          }
          // aborted / no-speech / network: just restart
        };

        recog.onend = () => {
          if (stillRecording.current) {
            setTimeout(startRecog, 300);
          }
        };

        recog.start();
        recognitionRef.current = recog;
      };

      startRecog();
      recognitionRef.current = { stop: () => { stillRecording.current = false; recognitionRef.current?.abort?.(); } };
      setIsRecording(true);
      return true;
    } catch (e) {
      setErr(`Microphone access denied: ${e.message}`);
      return false;
    }
  };

  const stopMicCleanup = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }
    setIsRecording(false);
  };

  const stopMic = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsRecording(false);
  };

  // ─── Ambient interval (every 60s) ─────────────────────────────────────────

  const startAmbientInterval = (sid) => {
    if (ambientIntervalRef.current) clearInterval(ambientIntervalRef.current);
    ambientIntervalRef.current = setInterval(async () => {
      const chunk = transcriptRef.current;
      if (!chunk || chunk.trim().length < 20) return;
      try {
        const headers = getHeaders();
        const res = await fetch(PROCESS_TRANSCRIPT_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            session_id: sessionIdRef.current || sid,
            job_id: job.id,
            transcript_chunk: chunk,
            mode: 'ambient',
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();
        if (json.extraction) setExtraction(json.extraction);
      } catch (e) {
        console.error('Ambient processing error:', e);
      }
    }, 60000);
  };

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
      setPhase('ambient');
      setTranscript('');
      setExtraction(null);
      setMeasurements([]);
      setResult(null);
      setEstimateSaved(false);

      const micOk = await startMic();
      if (micOk) {
        startAmbientInterval(data.id);
      }
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

  const startMeasuring = async () => {
    setErr('');
    stopMic();
    // Flush accumulated transcript before clearing interval — ambient sessions
    // shorter than 60s never fire the interval, leaving no extraction row.
    if (transcriptRef.current && transcriptRef.current.trim().length >= 20) {
      fetch(PROCESS_TRANSCRIPT_URL, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          session_id: sessionIdRef.current,
          job_id: job.id,
          transcript_chunk: transcriptRef.current,
          mode: 'ambient',
        }),
      }).catch(() => {});
    }
    if (ambientIntervalRef.current) {
      clearInterval(ambientIntervalRef.current);
      ambientIntervalRef.current = null;
    }

    try {
      // Guarantee a valid session exists before entering measure mode
      const sid = await ensureSession();

      setPhase('measure');
      setCurrentTrade('');
      setTradeMessages([]);

      // Open the measure conversation
      const headers = getHeaders();
      const openingContext = [
        `Job: ${job.name || job.title || job.id}`,
        job.address ? `Address: ${job.address}` : '',
        job.description ? `Description: ${job.description}` : '',
        extraction?.client_concerns?.length
          ? `Client concerns from ambient: ${extraction.client_concerns.join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');

      const res = await fetch(PROCESS_TRANSCRIPT_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          session_id: sid,
          job_id: job.id,
          transcript_chunk: openingContext,
          mode: 'measure',
          trade: null,
          is_opening: true,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();

      const firstMsg = json.next_question || "What trades are we looking at today? (e.g. roofing, HVAC, electrical, plumbing…)";
      setTradeMessages([{ role: 'ai', text: firstMsg }]);
      speakMeasure(firstMsg);
    } catch (e) {
      setErr(`Failed to start measuring: ${e.message}`);
      setPhase('ambient');
    }
  };

  // ─── Send Measure Chat Message ─────────────────────────────────────────────

  const sendMeasureMessage = async () => {
    const text = repInput.trim();
    if (!text || sendingMsg) return;

    setRepInput('');
    setSendingMsg(true);
    setErr('');

    const updated = [...tradeMessages, { role: 'rep', text }];
    setTradeMessages(updated);

    try {
      // Use ref so we always get the current session ID regardless of closure staleness
      const sid = sessionIdRef.current || await ensureSession();
      const headers = getHeaders();
      const res = await fetch(PROCESS_TRANSCRIPT_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          session_id: sid,
          job_id: job.id,
          transcript_chunk: text,
          mode: 'measure',
          trade: currentTrade || null,
          conversation_history: updated,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();

      if (json.trade_complete && json.fields) {
        const completedTrade = currentTrade || json.trade || 'Unknown';
        setMeasurements((prev) => [
          ...prev,
          { trade: completedTrade, fields: json.fields, completed: true },
        ]);
      }

      if (json.current_trade) setCurrentTrade(json.current_trade);

      const aiReply = json.next_question;
      if (aiReply) {
        setTradeMessages((prev) => [...prev, { role: 'ai', text: aiReply }]);
        speakMeasure(aiReply);
      }

      // Check if all trades done
      if (json.all_trades_complete) {
        const doneMsg = "Great — I have all the measurements I need. Ready to generate the estimate whenever you are.";
        setTradeMessages((prev) => [...prev, { role: 'ai', text: doneMsg }]);
        speakMeasure(doneMsg);
      }
    } catch (e) {
      setErr(`Send failed: ${e.message}`);
      setTradeMessages((prev) => [...prev, { role: 'ai', text: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setSendingMsg(false);
    }
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
        setGapResolutions({});
        setGapNotes({});
        setGapNotesOpen({});
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
    stopMic();
    if (ambientIntervalRef.current) {
      clearInterval(ambientIntervalRef.current);
      ambientIntervalRef.current = null;
    }
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
    setShowGapModal(false);
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
      const included = result.oh_shit_moments?.filter((m, i) => {
        const dbRow = ohShitDbRows.find(r => r.condition === (m.condition || m.issue || m.title)) || ohShitDbRows[i];
        const key = dbRow?.id ?? i;
        return !!ohShitToggled[key];
      }) || [];

      const { data: estRow, error } = await sb.from('job_estimates').insert({
        job_id: job.id,
        session_id: sessionIdRef.current,
        tenant_id: tenantId,
        created_by: userId,
        estimate_data: result.estimate,
        oh_shit_moments: included,
        total: result.estimate?.total,
        source: 'ai_consultation',
        created_at: new Date().toISOString(),
      }).select('id').single();
      if (error) throw error;

      // Persist line items for Budget vs Actual
      const trades = result.estimate?.trades || [];
      const lineItems = trades.flatMap(trade =>
        (trade.line_items || []).map(li => ({
          phase:       trade.trade,
          trade:       trade.trade,
          category:    'labor',
          description: li.description || trade.trade,
          quantity:    Number(li.qty  ?? 1),
          unit:        li.unit  || null,
          unit_cost:   Number(li.unit_cost ?? li.total ?? 0),
          markup_pct:  0,
        }))
      );
      if (lineItems.length) await sbSaveEstimateLineItems(job.id, estRow?.id || null, lineItems);

      setEstimateSaved(true);
      setTab?.('estimate');
    } catch (e) {
      setErr(`Save failed: ${e.message}`);
    } finally {
      setSavingEstimate(false);
    }
  };

  // ─── Render Helpers ───────────────────────────────────────────────────────

  const completedTrades = measurements.filter((m) => m.completed).map((m) => m.trade);

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
    </div>
  );

  // ─── Ambient Phase ─────────────────────────────────────────────────────────

  const renderAmbient = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, gap: 12 }}>
        {isRecording && <PulseRecording />}
        <span style={{ fontFamily: 'DM Serif Display, serif', fontSize: 20, color: NAV }}>
          {isRecording ? 'Ambient Recording Active' : 'Session Paused'}
        </span>
        <button
          className="btn btn-ghost"
          style={{ marginLeft: 'auto', fontSize: 13 }}
          onClick={isRecording ? stopMic : startMic}
        >
          {isRecording ? 'Pause Mic' : 'Resume Mic'}
        </button>
      </div>

      {/* Live transcript */}
      <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, fontWeight: 700 }}>
          Live Transcript
        </div>
        <div
          style={{
            fontFamily: 'DM Sans, sans-serif',
            fontSize: 13,
            color: '#374151',
            lineHeight: 1.6,
            minHeight: 64,
            maxHeight: 140,
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
          }}
        >
          {transcript
            ? transcript.slice(-500)
            : <span style={{ color: '#D1D5DB', fontStyle: 'italic' }}>Listening for conversation…</span>}
        </div>
      </div>

      {/* Extraction insights */}
      {extraction && (
        <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, fontWeight: 700 }}>
            AI Insights Extracted
          </div>
          <ExtractionPills ext={extraction} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: mob ? 'column' : 'row', gap: 10 }}>
        <button className="btn btn-navy" style={{ flex: 1 }} onClick={startMeasuring}>
          Start Measuring
        </button>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={endSessionFromAmbient}>
          End Session
        </button>
      </div>
    </div>
  );

  // ─── Measure Phase ─────────────────────────────────────────────────────────

  const renderMeasure = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Trade progress */}
      {completedTrades.length > 0 && (
        <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, fontWeight: 700 }}>
            Trades Progress
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {completedTrades.map((t) => (
              <span key={t} style={{ padding: '3px 12px', background: '#D1FAE5', color: '#065F46', borderRadius: 20, fontSize: 13, fontWeight: 600 }}>
                ✓ {t}
              </span>
            ))}
            {currentTrade && !completedTrades.includes(currentTrade) && (
              <span style={{ padding: '3px 12px', background: '#DBEAFE', color: '#1E40AF', borderRadius: 20, fontSize: 13, fontWeight: 600, border: `1px solid #93C5FD` }}>
                → {currentTrade}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Chat thread */}
      <div
        style={{
          background: '#fff',
          border: `1px solid ${BORDER}`,
          borderRadius: 10,
          padding: mob ? 10 : 16,
          minHeight: mob ? 160 : 280,
          maxHeight: mob ? 220 : 360,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {tradeMessages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'rep' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                maxWidth: '78%',
                padding: '10px 14px',
                borderRadius: msg.role === 'rep' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                background: msg.role === 'rep' ? NAV : CREAM,
                color: msg.role === 'rep' ? '#fff' : NAV,
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 14,
                lineHeight: 1.5,
                boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
              }}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {sendingMsg && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '10px 14px', borderRadius: '18px 18px 18px 4px', background: CREAM, color: '#9CA3AF', fontSize: 14 }}>
              Thinking…
            </div>
          </div>
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="finp"
          style={{ flex: 1 }}
          placeholder={measureListening ? 'Listening…' : 'Type or tap mic to answer…'}
          value={repInput}
          onChange={(e) => setRepInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMeasureMessage();
            }
          }}
          disabled={sendingMsg}
        />
        <button
          onClick={measureListening ? stopMeasureMic : startMeasureMic}
          disabled={sendingMsg}
          style={{
            width: 40, height: 40, flexShrink: 0, border: `1px solid ${measureListening ? '#EF4444' : BORDER}`,
            background: measureListening ? '#FEE2E2' : '#fff', color: measureListening ? '#EF4444' : '#6B7280',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 6, fontSize: 18,
          }}
          title={measureListening ? 'Stop recording' : 'Speak your answer'}
        >
          🎙
        </button>
        <button
          className="btn btn-navy"
          onClick={sendMeasureMessage}
          disabled={sendingMsg || !repInput.trim()}
          style={{ minWidth: 72 }}
        >
          Send
        </button>
      </div>

      <button className="btn btn-gold" style={{ width: '100%' }} onClick={doneMeasuring}>
        Done Measuring — Generate Estimate
      </button>
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
              setTradeMessages([]);
              setEstimateSaved(false);
              setGapAnalysis(null);
              setShowGapModal(false);
              setGapResolutions({});
              setGapNotes({});
              setGapNotesOpen({});
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
        @keyframes pulse-rec {
          0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.7); }
          70% { box-shadow: 0 0 0 10px rgba(239,68,68,0); }
          100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
        }
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
        {phase === 'ambient' && renderAmbient()}
        {phase === 'measure' && renderMeasure()}
        {phase === 'complete' && renderComplete()}
      </div>

      {/* Gap Resolution Modal */}
      {showGapModal && gapAnalysis?.gaps?.length > 0 && (() => {
        const gaps = gapAnalysis.gaps;
        const SEV_COLORS = {
          blocker:      { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5', label: 'BLOCKER' },
          strong:       { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D', label: 'STRONG' },
          nice_to_have: { bg: '#F3F4F6', text: '#374151', border: '#D1D5DB', label: 'NICE TO HAVE' },
        };
        const hasBlockerPending = gaps.some(
          (g, i) => g.severity === 'blocker' && !gapResolutions[i]
        );
        const handleGenerate = () => {
          const unresolved = gaps.filter((_, i) => !['resolved', 'skip'].includes(gapResolutions[i]));
          generateEstimate(unresolved);
        };
        return (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(10,31,68,0.65)', zIndex: 2000,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}>
            <div style={{
              background: '#fff', borderRadius: '16px 16px 0 0',
              width: '100%', maxWidth: 680,
              maxHeight: '92vh', display: 'flex', flexDirection: 'column',
              boxShadow: '0 -8px 40px rgba(10,31,68,0.25)',
            }}>
              {/* Header */}
              <div style={{ padding: mob ? '16px 16px 12px' : '20px 24px 14px', borderBottom: `1px solid ${BORDER}` }}>
                <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: mob ? 18 : 20, color: NAV }}>
                  Review Consultation Gaps
                </div>
                <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
                  {gaps.length} item{gaps.length !== 1 ? 's' : ''} flagged — resolve blockers before generating the estimate.
                </div>
              </div>

              {/* Gap list */}
              <div style={{ flex: 1, overflowY: 'auto', padding: mob ? '12px 16px' : '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {gaps.map((g, i) => {
                  const sev = SEV_COLORS[g.severity] || SEV_COLORS.nice_to_have;
                  const res = gapResolutions[i];
                  const noteOpen = gapNotesOpen[i];
                  return (
                    <div key={i} style={{
                      border: `1px solid ${res ? '#D1FAE5' : BORDER}`,
                      borderRadius: 10,
                      padding: mob ? '12px 14px' : '14px 18px',
                      background: res === 'resolved' ? '#F0FDF4' : res === 'skip' ? '#F9FAFB' : '#fff',
                      opacity: res === 'skip' ? 0.7 : 1,
                      transition: 'all 0.15s',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                          letterSpacing: 0.5, whiteSpace: 'nowrap', flexShrink: 0,
                          background: sev.bg, color: sev.text, border: `1px solid ${sev.border}`,
                        }}>
                          {sev.label}
                        </span>
                        <span style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, color: NAV, fontSize: 14, lineHeight: 1.3 }}>
                          {g.title}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: '#4B5563', lineHeight: 1.5, marginBottom: 6 }}>
                        {g.description}
                      </div>
                      {g.suggested_action && (
                        <div style={{ fontSize: 12, color: '#6B7280', fontStyle: 'italic', marginBottom: 10 }}>
                          <span style={{ fontWeight: 600, fontStyle: 'normal', color: NAV }}>Ask: </span>
                          {g.suggested_action}
                        </div>
                      )}

                      {/* Note textarea */}
                      {noteOpen && (
                        <textarea
                          placeholder="Add a note…"
                          value={gapNotes[i] || ''}
                          onChange={e => setGapNotes(prev => ({ ...prev, [i]: e.target.value }))}
                          rows={2}
                          className="finp"
                          style={{ width: '100%', marginBottom: 8, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
                        />
                      )}

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          onClick={() => setGapResolutions(prev => ({ ...prev, [i]: 'resolved' }))}
                          style={{
                            padding: '4px 12px', borderRadius: 6, border: `1px solid ${res === 'resolved' ? '#22c55e' : BORDER}`,
                            background: res === 'resolved' ? '#D1FAE5' : '#fff',
                            color: res === 'resolved' ? '#065F46' : '#374151',
                            fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          {res === 'resolved' ? '✓ Resolved' : 'Resolved'}
                        </button>
                        <button
                          onClick={() => setGapResolutions(prev => ({ ...prev, [i]: 'skip' }))}
                          style={{
                            padding: '4px 12px', borderRadius: 6, border: `1px solid ${res === 'skip' ? '#9CA3AF' : BORDER}`,
                            background: res === 'skip' ? '#F3F4F6' : '#fff',
                            color: '#6B7280', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          Skip
                        </button>
                        <button
                          onClick={() => {
                            setGapNotesOpen(prev => ({ ...prev, [i]: !noteOpen }));
                            if (!noteOpen) setGapResolutions(prev => ({ ...prev, [i]: 'noted' }));
                          }}
                          style={{
                            padding: '4px 12px', borderRadius: 6, border: `1px solid ${res === 'noted' ? GOLD : BORDER}`,
                            background: res === 'noted' ? '#FFFBEB' : '#fff',
                            color: res === 'noted' ? '#92400E' : '#6B7280',
                            fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          Add note
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div style={{ padding: mob ? '12px 16px' : '14px 24px', borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 10, flexDirection: mob ? 'column' : 'row' }}>
                {hasBlockerPending && (
                  <div style={{ fontSize: 12, color: '#991B1B', alignSelf: 'center', flex: 1 }}>
                    Resolve all blockers before generating.
                  </div>
                )}
                <button
                  className="btn btn-ghost"
                  style={{ flex: mob ? 1 : 'none' }}
                  onClick={() => { setShowGapModal(false); generateEstimate([]); }}
                >
                  Skip all & generate
                </button>
                <button
                  className="btn btn-gold"
                  style={{ flex: mob ? 1 : 'none', minWidth: 160 }}
                  disabled={hasBlockerPending}
                  onClick={handleGenerate}
                >
                  Generate estimate
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
