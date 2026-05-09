import { useState, useEffect, useRef } from 'react';
import { sb, sbSave as sbSaveJob, AI_MASTER_URL, ANON_KEY, captureFailedIntent, sbUploadReceipt, sbCreateTransaction, sbCreateUserTodo, AV_TENANT } from '../../lib/supabase';
import { pushBreadcrumb, getSnapshot } from '../../lib/bugContext';
import { Ic } from '../../lib/utils';
import { sbCreatePendingTask, sbUpdatePendingTask, sbCompletePendingTask } from '../../lib/pendingTasks';
import PendingTaskListReal from './PendingTaskList';
import ChipPicker from './ChipPicker';
import JobChipPicker from './JobChipPicker';

// Anthropic vision: jpeg/png/gif/webp only. iOS exports HEIC by default.
const MAX_EDGE = 1024;
const ANTHROPIC_OK = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

async function fileToVisionPayload(file) {
  let working = file;
  let mime = file.type || 'image/jpeg';
  if (/heic|heif/i.test(mime) || /\.heic$|\.heif$/i.test(file.name)) {
    const heic2any = (await import('heic2any')).default;
    const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
    working = blob instanceof Blob ? blob : blob[0];
    mime = 'image/jpeg';
  }
  if (!ANTHROPIC_OK.has(mime)) mime = 'image/jpeg';
  const dataUrl = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(working);
  });
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL('image/jpeg', 0.85);
  return { base64: out.split(',')[1], mime: 'image/jpeg', preview: out };
}

const QUICK_TILES = [
  { verb: 'receipt',      label: 'Add a receipt',       ic: 'note' },
  { verb: 'todo',         label: 'Add to the todo list', ic: 'check' },
  { verb: 'lead',         label: 'Add a new lead',       ic: 'plus' },
  { verb: 'change_order', label: 'Submit a change order',ic: 'warn' },
  { verb: 'bug',          label: 'Submit a bug',         ic: 'info' },
];

// PendingTaskList — delegates to real component (imported above)
function PendingTaskList({ onResume }) { return <PendingTaskListReal onResume={onResume} />; }

