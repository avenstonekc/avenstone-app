import { useState, useEffect, useRef } from 'react';
import { AV_USER_ID, sbLoadDailyLogs, sbSubmitDailyLog, sbGenerateDailyLogDraft, sbSaveDailyLogClientMessage, sbPhoto, sbNotify } from '../../../lib/supabase';
import { Ic, fD } from '../../../lib/utils';

export default function LogsTab({ job }) {
  const [logs, setLogs] = useState([]);
  const [logsLoaded, setLogsLoaded] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);
  const [captureNote, setCaptureNote] = useState('');
  const [capturePhotos, setCapturePhotos] = useState([]);
  const [logSaving, setLogSaving] = useState(false);
  const [logErr, setLogErr] = useState('');
  const photoRef = useRef();

  useEffect(() => {
    if (logsLoaded) return;
    sbLoadDailyLogs(job.id).then(d => { setLogs(d); setLogsLoaded(true); });
  }, [logsLoaded]);

  const resetForm = () => { setShowLogForm(false); setCaptureNote(''); setCapturePhotos([]); setLogErr(''); };

  const submitLog = async () => {
    if (!captureNote.trim()) return;
    setLogSaving(true); setLogErr('');

    // 1. Create draft log — work_completed holds the raw capture note
    const d = await sbSubmitDailyLog({ job_id: job.id, work_completed: captureNote.trim() });
    if (!d.ok) { setLogErr(d.error || 'Save failed'); setLogSaving(false); return; }
    const logId = d.data.id;

    // 2. Attach staged photos to the log
    const attachedPhotos = [];
    for (const file of capturePhotos) {
      const p = await sbPhoto(job.id, file, 'daily_log', logId);
      if (p.ok) attachedPhotos.push(p.data);
    }

    // 3. Generate client message — soft failure; log is valid without it
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 }}>Daily Field Logs</div>
        <button className="btn btn-navy" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowLogForm(true)}><span style={{ width: 14, height: 14 }}>{Ic.plus}</span>New Log</button>
      </div>
      {!logsLoaded && <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF', fontSize: 13 }}>Loading...</div>}
      {logsLoaded && !logs.length && <div className="empty">{Ic.clip}<div className="empty-t">No logs yet</div><div>Submit the first daily log above</div></div>}
      {logs.map(l => (
        <div key={l.id} style={{ background: '#fff', border: '1px solid #E8E4DC', padding: 16, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0A1F44' }}>{fD(l.log_date)}</div>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{l.author?.full_name || 'Unknown'}</div>
            </div>
            <div style={{ fontSize: 11, color: l.status === 'approved' ? '#22c55e' : '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{l.status === 'approved' ? 'Sent' : 'Draft'}</div>
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
    </div>
  );
}
