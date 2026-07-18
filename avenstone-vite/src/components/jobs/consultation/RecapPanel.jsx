import { useState, useEffect } from 'react';
import {
  sbComposeRecap, sbUpdateRecap, sbConfirmMeasurement, sbUpdatePhotoCaption,
  sbSendRecap, sbLoadConsultationPhotos, sbAttachRecapToBid,
  sbLoadRecap, sbLoadConsultationMeasurements, sbUpd,
} from '../../../lib/supabase';
import { buildRecapPDF } from '../../../lib/recapPdf';
import { isMob } from '../../../lib/utils';
import { Capacitor } from '@capacitor/core';

const NAV = 'var(--navy-900)';
const BORDER = 'var(--border)';

// CONSULTATION_MODE Slice 3 — rep reviews + edits the scope-only recap, confirms
// measurements, tweaks captions, then generates the branded PDF and emails it.
// WALKTHROUGH_TYPES — sessionType forks the tone, labels, and recipient (client vs sub).
export default function RecapPanel({ job, sessionId, unresolvedGaps = [], onComposed, sessionType = 'client_walk', tradeScope = [] }) {
  const mob = isMob();
  const isSub = sessionType === 'sub_walk';
  const trades = (Array.isArray(tradeScope) ? tradeScope : []).filter(Boolean).join(', ');
  const [busy, setBusy] = useState(false);
  const [composed, setComposed] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  const [recipient, setRecipient] = useState(null);
  const [attaching, setAttaching] = useState(false);
  const [attachMsg, setAttachMsg] = useState('');

  const [recap, setRecap] = useState(null);
  const [summary, setSummary] = useState('');
  const [discussed, setDiscussed] = useState('');
  const [basis, setBasis] = useState('');
  const [open, setOpen] = useState('');
  const [needsConfirm, setNeedsConfirm] = useState(''); // Item 3 — uncertain scope items to resolve before send
  const [measurements, setMeasurements] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [prevSentAt, setPrevSentAt] = useState(null);
  // FIX 2 — inline client-email capture at send when the job has none (never a dead stop).
  const [emailPrompt, setEmailPrompt] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [localClientEmail, setLocalClientEmail] = useState(null);

  const linesToArr = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
  const arrToLines = (a) => (a || []).join('\n');

  // CONSULTATION_FIELD_FIXES FIX 1 — reopening a completed session must land on its EXISTING recap,
  // not a blank compose. On mount, load any saved recap for this session and prefill the editor
  // (measurements + photos too). If none exists (session never composed), fall through to the compose
  // button. Idempotent for the live flow: a fresh session has no recap yet, so compose still shows.
  useEffect(() => {
    let alive = true;
    (async () => {
      const existing = await sbLoadRecap(sessionId);
      if (!alive || !existing) return;
      setRecap(existing);
      setSummary(existing.summary || '');
      setDiscussed(arrToLines(existing.discussed_items));
      setBasis(arrToLines(existing.scope_basis));
      setOpen(arrToLines(existing.open_items));
      setNeedsConfirm(arrToLines(existing.needs_confirm));
      setPrevSentAt(existing.status === 'sent' ? (existing.sent_at || true) : null);
      const [ms, ph] = await Promise.all([
        sbLoadConsultationMeasurements(sessionId),
        sbLoadConsultationPhotos(sessionId),
      ]);
      if (!alive) return;
      setMeasurements(ms);
      setPhotos(ph);
      setComposed(true); // show the review/send UI directly — resend allowed (sent starts false)
    })();
    return () => { alive = false; };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const compose = async () => {
    setBusy(true); setErr('');
    const res = await sbComposeRecap(sessionId, job.id, unresolvedGaps);
    if (res.error) { setErr(`Compose failed: ${res.error}`); setBusy(false); return; }
    onComposed?.(res.oh_shit_moments || []);
    if (res.recipient) setRecipient(res.recipient);
    const r = res.recap || {};
    setRecap(r);
    setSummary(r.summary || '');
    setDiscussed(arrToLines(r.discussed_items));
    setBasis(arrToLines(r.scope_basis));
    setOpen(arrToLines(r.open_items));
    setNeedsConfirm(arrToLines(r.needs_confirm));
    setMeasurements(res.measurements || []);
    // Sign photo URLs for preview + PDF (compose returns rows without signed URLs).
    setPhotos(await sbLoadConsultationPhotos(sessionId));
    setComposed(true);
    setBusy(false);
  };

  const persistEdits = async () => {
    if (!recap?.id) return;
    await sbUpdateRecap(recap.id, {
      summary,
      discussed_items: linesToArr(discussed),
      scope_basis: linesToArr(basis),
      open_items: linesToArr(open),
      needs_confirm: linesToArr(needsConfirm),
    });
  };

  const toggleConfirm = async (m) => {
    const next = !m.confirmed_by_rep;
    setMeasurements((prev) => prev.map((x) => (x.id === m.id ? { ...x, confirmed_by_rep: next } : x)));
    await sbConfirmMeasurement(m.id, next);
  };

  const editCaption = async (p, caption) => {
    setPhotos((prev) => prev.map((x) => (x.id === p.id ? { ...x, caption, caption_source: 'manual' } : x)));
    await sbUpdatePhotoCaption(p.id, caption);
  };

  const buildDoc = async () => {
    await persistEdits();
    return buildRecapPDF({
      job,
      recap: { summary, discussed_items: linesToArr(discussed), scope_basis: linesToArr(basis), open_items: linesToArr(open) },
      measurements,
      photos,
      sessionType,
      tradeScope,
      recipientName: recipient?.name || null,
    });
  };

  const downloadPdf = async () => {
    setBusy(true); setErr('');
    try {
      const doc = await buildDoc();
      const base = isSub ? `Sub Walkthrough${trades ? ' — ' + trades : ''}` : 'Consultation Recap';
      const filename = `${base} — ${job.address || 'Project'}.pdf`;
      if (Capacitor.isNativePlatform()) {
        // FIX 3 — iOS WKWebView can't do a blob download (doc.save silently no-ops). Write the PDF to
        // the cache dir and hand it to the native share sheet (Save to Files, Mail, AirDrop…). Needs
        // @capacitor/share + @capacitor/filesystem and a native rebuild (cap sync + Codemagic) to work
        // on device; the isNativePlatform() guard leaves desktop/web on the unchanged doc.save path.
        const b64 = doc.output('datauristring').split(',')[1];
        const safeName = filename.replace(/[/\\:*?"<>|]/g, '-'); // filesystem-safe (trades can contain '/')
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const { Share } = await import('@capacitor/share');
        const w = await Filesystem.writeFile({ path: safeName, data: b64, directory: Directory.Cache });
        await Share.share({ title: filename, url: w.uri });
      } else {
        doc.save(filename); // desktop browser — unchanged
      }
    } catch (e) { setErr(`PDF failed: ${e.message}`); }
    setBusy(false);
  };

  const doSend = async (toEmail) => {
    setBusy(true); setErr('');
    try {
      const doc = await buildDoc();
      const b64 = doc.output('datauristring').split(',')[1];
      // Override client_email so the send uses the just-entered address even before the job prop refreshes.
      const res = await sbSendRecap({ recap, job: { ...job, client_email: toEmail }, measurements, photos, pdfBase64: b64, sessionId, sessionType, tradeScope, recipient });
      if (res.error) { setErr(`Send failed: ${res.error}`); }
      else setSent(true);
    } catch (e) { setErr(`Send failed: ${e.message}`); }
    setBusy(false);
  };

  const sendRecap = async () => {
    if (isSub) {
      if (!recipient?.email) {
        setErr('No email for the selected sub — pick the sub on the session, or use Download / attach to a bid.');
        return;
      }
      return doSend(recipient.email);
    }
    // FIX 2 — client walk with no email: prompt inline instead of a dead stop.
    const toEmail = localClientEmail || job.client_email;
    if (!toEmail) { setEmailInput(''); setEmailPrompt(true); setErr(''); return; }
    return doSend(toEmail);
  };

  // FIX 2 — save the entered email onto the job (so it's entered once), then send.
  const saveEmailAndSend = async () => {
    const em = emailInput.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { setErr('Enter a valid email address.'); return; }
    setErr('');
    try { await sbUpd(job.id, { client_email: em }); } catch { /* non-fatal — still send */ }
    setLocalClientEmail(em);
    setEmailPrompt(false);
    await doSend(em);
  };

  // WALKTHROUGH_TYPES — one action: build the same PDF and attach it to the sub's bid (engagement),
  // creating the bid request if none exists. The sub then bids from the walkthrough in SubPortal.
  const attachToBid = async () => {
    if (!recipient?.id) { setErr('Pick the sub on the session to attach this to a bid.'); return; }
    setAttaching(true); setErr(''); setAttachMsg('');
    try {
      const doc = await buildDoc();
      const b64 = doc.output('datauristring').split(',')[1];
      const res = await sbAttachRecapToBid({ job, tradeScope, subId: recipient.id, pdfBase64: b64 });
      if (res.error) { setErr(`Attach failed: ${res.error}`); }
      else setAttachMsg(res.created
        ? '✓ Bid request created and walkthrough attached — the sub can bid from it in their portal.'
        : '✓ Walkthrough attached to the sub’s bid — visible in their portal.');
    } catch (e) { setErr(`Attach failed: ${e.message}`); }
    setAttaching(false);
  };

  const box = { background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, padding: mob ? '14px 16px' : '18px 22px' };
  const label = { fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700, marginBottom: 6 };
  const ta = { width: '100%', minHeight: 64, fontSize: 16, padding: 10, border: `1px solid ${BORDER}`, borderRadius: 8, fontFamily: 'DM Sans, sans-serif', lineHeight: 1.5, resize: 'vertical' };

  if (!composed) {
    return (
      <div style={box}>
        <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 18, color: NAV, marginBottom: 6 }}>
          {isSub ? `Sub walkthrough recap${trades ? ` — ${trades}` : ''}` : 'Client recap'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 14 }}>
          {isSub
            ? `Compose the work-order scope for ${trades || 'this trade'} — scope of work, photos with captions, measurements, and site conditions. You review and edit before it emails to the sub. No prices (the sub's number comes from them).`
            : 'Compose a scope-only recap of this visit — discussed items, photos with captions, measurements, and what the bid is based on. You review and edit before it emails to the client. No prices.'}
        </div>
        {err && <div style={{ color: '#EF4444', fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <button className="btn btn-gold" style={{ minHeight: 48, fontSize: 15 }} disabled={busy} onClick={compose}>
          {busy ? 'Composing…' : 'Compose Recap'}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Item 3 — uncertain scope items the composer wouldn't state confidently (direction/detail
          the evidence didn't resolve). Highlighted so the rep resolves them before send — an
          uncertain flag beats a confident error on a client doc. Not on the PDF. */}
      {needsConfirm.trim() && (
        <div style={{ background: '#FFFBEB', border: '1px solid #F59E0B', borderRadius: 12, padding: mob ? '14px 16px' : '16px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E', marginBottom: 6 }}>
            ⚠ Confirm before sending
          </div>
          <div style={{ fontSize: 12, color: '#92400E', marginBottom: 8, lineHeight: 1.5 }}>
            The recap couldn’t resolve the direction or a detail on these from what was said. Fix the scope above, then clear each line here.
          </div>
          <textarea style={{ ...ta, background: '#fff', borderColor: '#F59E0B' }} value={needsConfirm} onChange={(e) => setNeedsConfirm(e.target.value)} />
        </div>
      )}
      <div style={box}>
        <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 18, color: NAV, marginBottom: 12 }}>
          Review recap <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>— edit anything, then send</span>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={label}>Summary</div>
          <textarea style={ta} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={label}>{isSub ? 'Scope of work (one per line)' : 'What we discussed (one per line)'}</div>
          <textarea style={ta} value={discussed} onChange={(e) => setDiscussed(e.target.value)} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={label}>{isSub ? 'Site conditions & access (one per line)' : 'What the bid is based on (one per line)'}</div>
          <textarea style={ta} value={basis} onChange={(e) => setBasis(e.target.value)} />
        </div>
        <div>
          <div style={label}>{isSub ? 'Open questions (one per line)' : 'Still to confirm (one per line)'}</div>
          <textarea style={ta} value={open} onChange={(e) => setOpen(e.target.value)} />
        </div>
      </div>

      {measurements.length > 0 && (
        <div style={box}>
          <div style={{ ...label, marginBottom: 10 }}>Measurements — confirm each</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {measurements.map((m) => (
              <label key={m.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!m.confirmed_by_rep} onChange={() => toggleConfirm(m)} style={{ width: 18, height: 18, marginTop: 2, accentColor: '#C9A84C', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: NAV }}>
                    {m.trade} {m.source === 'inline' && <span style={{ fontSize: 10, color: '#92400E', background: '#FEF3C7', borderRadius: 5, padding: '1px 6px', marginLeft: 6 }}>SPOKEN</span>}
                  </div>
                  <div style={{ fontSize: 13, color: '#4B5563' }}>
                    {Object.entries(m.fields || {}).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join('  ·  ')}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {photos.length > 0 && (
        <div style={box}>
          <div style={{ ...label, marginBottom: 10 }}>Photos — captions from what you said</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {photos.map((p) => {
              // Item 1 — provenance: spoken = verbatim "caption …" command, speech = AI from shutter
              // audio, manual = rep edit. A badge so the rep trusts (or fixes) each one.
              const src = { spoken: { t: 'SPOKEN', bg: '#DBEAFE', c: '#1E40AF' }, speech: { t: 'AUTO', bg: '#F3F4F6', c: '#6B7280' }, manual: { t: 'EDITED', bg: '#D1FAE5', c: '#065F46' } }[p.caption_source] || null;
              return (
                <div key={p.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  {p.url && <img src={p.url} alt="" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8, flexShrink: 0, border: `1px solid ${BORDER}` }} />}
                  <div style={{ flex: 1 }}>
                    {src && <div style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, padding: '2px 7px', borderRadius: 5, background: src.bg, color: src.c, marginBottom: 5 }}>{src.t}</div>}
                    <input
                      className="finp"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      placeholder="Caption…"
                      defaultValue={p.caption || ''}
                      onBlur={(e) => editCaption(p, e.target.value)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {err && <div style={{ color: '#EF4444', fontSize: 13 }}>{err}</div>}
      {prevSentAt && !sent && (
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Previously sent{typeof prevSentAt === 'string' ? ` ${new Date(prevSentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''} — edit and resend, or download, anytime.
        </div>
      )}
      {sent && <div style={{ color: '#15803d', fontSize: 14, fontWeight: 600 }}>✓ Recap emailed to {isSub ? (recipient?.email || 'the sub') : (localClientEmail || job.client_email)}</div>}

      {emailPrompt && !isSub && (
        <div style={box}>
          <div style={{ ...label, marginBottom: 6 }}>No client email on this job — add one to send</div>
          <div style={{ display: 'flex', gap: 8, flexDirection: mob ? 'column' : 'row' }}>
            <input
              className="finp" type="email" inputMode="email" autoFocus
              style={{ flex: 1, fontSize: 16 }} placeholder="client@email.com"
              value={emailInput} onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveEmailAndSend(); }}
            />
            <button className="btn btn-gold" style={{ minHeight: 44 }} disabled={busy} onClick={saveEmailAndSend}>
              {busy ? 'Saving…' : 'Save & Send'}
            </button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>Saved to the job — you only enter it once.</div>
        </div>
      )}
      {attachMsg && <div style={{ color: '#15803d', fontSize: 14, fontWeight: 600 }}>{attachMsg}</div>}

      <div style={{ display: 'flex', flexDirection: mob ? 'column' : 'row', gap: 10 }}>
        <button className="btn btn-gold" style={{ flex: 1, minHeight: 48, fontSize: 15 }} disabled={busy || sent} onClick={sendRecap}>
          {sent ? '✓ Sent' : busy ? 'Working…' : `Generate PDF & Email to ${isSub ? 'Sub' : 'Client'} →`}
        </button>
        {isSub && (
          <button className="btn btn-navy" style={{ flex: 1, minHeight: 48, fontSize: 15 }} disabled={busy || attaching} onClick={attachToBid}>
            {attaching ? 'Attaching…' : 'Attach to Sub’s Bid →'}
          </button>
        )}
        <button className="btn btn-ghost" style={{ minWidth: mob ? 'auto' : 140, minHeight: 48 }} disabled={busy} onClick={downloadPdf}>
          Download PDF
        </button>
      </div>
    </div>
  );
}