// QuickCapture — per-verb quick capture step shown after tile tap
function QuickCapture({ verb, profile, captureContext, setCaptureContext, captureLabel, setCaptureLabel, captureWorking, setCaptureWorking, captureErr, setCaptureErr, onSaveForLater, onContinueNow, onBack }) {
  const [labelInput, setLabelInput] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const fileRef = useRef(null);

  const cardStyle = {
    background: 'rgba(247,245,240,0.08)',
    border: '1px solid rgba(201,168,76,0.3)',
    borderRadius: 10,
    padding: 16,
    fontFamily: 'DM Sans, sans-serif',
    fontSize: 14,
    color: 'rgba(247,245,240,0.9)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  };

  const handleReceiptPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoUploading(true);
    const result = await sbUploadReceipt(file, null);
    setPhotoUploading(false);
    if (result.error) {
      setCaptureErr(result.error);
      return;
    }
    setPhotoPreview(result.signedUrl);
    setCaptureContext(ctx => ({ ...ctx, photo_url: result.signedUrl, photo_path: result.path }));
  };

  const getContextAndLabel = () => {
    if (verb === 'receipt') {
      const ctx = captureContext;
      const label = captureLabel || (ctx.photo_path ? 'Receipt photo' : labelInput.trim());
      return { ctx, label };
    }
    if (verb === 'bug') {
      return { ctx: captureContext, label: 'Bug report' };
    }
    return { ctx: captureContext, label: labelInput.trim() };
  };

  const canProceed = () => {
    if (verb === 'receipt') return !!(captureContext.photo_path || labelInput.trim().length >= 3);
    if (verb === 'bug') return true; // bug context captured at tile-tap
    return labelInput.trim().length >= 3;
  };

  const promptText = {
    receipt: 'Snap a photo of the receipt',
    todo: 'What is this todo?',
    lead: 'What is this lead?',
    change_order: 'What is this change order?',
    bug: null,
  }[verb];

  if (verb === 'bug') {
    return (
      <div style={cardStyle}>
        <div style={{ color: 'rgba(247,245,240,0.6)', fontSize: 13 }}>
          Bug context captured. Click Continue to describe the issue.
        </div>
        {captureErr && <div style={{ color: '#FCA5A5', fontSize: 12 }}>{captureErr}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button disabled={captureWorking} onClick={() => { const { ctx, label } = getContextAndLabel(); onContinueNow(ctx, label); }}
            style={{ flex: 1, padding: '8px 12px', borderRadius: 8, background: '#C9A84C', color: '#0A1F44', border: 'none', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Continue now
          </button>
          <button disabled={captureWorking} onClick={() => { const { ctx, label } = getContextAndLabel(); onSaveForLater(ctx, label); }}
            style={{ flex: 1, padding: '8px 12px', borderRadius: 8, background: 'transparent', color: 'rgba(247,245,240,0.75)', border: '1px solid rgba(247,245,240,0.25)', fontFamily: 'DM Sans, sans-serif', fontSize: 13, cursor: 'pointer' }}>
            Save for later
          </button>
        </div>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'rgba(247,245,240,0.45)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, cursor: 'pointer', padding: 0, textAlign: 'left' }}>← Back</button>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      {promptText && <div style={{ fontWeight: 500 }}>{promptText}</div>}
      {verb === 'receipt' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleReceiptPhoto} style={{ display: 'none' }} />
          {!photoPreview && (
            <button onClick={() => fileRef.current?.click()} disabled={photoUploading}
              style={{ padding: '10px 16px', borderRadius: 8, background: '#0A1F44', color: '#C9A84C', border: '1px solid #C9A84C', fontFamily: 'DM Sans, sans-serif', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
              {photoUploading ? 'Uploading…' : '📷 Take photo'}
            </button>
          )}
          {photoPreview && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <img src={photoPreview} alt="receipt" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid rgba(201,168,76,0.4)' }} />
              <span style={{ fontSize: 12, color: 'rgba(247,245,240,0.6)' }}>Photo attached</span>
            </div>
          )}
          <div style={{ fontSize: 12, color: 'rgba(247,245,240,0.45)' }}>Or type a 1-line label</div>
          <input type="text" value={labelInput} onChange={e => setLabelInput(e.target.value)} placeholder="e.g. Home Depot — lumber"
            style={{ border: '1px solid rgba(201,168,76,0.3)', borderRadius: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.07)', color: '#F7F5F0', fontFamily: 'DM Sans, sans-serif', fontSize: 14, outline: 'none' }} />
        </div>
      )}
      {verb !== 'receipt' && (
        <input type="text" value={labelInput} onChange={e => setLabelInput(e.target.value)} placeholder="Min 3 characters..."
          style={{ border: '1px solid rgba(201,168,76,0.3)', borderRadius: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.07)', color: '#F7F5F0', fontFamily: 'DM Sans, sans-serif', fontSize: 14, outline: 'none' }} />
      )}
      {captureErr && <div style={{ color: '#FCA5A5', fontSize: 12 }}>{captureErr}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button disabled={captureWorking || !canProceed()} onClick={() => { const { ctx, label } = getContextAndLabel(); onContinueNow(ctx, label); }}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, background: canProceed() ? '#C9A84C' : 'rgba(201,168,76,0.3)', color: '#0A1F44', border: 'none', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 700, cursor: canProceed() ? 'pointer' : 'default' }}>
          Continue now
        </button>
        <button disabled={captureWorking || !canProceed()} onClick={() => { const { ctx } = getContextAndLabel(); const label = labelInput.trim() || (captureContext.photo_path ? 'Receipt photo' : ''); onSaveForLater(ctx, label); }}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, background: 'transparent', color: 'rgba(247,245,240,0.75)', border: '1px solid rgba(247,245,240,0.25)', fontFamily: 'DM Sans, sans-serif', fontSize: 13, cursor: canProceed() ? 'pointer' : 'default' }}>
          Save for later
        </button>
      </div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'rgba(247,245,240,0.45)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, cursor: 'pointer', padding: 0, textAlign: 'left' }}>← Back</button>
    </div>
  );
}

// ─── Verb flow components ───────────────────────────────────────────────────

const CATEGORY_MAP = {
  'Materials': 'material_purchase',
  'Subcontractor': 'sub_payout',
  'Permits': 'permit',
  'Tools': 'equipment_rental',
  'Fuel': 'fuel',
  'Office': 'other_expense',
  'Other': 'other_expense',
};

const CATEGORY_CHIPS = [
  { id: 'Materials', label: 'Materials' },
  { id: 'Subcontractor', label: 'Subcontractor' },
  { id: 'Permits', label: 'Permits' },
  { id: 'Tools', label: 'Tools' },
  { id: 'Fuel', label: 'Fuel' },
  { id: 'Office', label: 'Office' },
  { id: 'Other', label: 'Other' },
];

function ReceiptFlow({ profile, initContext, pendingTaskId, onComplete, onBack }) {
  const [step, setStep] = useState('vendor');
  const [vendor, setVendor] = useState('');
  const [vendors, setVendors] = useState([]);
  const [loadingVendors, setLoadingVendors] = useState(true);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [jobId, setJobId] = useState(null);
  const [jobLabel, setJobLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const ago = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await sb
        .from('job_transactions')
        .select('payer_or_payee_name, created_at')
        .not('payer_or_payee_name', 'is', null)
        .gte('created_at', ago)
        .order('created_at', { ascending: false })
        .limit(50);
      if (data) {
        const seen = new Set();
        const unique = [];
        for (const r of data) {
          if (r.payer_or_payee_name && !seen.has(r.payer_or_payee_name)) {
            seen.add(r.payer_or_payee_name);
            unique.push({ id: r.payer_or_payee_name, label: r.payer_or_payee_name });
            if (unique.length >= 8) break;
          }
        }
        setVendors(unique);
      }
      setLoadingVendors(false);
    })();
  }, []);

  const containerStyle = { display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'DM Sans, sans-serif' };
  const labelStyle = { fontSize: 13, fontWeight: 600, color: 'rgba(247,245,240,0.85)', marginBottom: 4 };

  const amtNum = parseFloat(amount.replace(/[^0-9.]/g, ''));

  const handleConfirm = async () => {
    setSaving(true);
    setError('');
    const today = new Date().toISOString().slice(0, 10);
    const result = await sbCreateTransaction({
      job_id: jobId || null,
      direction: 'out',
      type: CATEGORY_MAP[category] || 'other_expense',
      amount: amtNum,
      description: `${category} — ${vendor}`,
      payer_or_payee_name: vendor,
      status: 'paid',
      date_paid: today,
      receipt_url: initContext?.photo_path || null,
    });
    if (!result.ok) { setError(result.error || 'Failed to save'); setSaving(false); return; }
    if (pendingTaskId) await sbCompletePendingTask(pendingTaskId, { resultingEntityType: 'job_transaction', resultingEntityId: result.data?.id });
    setSaving(false);
    onComplete('Receipt logged ✓');
  };

  if (step === 'vendor') return (
    <div style={containerStyle}>
      <div style={labelStyle}>Who did you pay?</div>
      {loadingVendors ? <div style={{ fontSize: 12, color: 'rgba(247,245,240,0.5)' }}>Loading recent vendors…</div> : (
        <ChipPicker chips={vendors} allowOther={true} otherLabel="New vendor (type)" onSelect={c => { setVendor(c.isOther ? c.otherText : c.label); setStep('amount'); }} />
      )}
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'rgba(247,245,240,0.4)', fontSize: 12, cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'DM Sans, sans-serif' }}>← Back</button>
    </div>
  );

  if (step === 'amount') return (
    <div style={containerStyle}>
      <div style={labelStyle}>How much? ({vendor})</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: 'rgba(247,245,240,0.7)', fontSize: 18 }}>$</span>
        <input type="text" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus
          style={{ flex: 1, border: '1px solid rgba(201,168,76,0.3)', borderRadius: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.07)', color: '#F7F5F0', fontFamily: 'DM Sans, sans-serif', fontSize: 16, outline: 'none' }} />
      </div>
      <button onClick={() => setStep('category')} disabled={!(amtNum > 0)}
        className="btn btn-navy" style={{ fontSize: 13 }}>Next →</button>
      <button onClick={() => setStep('vendor')} style={{ background: 'none', border: 'none', color: 'rgba(247,245,240,0.4)', fontSize: 12, cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'DM Sans, sans-serif' }}>← Back</button>
    </div>
  );

  if (step === 'category') return (
    <div style={containerStyle}>
      <div style={labelStyle}>Category</div>
      <ChipPicker chips={CATEGORY_CHIPS} allowOther={false} onSelect={c => { setCategory(c.label); setStep('project'); }} />
      <button onClick={() => setStep('amount')} style={{ background: 'none', border: 'none', color: 'rgba(247,245,240,0.4)', fontSize: 12, cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'DM Sans, sans-serif' }}>← Back</button>
    </div>
  );

  if (step === 'project') return (
    <div style={containerStyle}>
      <div style={labelStyle}>Which project?</div>
      <JobChipPicker includeOverhead={true} onSelect={s => { setJobId(s.isOverhead ? null : s.jobId); setJobLabel(s.jobLabel); setStep('confirm'); }} />
      <button onClick={() => setStep('category')} style={{ background: 'none', border: 'none', color: 'rgba(247,245,240,0.4)', fontSize: 12, cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'DM Sans, sans-serif' }}>← Back</button>
    </div>
  );

  if (step === 'confirm') return (
    <div style={containerStyle}>
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 14, fontSize: 14, color: 'rgba(247,245,240,0.85)', lineHeight: 1.6 }}>
        Logging <strong>${amtNum.toFixed(2)}</strong> at <strong>{vendor}</strong>, category <strong>{category}</strong>, project <strong>{jobLabel}</strong>. Confirm?
      </div>
      {error && <div style={{ color: '#FCA5A5', fontSize: 12 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleConfirm} disabled={saving}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, background: '#C9A84C', color: '#0A1F44', border: 'none', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          {saving ? 'Saving…' : 'Confirm'}
        </button>
        <button onClick={() => setStep('project')} disabled={saving}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, background: 'transparent', color: 'rgba(247,245,240,0.75)', border: '1px solid rgba(247,245,240,0.25)', fontFamily: 'DM Sans, sans-serif', fontSize: 13, cursor: 'pointer' }}>
          Edit
        </button>
      </div>
    </div>
  );

  return null;
}

