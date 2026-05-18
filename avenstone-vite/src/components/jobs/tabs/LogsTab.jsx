import { useState, useEffect, useRef } from 'react';
import { AV_USER_ID, sbLoadDailyLogs, sbSubmitDailyLog, sbGenerateDailyLogDraft, sbSaveDailyLogClientMessage, sbSendDailyLog, sbPhoto, sbNotify, sbSetPhotoClientVisible, sbLoadPhotosForEntity } from '../../../lib/supabase';
import { Ic, fD } from '../../../lib/utils';

export default function LogsTab({ job }) {
  const [logs, setLogs] = useState([]);
  const [logsLoaded, setLogsLoaded] = useState(false);

  // capture form
  const [showLogForm, setShowLogForm] = useState(false);
  const [captureNote, setCaptureNote] = useState('');
  const [capturePhotos, setCapturePhotos] = useState([]);
  const [logSaving, setLogSaving] = useState(false);
  const [logErr, setLogErr] = useState('');
  const photoRef = useRef();

  // review / send
  const [reviewLog, setReviewLog] = useState(null);
  const [reviewMsg, setReviewMsg] = useState('');
  const [reviewPhotos, setReviewPhotos] = useState([]);
  const [reviewPhotosLoading, setReviewPhotosLoading] = useState(false);
  const [reviewSending, setReviewSending] = useState(false);
  const [reviewGenerating, setReviewGenerating] = useState(false);
  const [reviewErr, setReviewErr] = useState('');

  useEffect(() => {
    if (logsLoaded) return;
    sbLoadDailyLogs(job.id).then(d => { setLogs(d); setLogsLoaded(true); });
  }, [logsLoaded]);

  // ── capture ──────────────────────────────────────────────────────────────────

  const resetForm = () => { setShowLogForm(false); setCaptureNote(''); setCapturePhotos([]); setLogErr(''); };

  const submitLog = async () => {
    if (!captureNote.trim()) return;
    setLogSaving(true); setLogErr('');
    const d = await sbSubmitDailyLog({ job_id: job.id, work_completed: captureNote.trim() });
    if (!d.ok) { setLogErr(d.error || 'Save failed'); setLogSaving(false); return; }
    const logId = d.data.id;
    for (const file of capturePhotos) await sbPhoto(job.id, file, 'daily_log', logId);
    let patchedData = d.data;
    const aiRes = await sbGenerateDailyLogDraft(job.id, captureNote.trim());
    if (aiRes.ok && aiRes.data.client_message) {
      await sbSaveDailyLogClientMessage(logId, aiRes.data.client_message);
      patchedData = { ...d.data, client_message: aiRes.data.client_message };
    }
    setLogs(p => [patchedData, ...p]);
    sbNotify('daily_log_submitted', `Daily log — ${job.address}`, captureNote.trim().slice(0, 80), job.id, AV_USER_ID);
    resetForm();
    setLogSaving(false);
  };

  // ── review / send ─────────────────────────────────────────────────────────────

  const openReview = async (log) => {
    setReviewLog(log);
    setReviewMsg(log.client_message || '');
    setReviewErr('');
    setReviewPhotosLoading(true);
    const photos = await sbLoadPhotosForEntity('daily_log', log.id);
    setReviewPhotos(photos);
    setReviewPhotosLoading(false);
  };

  const closeReview = () => { setReviewLog(null); setReviewMsg(''); setReviewPhotos([]); setReviewErr(''); };

  const regenerateMsg = async () => {
    setReviewGenerating(true); setReviewErr('');
    const aiRes = await sbGenerateDailyLogDraft(job.id, reviewLog.work_completed || '');
    if (aiRes.ok && aiRes.data.client_message) {
      await sbSaveDailyLogClientMessage(reviewLog.id, aiRes.data.client_message);
      setReviewMsg(aiRes.data.client_message);
    } else {
      setReviewErr(aiRes.error || 'Generation failed — edit manually.');
    }
    setReviewGenerating(false);
  };

  const togglePhotoVisible = async (photoId, currentVisible) => {
    setReviewPhotos(p => p.map(ph => ph.id === photoId ? { ...ph, client_visible: !currentVisible } : ph));
    await sbSetPhotoClientVisible(photoId, !currentVisible);
  };

  const sendLog = async () => {
    if (!reviewMsg.trim() || !reviewLog) return;
    setReviewSending(true); setReviewErr('');
    const res = await sbSendDailyLog(reviewLog.id, reviewMsg.trim(), job);
    if (!res.ok) { setReviewErr(res.error || 'Send failed'); setReviewSending(false); return; }
    setLogs(p => p.map(l => l.id === reviewLog.id ? { ...l, status: 'approved', client_message: reviewMsg.trim() } : l));
    closeReview();
    setReviewSending(false);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 }}>Daily Field Logs</div>
        <button className="btn btn-navy" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowLogForm(true)}><span style={{ width: 14, height: 14 }}>{Ic.plus}</span>New Log</button>
      </div>

      {/* Log list */}
      {!logsLoaded && <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF', fontSize: 13 }}>Loading...</div>}
      {logsLoaded && !logs.length && <div className="empty">{Ic.clip}<div className="empty-t">No logs yet</div><div>Submit the first daily log above</div></div>}
      {logs.map(l => (
        <div key={l.id} style={{ background: '#fff', border: `1px solid ${l.status !== 'approved' ? '#FDE68A' : '#E8E4DC'}`, padding: 16, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0A1F44' }}>{fD(l.log_date)}</div>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{l.author?.full_name || 'Unknown'}</div>
            </div>
            {l.status !== 'approved'
              ? <button className="btn btn-gold" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => openReview(l)}>Review & Send</button>
              : <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Sent</div>
            }
          </div>
          {l.work_completed && <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.65, marginBottom: l.client_message ? 10 : 0 }}>{l.work_completed}</div>}
          {l.client_message && (
            <div style={{ background: '#F7F5F0', border: '1px solid #E8E4DC', borderRadius: 6, padding: '8px 12px' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Client Update</div>
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.65 }}>{l.client_message}</div>
            </div>
          )}
        </div>
      ))}

      {/* Capture modal */}
      {showLogForm && <div className="overlay" onClick={resetForm}><div className="modal" style={{ maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">Daily Field Log</div>
        <div className="fg">
          <label className="flbl">What happened today</label>
          <textarea className="finp fta" rows={5} value={captureNote} onChange={e => setCaptureNote(e.target.value)} placeholder="Describe what was accomplished on site today..." />
        </div>
        <input ref={photoRef} type="file" accept="image/*,video/*" multiple onChange={e => { const files = Array.from(e.target.files); if (files.length) setCapturePhotos(p => [...p, ...files]); e.target.value = ''; }} style={{ display: 'none' }} />
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Photos</div>
          {capturePhotos.length > 0 && (
            <div className="pgrid" style={{ marginBottom: 10 }}>
              {capturePhotos.map((f, i) => (
                <div key={i} className="pcell">
                  <div style={{ position: 'absolute', inset: 0 }}>
                    {f.type.startsWith('video') ? <video src={URL.createObjectURL(f)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={URL.createObjectURL(f)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                  <button className="pdel" onClick={() => setCapturePhotos(p => p.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
            </div>
          )}
          <button className="btn btn-ghost" style={{ width: '100%', fontSize: 13 }} onClick={() => photoRef.current.click()}>+ Add Photos</button>
        </div>
        {logErr && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', padding: '8px 12px', fontSize: 12, marginBottom: 8 }}>{logErr}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={resetForm}>Cancel</button>
          <button className="btn btn-navy" style={{ flex: 1 }} onClick={submitLog} disabled={logSaving || !captureNote.trim()}>{logSaving ? 'Submitting...' : 'Submit'}</button>
        </div>
      </div></div>}

      {/* Review + Send modal */}
      {reviewLog && <div className="overlay" onClick={closeReview}><div className="modal" style={{ maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">Review & Send to Client</div>

        {/* Field note — read-only */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Field Note</div>
          <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.65, background: '#F7F5F0', border: '1px solid #E8E4DC', borderRadius: 6, padding: '10px 12px' }}>
            {reviewLog.work_completed || <span style={{ color: '#9CA3AF' }}>No capture note</span>}
          </div>
        </div>

        {/* Photo curation */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Photos — tap to include / exclude from client view</div>
          {reviewPhotosLoading && <div style={{ fontSize: 13, color: '#9CA3AF', padding: '6px 0' }}>Loading photos...</div>}
          {!reviewPhotosLoading && !reviewPhotos.length && <div style={{ fontSize: 13, color: '#9CA3AF' }}>No photos attached to this log.</div>}
          {reviewPhotos.length > 0 && (
            <div className="pgrid">
              {reviewPhotos.map(ph => {
                const included = ph.client_visible !== false;
                return (
                  <div key={ph.id} className="pcell" style={{ cursor: 'pointer', opacity: included ? 1 : 0.35 }} onClick={() => togglePhotoVisible(ph.id, included)}>
                    <div style={{ position: 'absolute', inset: 0 }}>
                      {ph.type === 'video' ? <video src={ph.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={ph.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                    </div>
                    <div style={{ position: 'absolute', top: 5, right: 5, background: included ? '#22c55e' : 'rgba(0,0,0,0.65)', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', fontWeight: 700 }}>
                      {included ? '✓' : '✕'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Client message — editable */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 }}>Client Message</div>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 10px' }} onClick={regenerateMsg} disabled={reviewGenerating || !reviewLog.work_completed}>
              {reviewGenerating ? 'Generating...' : reviewMsg ? '✦ Regenerate' : '✦ Generate'}
            </button>
          </div>
          <textarea className="finp fta" rows={5} value={reviewMsg} onChange={e => setReviewMsg(e.target.value)} placeholder="Write or generate a client-facing update..." />
        </div>

        {reviewErr && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', padding: '8px 12px', fontSize: 12, marginBottom: 8 }}>{reviewErr}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={closeReview}>Cancel</button>
          <button className="btn btn-navy" style={{ flex: 1 }} onClick={sendLog} disabled={reviewSending || !reviewMsg.trim()}>{reviewSending ? 'Sending...' : 'Send to Client'}</button>
        </div>
      </div></div>}
    </div>
  );
}