const PRIORITY_CHIPS = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
];

const DUE_DATE_CHIPS = [
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'this_week', label: 'This week' },
  { id: 'no_due_date', label: 'No due date' },
  { id: 'pick_date', label: 'Pick a date' },
];

function resolveDueDate(chipId, customDate) {
  if (chipId === 'no_due_date' || !chipId) return null;
  if (chipId === 'pick_date') return customDate || null;
  const d = new Date();
  if (chipId === 'today') return d.toISOString().slice(0, 10);
  if (chipId === 'tomorrow') { d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }
  if (chipId === 'this_week') { d.setDate(d.getDate() + (7 - d.getDay())); return d.toISOString().slice(0, 10); }
  return null;
}

function TodoFlow({ profile, initContext, initLabel, pendingTaskId, onComplete, onBack }) {
  const [step, setStep] = useState('project');
  const [jobId, setJobId] = useState(null);
  const [jobLabel, setJobLabel] = useState('');
  const [isPersonal, setIsPersonal] = useState(false);
  const [priority, setPriority] = useState('medium');
  const [dueDateChip, setDueDateChip] = useState('no_due_date');
  const [customDate, setCustomDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const labelStyle = { fontSize: 13, fontWeight: 600, color: 'rgba(247,245,240,0.85)', marginBottom: 4, fontFamily: 'DM Sans, sans-serif' };
  const containerStyle = { display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'DM Sans, sans-serif' };

  const handleConfirm = async () => {
    setSaving(true);
    setError('');
    const dueDate = resolveDueDate(dueDateChip, customDate);
    try {
      const data = await sbCreateUserTodo({
        title: initLabel || 'New todo',
        notes: notes.trim() || null,
        jobId: isPersonal ? null : (jobId || null),
        assignedToUserId: profile?.id,
        dueDate,
        priority,
      });
      if (pendingTaskId) await sbCompletePendingTask(pendingTaskId, { resultingEntityType: 'todo', resultingEntityId: data?.id });
      onComplete('Todo added ✓');
    } catch (e) {
      setError(`Failed: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  if (step === 'project') return (
    <div style={containerStyle}>
      <div style={labelStyle}>Which project? (or Personal)</div>
      <JobChipPicker includePersonal={true} onSelect={s => {
        setIsPersonal(s.isPersonal);
        setJobId(s.isPersonal ? null : s.jobId);
        setJobLabel(s.isPersonal ? 'Personal' : s.jobLabel);
        setStep('priority');
      }} />
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'rgba(247,245,240,0.4)', fontSize: 12, cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'DM Sans, sans-serif' }}>← Back</button>
    </div>
  );

  if (step === 'priority') return (
    <div style={containerStyle}>
      <div style={labelStyle}>Priority</div>
      <ChipPicker chips={PRIORITY_CHIPS} allowOther={false} onSelect={c => { setPriority(c.id); setStep('due'); }} />
      <button onClick={() => setStep('project')} style={{ background: 'none', border: 'none', color: 'rgba(247,245,240,0.4)', fontSize: 12, cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'DM Sans, sans-serif' }}>← Back</button>
    </div>
  );

  if (step === 'due') return (
    <div style={containerStyle}>
      <div style={labelStyle}>Due date</div>
      <ChipPicker chips={DUE_DATE_CHIPS} allowOther={false} onSelect={c => {
        setDueDateChip(c.id);
        if (c.id === 'pick_date') { setStep('pick_date'); } else { setStep('notes'); }
      }} />
      <button onClick={() => setStep('priority')} style={{ background: 'none', border: 'none', color: 'rgba(247,245,240,0.4)', fontSize: 12, cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'DM Sans, sans-serif' }}>← Back</button>
    </div>
  );

  if (step === 'pick_date') return (
    <div style={containerStyle}>
      <div style={labelStyle}>Choose a date</div>
      <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)}
        style={{ border: '1px solid rgba(201,168,76,0.3)', borderRadius: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.07)', color: '#F7F5F0', fontFamily: 'DM Sans, sans-serif', fontSize: 14, outline: 'none' }} />
      <button onClick={() => setStep('notes')} disabled={!customDate}
        className="btn btn-navy" style={{ fontSize: 13 }}>Next →</button>
      <button onClick={() => setStep('due')} style={{ background: 'none', border: 'none', color: 'rgba(247,245,240,0.4)', fontSize: 12, cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'DM Sans, sans-serif' }}>← Back</button>
    </div>
  );

  if (step === 'notes') return (
    <div style={containerStyle}>
      <div style={labelStyle}>Notes (optional)</div>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Add context..."
        style={{ border: '1px solid rgba(201,168,76,0.3)', borderRadius: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.07)', color: '#F7F5F0', fontFamily: 'DM Sans, sans-serif', fontSize: 14, outline: 'none', resize: 'none' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setStep('confirm')} className="btn btn-navy" style={{ fontSize: 13, flex: 1 }}>Next →</button>
        <button onClick={() => setStep('confirm')} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, background: 'transparent', color: 'rgba(247,245,240,0.75)', border: '1px solid rgba(247,245,240,0.25)', fontFamily: 'DM Sans, sans-serif', fontSize: 13, cursor: 'pointer' }}>Skip</button>
      </div>
      <button onClick={() => setStep('due')} style={{ background: 'none', border: 'none', color: 'rgba(247,245,240,0.4)', fontSize: 12, cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'DM Sans, sans-serif' }}>← Back</button>
    </div>
  );

  if (step === 'confirm') return (
    <div style={containerStyle}>
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 14, fontSize: 14, color: 'rgba(247,245,240,0.85)', lineHeight: 1.6 }}>
        Adding todo: <strong>{initLabel}</strong><br />
        Project: <strong>{jobLabel || 'None'}</strong> · Priority: <strong>{priority}</strong> · Due: <strong>{resolveDueDate(dueDateChip, customDate) || 'None'}</strong>
      </div>
      {error && <div style={{ color: '#FCA5A5', fontSize: 12 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleConfirm} disabled={saving}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, background: '#C9A84C', color: '#0A1F44', border: 'none', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          {saving ? 'Saving…' : 'Confirm'}
        </button>
        <button onClick={() => setStep('notes')} disabled={saving}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, background: 'transparent', color: 'rgba(247,245,240,0.75)', border: '1px solid rgba(247,245,240,0.25)', fontFamily: 'DM Sans, sans-serif', fontSize: 13, cursor: 'pointer' }}>
          Edit
        </button>
      </div>
    </div>
  );

  return null;
}

const LEAD_SOURCE_CHIPS = [
  { id: 'door_knock', label: 'Door knock' },
  { id: 'referral', label: 'Referral' },
  { id: 'website', label: 'Website' },
  { id: 'sign', label: 'Sign' },
  { id: 'phone_in', label: 'Phone-in' },
];

function LeadFlow({ profile, initContext, initLabel, pendingTaskId, onComplete, onBack }) {
  const [step, setStep] = useState('customer_name');
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [source, setSource] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const labelStyle = { fontSize: 13, fontWeight: 600, color: 'rgba(247,245,240,0.85)', marginBottom: 4, fontFamily: 'DM Sans, sans-serif' };
  const containerStyle = { display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'DM Sans, sans-serif' };
  const inputStyle = { border: '1px solid rgba(201,168,76,0.3)', borderRadius: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.07)', color: '#F7F5F0', fontFamily: 'DM Sans, sans-serif', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' };

  const handleConfirm = async () => {
    setSaving(true);
    setError('');
    const job = {
      id: crypto.randomUUID(),
      status: 'lead',
      address,
      customer_name: customerName,
      customer_phone: phone,
      lead_source: source,
      notes,
      tenant_id: profile?.tenant_id,
      assigned_rep: profile?.full_name,
      created_by: profile?.id,
      created: new Date().toISOString(),
    };
    const result = await sbSaveJob(job);
    if (!result.ok) { setError(result.error || 'Failed to save lead'); setSaving(false); return; }
    if (pendingTaskId) await sbCompletePendingTask(pendingTaskId, { resultingEntityType: 'job', resultingEntityId: job.id });
    setSaving(false);
    onComplete('Lead added ✓');
  };

  if (step === 'customer_name') return (
    <div style={containerStyle}>
      <div style={labelStyle}>Customer name</div>
      <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Full name" autoFocus style={inputStyle} />
      <button onClick={() => setStep('phone')} disabled={!customerName.trim()} className="btn btn-navy" style={{ fontSize: 13 }}>Next →</button>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'rgba(247,245,240,0.4)', fontSize: 12, cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'DM Sans, sans-serif' }}>← Back</button>
    </div>
  );

  if (step === 'phone') return (
    <div style={containerStyle}>
      <div style={labelStyle}>Phone number</div>
      <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(816) 555-0100" style={inputStyle} />
      <button onClick={() => setStep('address')} disabled={!phone.trim()} className="btn btn-navy" style={{ fontSize: 13 }}>Next →</button>
      <button onClick={() => setStep('customer_name')} style={{ background: 'none', border: 'none', color: 'rgba(247,245,240,0.4)', fontSize: 12, cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'DM Sans, sans-serif' }}>← Back</button>
    </div>
  );

  if (step === 'address') return (
    <div style={containerStyle}>
      <div style={labelStyle}>Job address</div>
      <input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St, Kansas City" style={inputStyle} />
      <button onClick={() => setStep('source')} disabled={!address.trim()} className="btn btn-navy" style={{ fontSize: 13 }}>Next →</button>
      <button onClick={() => setStep('phone')} style={{ background: 'none', border: 'none', color: 'rgba(247,245,240,0.4)', fontSize: 12, cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'DM Sans, sans-serif' }}>← Back</button>
    </div>
  );

  if (step === 'source') return (
    <div style={containerStyle}>
      <div style={labelStyle}>How did they find you?</div>
      <ChipPicker chips={LEAD_SOURCE_CHIPS} allowOther={true} otherLabel="Other" onSelect={c => { setSource(c.isOther ? c.otherText : c.id); setStep('notes'); }} />
      <button onClick={() => setStep('address')} style={{ background: 'none', border: 'none', color: 'rgba(247,245,240,0.4)', fontSize: 12, cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'DM Sans, sans-serif' }}>← Back</button>
    </div>
  );

  if (step === 'notes') return (
    <div style={containerStyle}>
      <div style={labelStyle}>Notes (optional)</div>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Anything extra..." style={{ ...inputStyle, resize: 'none' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setStep('confirm')} className="btn btn-navy" style={{ fontSize: 13, flex: 1 }}>Next →</button>
        <button onClick={() => setStep('confirm')} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, background: 'transparent', color: 'rgba(247,245,240,0.75)', border: '1px solid rgba(247,245,240,0.25)', fontFamily: 'DM Sans, sans-serif', fontSize: 13, cursor: 'pointer' }}>Skip</button>
      </div>
      <button onClick={() => setStep('source')} style={{ background: 'none', border: 'none', color: 'rgba(247,245,240,0.4)', fontSize: 12, cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'DM Sans, sans-serif' }}>← Back</button>
    </div>
  );

  if (step === 'confirm') return (
    <div style={containerStyle}>
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 14, fontSize: 14, color: 'rgba(247,245,240,0.85)', lineHeight: 1.7 }}>
        New lead:<br />
        <strong>{customerName}</strong> · {phone}<br />
        <strong>{address}</strong><br />
        Source: <strong>{source}</strong>
        {notes && <><br />Notes: {notes}</>}
      </div>
      {error && <div style={{ color: '#FCA5A5', fontSize: 12 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleConfirm} disabled={saving}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, background: '#C9A84C', color: '#0A1F44', border: 'none', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          {saving ? 'Saving…' : 'Confirm'}
        </button>
        <button onClick={() => setStep('notes')} disabled={saving}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, background: 'transparent', color: 'rgba(247,245,240,0.75)', border: '1px solid rgba(247,245,240,0.25)', fontFamily: 'DM Sans, sans-serif', fontSize: 13, cursor: 'pointer' }}>
          Edit
        </button>
      </div>
    </div>
  );

  return null;
}

function formatToolName(tool) {
  if (!tool) return tool;
  return tool
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function getResultSummary(result) {
  if (!result) return '';
  if (result.error) return result.error;
  if (result.message) return result.message;
  if (result.id) return `ID: ${result.id}`;
  try {
    const str = JSON.stringify(result);
    return str.length > 80 ? str.slice(0, 77) + '...' : str;
  } catch {
    return '';
  }
}

function TypingDots() {
  const dotStyle = (delay) => ({
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: '#C9A84C',
    display: 'inline-block',
    margin: '0 2px',
    animation: 'masterAgentBounce 1.2s infinite',
    animationDelay: delay,
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px' }}>
      <span style={dotStyle('0s')} />
      <span style={dotStyle('0.2s')} />
      <span style={dotStyle('0.4s')} />
    </div>
  );
}

function ActionsPanel({ actions }) {
  const [open, setOpen] = useState(false);
  if (!actions || actions.length === 0) return null;
  return (
    <div style={{ marginTop: 6 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#7BA7D4',
          fontSize: 11,
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontFamily: 'DM Sans, sans-serif',
        }}
      >
        <span style={{ color: '#4CAF50', fontWeight: 700 }}>✓</span>
        {actions.length} action{actions.length !== 1 ? 's' : ''} taken
        <span style={{ fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div
          style={{
            marginTop: 5,
            background: 'rgba(0,0,0,0.25)',
            borderRadius: 6,
            padding: '6px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {actions.map((action, i) => {
            const isError = action.result && action.result.error;
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 6,
                  fontSize: 11,
                  fontFamily: 'DM Sans, sans-serif',
                  color: '#A0B8D0',
                }}
              >
                <span style={{ color: isError ? '#EF5350' : '#4CAF50', flexShrink: 0 }}>
                  {isError ? '✗' : '✓'}
                </span>
                <span>
                  <span style={{ color: '#C9A84C', fontWeight: 600 }}>
                    {formatToolName(action.tool)}
                  </span>
                  {' — '}
                  <span>{getResultSummary(action.result)}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function MasterAgent({ profile, pendingAction, clearPendingAction }) {
  const [open, setOpen] = useState(false);
  const [verb, setVerb] = useState(null);
  const [flowActive, setFlowActive] = useState(false); // true = capture done, now in verb flow
  const [captureContext, setCaptureContext] = useState({});
  const [captureLabel, setCaptureLabel] = useState('');
  const [pendingTaskId, setPendingTaskId] = useState(null);
  const [captureStep, setCaptureStep] = useState('init'); // 'init' | 'done'
  const [captureWorking, setCaptureWorking] = useState(false);
  const [captureErr, setCaptureErr] = useState('');
  const [captureToast, setCaptureToast] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPulse, setShowPulse] = useState(true);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [attachment, setAttachment] = useState(null); // { base64, mime, preview }
  const [attaching, setAttaching] = useState(false);
  const [attachErr, setAttachErr] = useState('');
  const threadRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);

  const isMob = typeof window !== 'undefined' && window.innerWidth < 768;

  useEffect(() => {
    const timer = setTimeout(() => setShowPulse(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current && inputRef.current.focus(), 120);
    }
  }, [open]);

  useEffect(() => {
    if (pendingAction?.kind === 'master_agent_tool_call') {
      setInput(pendingAction.payload?.user_message || '');
      setOpen(true);
      clearPendingAction?.();
    }
  }, [pendingAction]);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const callMaster = async (body, userMessageText) => {
    setLoading(true);
    try {
      const res = await fetch(AI_MASTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      const aiText = data.response || 'No response.';
      const aiActions = data.actions || [];

      aiActions.forEach(action => {
        if (action.result?.error) {
          captureFailedIntent({
            kind: 'master_agent_tool_call',
            payload: { tool_name: action.tool, error_message: action.result.error, user_message: userMessageText },
            message: action.result.error,
          }).catch(() => {});
        }
      });

      setMessages((prev) => [
        ...prev,
        { type: 'ai', text: aiText, actions: aiActions },
      ]);
      setConversationHistory((prev) => [
        ...prev,
        { role: 'assistant', content: aiText },
      ]);
      setPendingConfirm(data.pending_action || null);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { type: 'ai', text: 'Something went wrong. Please try again.', actions: [] },
      ]);
      setPendingConfirm(null);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (text) => {
    const trimmed = (text || input).trim();
    if (loading) return;
    if (!trimmed && !attachment) return;
    if (pendingConfirm) setPendingConfirm(null);

    const messageContent = attachment
      ? [
          { type: 'image', source: { type: 'base64', media_type: attachment.mime, data: attachment.base64 } },
          ...(trimmed ? [{ type: 'text', text: trimmed }] : []),
        ]
      : trimmed;

    const userMsg = { role: 'user', content: messageContent };
    const newHistory = [...conversationHistory, userMsg];

    const displayText = trimmed || (attachment ? '[image attached]' : '');
    setMessages((prev) => [...prev, { type: 'user', text: displayText, image: attachment?.preview || null }]);
    setConversationHistory(newHistory);
    setInput('');
    setAttachment(null);
    setAttachErr('');

    await callMaster({
      user_id: profile?.id,
      tenant_id: profile?.tenant_id,
      role: profile?.role,
      full_name: profile?.full_name,
      message: messageContent,
      conversation_history: newHistory,
    }, displayText);
  };

  const onAttachClick = () => fileRef.current?.click();

  const onFilePicked = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAttachErr('');
    setAttaching(true);
    try {
      const payload = await fileToVisionPayload(file);
      // Anthropic 5MB ceiling per image (base64 expands ~33%); after canvas resize at 1024px JPEG-85 we're well under.
      if (payload.base64.length > 5 * 1024 * 1024 * 1.34) {
        setAttachErr('Image too large after compression. Try a smaller photo.');
        setAttaching(false);
        return;
      }
      setAttachment(payload);
    } catch (err) {
      setAttachErr('Could not read image. HEIC, JPG, PNG only.');
    } finally {
      setAttaching(false);
    }
  };

  const removeAttachment = () => {
    setAttachment(null);
    setAttachErr('');
  };

  const confirmPending = async () => {
    if (!pendingConfirm || loading) return;
    const action = pendingConfirm;
    setPendingConfirm(null);
    setMessages((prev) => [...prev, { type: 'user', text: 'Confirmed.' }]);
    await callMaster({
      user_id: profile?.id,
      tenant_id: profile?.tenant_id,
      role: profile?.role,
      full_name: profile?.full_name,
      pending_action: action,
      confirmed: true,
    }, action.description || action.tool);
  };

  const cancelPending = () => {
    if (!pendingConfirm) return;
    setPendingConfirm(null);
    setMessages((prev) => [
      ...prev,
      { type: 'ai', text: 'Cancelled. Nothing was saved.', actions: [] },
    ]);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setConversationHistory([]);
  };

  const panelVisible = open;
  const panelStyle = isMob
    ? {
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#0A1F44',
        display: 'flex',
        flexDirection: 'column',
        opacity: panelVisible ? 1 : 0,
        pointerEvents: panelVisible ? 'auto' : 'none',
        transition: 'opacity 0.2s ease',
      }
    : {
        position: 'fixed',
        top: 0,
        right: 0,
        width: 420,
        height: '100vh',
        zIndex: 9999,
        background: '#0A1F44',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(10,31,68,0.6)',
        transform: panelVisible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.2s ease',
        pointerEvents: panelVisible ? 'auto' : 'none',
      };

  const hasMessages = messages.length > 0;

  return (
    <>
      <style>{`
        @keyframes masterAgentPulse {
          0% { transform: scale(1); opacity: 0.7; }
          70% { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes masterAgentBounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
      `}</style>

      {/* Floating Trigger Button */}
      <div
        style={{
          position: 'fixed',
          bottom: 90,
          right: 18,
          zIndex: 9998,
          width: 52,
          height: 52,
        }}
      >
        {showPulse && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '2px solid #C9A84C',
              animation: 'masterAgentPulse 1.4s ease-out 2',
              pointerEvents: 'none',
            }}
          />
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          title="Open AI Command Panel (Ctrl+K)"
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: '#060F22',
            border: '2px solid #C9A84C',
            boxShadow: '0 4px 24px rgba(10,31,68,0.5)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            lineHeight: 1,
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.08)';
            e.currentTarget.style.boxShadow = '0 6px 30px rgba(201,168,76,0.35)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 24px rgba(10,31,68,0.5)';
          }}
        >
          ✦
        </button>
      </div>

      {/* Overlay backdrop on mobile */}
      {isMob && open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9998,
            background: 'rgba(0,0,0,0.5)',
          }}
        />
      )}

      {/* Command Panel */}
      <div style={panelStyle}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 20px 14px',
            borderBottom: '1px solid rgba(201,168,76,0.2)',
            flexShrink: 0,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'DM Serif Display, serif',
                fontSize: 24,
                color: '#F7F5F0',
                lineHeight: 1.2,
                marginBottom: 0,
              }}
            >
              What can I help you with?
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {hasMessages && (
              <button
                onClick={clearChat}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'rgba(247,245,240,0.35)',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 12,
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                Clear chat
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'rgba(247,245,240,0.6)',
                fontSize: 20,
                lineHeight: 1,
                padding: '2px 4px',
                borderRadius: 4,
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#F7F5F0')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(247,245,240,0.6)')}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Thread */}
        <div
          ref={threadRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 16px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(201,168,76,0.2) transparent',
          }}
        >
          {!hasMessages && !loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 8 }}>
              {/* Pending task list */}
              <PendingTaskList onResume={(task) => {
                setVerb(task.verb);
                setCaptureContext(task.context || {});
                setCaptureLabel(task.quick_label || '');
                setPendingTaskId(task.id);
                setCaptureErr('');
                pushBreadcrumb({ type: 'tap', label: `resume:${task.verb}`, route: 'master-agent' });
              }} />

              {/* Quick-action tile grid */}
              {!verb && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 10,
                }}>
                  {QUICK_TILES.map(tile => (
                    <button
                      key={tile.verb}
                      onClick={() => {
                        setVerb(tile.verb);
                        setCaptureContext({});
                        setCaptureLabel('');
                        setCaptureErr('');
                        pushBreadcrumb({ type: 'tap', label: `tile:${tile.verb}`, route: 'master-agent' });
                        if (tile.verb === 'bug') {
                          const snap = getSnapshot();
                          setCaptureContext({ ...snap });
                        }
                      }}
                      style={{
                        background: '#fff',
                        border: '1px solid #E8E4DC',
                        borderRadius: 12,
                        padding: 16,
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        transition: 'background 0.13s, border-color 0.13s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#F7F5F0'; e.currentTarget.style.borderColor = '#C9A84C'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#E8E4DC'; }}
                    >
                      <span style={{ width: 20, height: 20, display: 'flex', color: '#0A1F44' }}>{Ic[tile.ic]}</span>
                      <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 14, fontWeight: 500, color: '#0A1F44', lineHeight: 1.3 }}>{tile.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Verb flow (receipt/todo/lead/CO/bug) */}
              {verb && flowActive && verb === 'receipt' && (
                <ReceiptFlow
                  profile={profile}
                  initContext={captureContext}
                  pendingTaskId={pendingTaskId}
                  onComplete={(msg) => {
                    setVerb(null); setFlowActive(false); setPendingTaskId(null);
                    setCaptureContext({}); setCaptureLabel('');
                    setCaptureToast(msg || 'Done');
                    setTimeout(() => setCaptureToast(''), 4000);
                  }}
                  onBack={() => { setFlowActive(false); }}
                />
              )}
              {verb && flowActive && verb === 'todo' && (
                <TodoFlow
                  profile={profile}
                  initContext={captureContext}
                  initLabel={captureLabel}
                  pendingTaskId={pendingTaskId}
                  onComplete={(msg) => {
                    setVerb(null); setFlowActive(false); setPendingTaskId(null);
                    setCaptureContext({}); setCaptureLabel('');
                    setCaptureToast(msg || 'Done');
                    setTimeout(() => setCaptureToast(''), 4000);
                  }}
                  onBack={() => setFlowActive(false)}
                />
              )}
              {verb && flowActive && verb === 'lead' && (
                <LeadFlow
                  profile={profile}
                  initContext={captureContext}
                  initLabel={captureLabel}
                  pendingTaskId={pendingTaskId}
                  onComplete={(msg) => {
                    setVerb(null); setFlowActive(false); setPendingTaskId(null);
                    setCaptureContext({}); setCaptureLabel('');
                    setCaptureToast(msg || 'Done');
                    setTimeout(() => setCaptureToast(''), 4000);
                  }}
                  onBack={() => setFlowActive(false)}
                />
              )}
              {verb && flowActive && !['receipt','todo','lead'].includes(verb) && (
                <div style={{ background: 'rgba(247,245,240,0.08)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 10, padding: 16, fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: 'rgba(247,245,240,0.75)' }}>
                  <div style={{ marginBottom: 10 }}>Resume flow wired in next commit — verb: <strong style={{ color: '#C9A84C' }}>{verb}</strong></div>
                  <button onClick={() => { setVerb(null); setFlowActive(false); }} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, padding: '6px 12px', color: '#F7F5F0', fontFamily: 'DM Sans, sans-serif', fontSize: 12, cursor: 'pointer' }}>← Back</button>
                </div>
              )}

              {/* Quick-capture step */}
              {verb && !flowActive && <QuickCapture
                verb={verb}
                profile={profile}
                captureContext={captureContext}
                setCaptureContext={setCaptureContext}
                captureLabel={captureLabel}
                setCaptureLabel={setCaptureLabel}
                captureWorking={captureWorking}
                setCaptureWorking={setCaptureWorking}
                captureErr={captureErr}
                setCaptureErr={setCaptureErr}
                onSaveForLater={async (ctx, label) => {
                  const result = await sbCreatePendingTask({ verb, quickLabel: label, context: ctx });
                  if (result.ok) {
                    setVerb(null); setCaptureContext({}); setCaptureLabel('');
                    setCaptureToast('Saved for later');
                    setTimeout(() => setCaptureToast(''), 4000);
                  } else {
                    setCaptureErr(result.error || 'Failed to save');
                  }
                }}
                onContinueNow={async (ctx, label) => {
                  const result = await sbCreatePendingTask({ verb, quickLabel: label, context: ctx });
                  if (!result.ok) { setCaptureErr(result.error || 'Failed'); return; }
                  const taskId = result.data.id;
                  setPendingTaskId(taskId);
                  await sbUpdatePendingTask(taskId, { status: 'in_progress' });
                  setCaptureContext(ctx);
                  setCaptureLabel(label);
                  setFlowActive(true);
                }}
                onBack={() => { setVerb(null); setFlowActive(false); setCaptureContext({}); setCaptureLabel(''); setCaptureErr(''); }}
              />}
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: msg.type === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  maxWidth: '82%',
                  padding: '10px 14px',
                  borderRadius: msg.type === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  background: msg.type === 'user' ? '#C9A84C' : '#0F2A5C',
                  color: msg.type === 'user' ? '#0A1F44' : '#F7F5F0',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 14,
                  lineHeight: 1.55,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {msg.image && (
                  <img
                    src={msg.image}
                    alt="attachment"
                    style={{ maxWidth: '100%', borderRadius: 10, marginBottom: msg.text ? 8 : 0, display: 'block' }}
                  />
                )}
                {msg.text}
                {msg.type === 'ai' && <ActionsPanel actions={msg.actions} />}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
              <div
                style={{
                  background: '#0F2A5C',
                  borderRadius: '18px 18px 18px 4px',
                  overflow: 'hidden',
                }}
              >
                <TypingDots />
              </div>
            </div>
          )}

          {pendingConfirm && !loading && (
            <div
              style={{
                marginTop: 4,
                background: 'rgba(201,168,76,0.12)',
                border: '1px solid rgba(201,168,76,0.45)',
                borderRadius: 12,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div
                style={{
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1.2,
                  color: '#C9A84C',
                  textTransform: 'uppercase',
                }}
              >
                Confirm action
              </div>
              <div
                style={{
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 14,
                  color: '#F7F5F0',
                  lineHeight: 1.5,
                }}
              >
                {pendingConfirm.description || `Run ${formatToolName(pendingConfirm.tool)}?`}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={confirmPending}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: '#C9A84C',
                    color: '#0A1F44',
                    border: 'none',
                    fontFamily: 'DM Sans, sans-serif',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Confirm
                </button>
                <button
                  onClick={cancelPending}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'transparent',
                    color: 'rgba(247,245,240,0.75)',
                    border: '1px solid rgba(247,245,240,0.25)',
                    fontFamily: 'DM Sans, sans-serif',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Capture toast */}
        {captureToast && (
          <div style={{ margin: '0 16px 8px', padding: '10px 14px', background: '#D1FAE5', border: '1px solid #22c55e', borderRadius: 8, fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#166534' }}>
            {captureToast}
          </div>
        )}

        {/* Helper hint — shown when no messages */}
        {!hasMessages && !loading && (
          <div style={{ padding: '0 16px 8px', fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: '#6b7280' }}>
            Tap an option above, or type below.
          </div>
        )}

        {/* Input Bar */}
        <div
          style={{
            padding: '10px 14px 16px',
            borderTop: '1px solid rgba(201,168,76,0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            flexShrink: 0,
          }}
        >
          {(attachment || attaching || attachErr) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {attaching && (
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: 'rgba(247,245,240,0.55)' }}>Processing image…</span>
              )}
              {attachment && !attaching && (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <img src={attachment.preview} alt="attachment preview" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(201,168,76,0.45)' }} />
                  <button
                    onClick={removeAttachment}
                    aria-label="Remove attachment"
                    style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#0A1F44', border: '1px solid #C9A84C', color: '#F7F5F0', fontSize: 11, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                  >×</button>
                </div>
              )}
              {attachErr && (
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: '#FCA5A5' }}>{attachErr}</span>
              )}
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.heic,.heif"
            capture="environment"
            onChange={onFilePicked}
            style={{ display: 'none' }}
          />
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
          <button
            onClick={onAttachClick}
            disabled={loading || attaching}
            title="Attach image"
            aria-label="Attach image"
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(201,168,76,0.3)',
              color: 'rgba(247,245,240,0.75)',
              cursor: loading || attaching ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginBottom: 2,
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => { if (!loading && !attaching) e.currentTarget.style.borderColor = 'rgba(201,168,76,0.6)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.3)'; }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <textarea
            ref={inputRef}
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tell me what to do..."
            disabled={loading}
            style={{
              flex: 1,
              resize: 'none',
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(201,168,76,0.2)',
              borderRadius: 12,
              padding: '10px 12px',
              color: '#F7F5F0',
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 14,
              lineHeight: 1.5,
              outline: 'none',
              transition: 'border-color 0.15s',
              scrollbarWidth: 'none',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'rgba(201,168,76,0.55)')}
            onBlur={(e) => (e.target.style.borderColor = 'rgba(201,168,76,0.2)')}
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || (!input.trim() && !attachment)}
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              background: loading || (!input.trim() && !attachment) ? 'rgba(201,168,76,0.3)' : '#C9A84C',
              border: 'none',
              cursor: loading || (!input.trim() && !attachment) ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'background 0.15s, transform 0.1s',
              marginBottom: 2,
            }}
            onMouseEnter={(e) => {
              if (!loading && (input.trim() || attachment)) e.currentTarget.style.transform = 'scale(1.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
            aria-label="Send"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke={loading || (!input.trim() && !attachment) ? 'rgba(10,31,68,0.5)' : '#0A1F44'}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
          </div>
        </div>
      </div>
    </>
  );
}
