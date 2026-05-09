import { useState, useEffect, useRef } from 'react';
import { sb, sbSave as sbSaveJob, AI_MASTER_URL, ANON_KEY, captureFailedIntent, sbUploadReceipt, sbCreateTransaction, sbCreateUserTodo, sbCreateChangeOrder, SUBMIT_BUG_REPORT_URL, AV_TENANT } from '../../lib/supabase';
import { pushBreadcrumb, getSnapshot } from '../../lib/bugContext';
import { Ic } from '../../lib/utils';
import { sbCreatePendingTask, sbUpdatePendingTask, sbCompletePendingTask } from '../../lib/pendingTasks';
import PendingTaskListReal from './PendingTaskList';
import ChipPicker from './ChipPicker';
import JobChipPicker from './JobChipPicker';
import { parseReceiptLabel, parseTodoLabel, parseLeadLabel, parseCOLabel, matchProjectHint, amountToWords } from '../../lib/labelParser';

const ACTIVE_JOB_STATUSES = ['lead', 'proposal', 'contract', 'in_progress', 'final_touches'];

async function loadActiveJobs() {
  const { data } = await sb.from('jobs')
    .select('id, address, status')
    .in('status', ACTIVE_JOB_STATUSES)
    .order('updated_at', { ascending: false })
    .limit(50);
  return data || [];
}

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

// FieldRow — single row in the Confirm card. Label, value, Edit button.
function FieldRow({ label, value, onEdit }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '6px 0' }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 11, color: 'rgba(247,245,240,0.55)', display: 'block', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
        <span style={{ fontSize: 14, color: 'rgba(247,245,240,0.95)', fontWeight: 500, wordBreak: 'break-word' }}>{value || <span style={{ color: 'rgba(247,245,240,0.4)' }}>—</span>}</span>
      </span>
      <button onClick={onEdit} style={{ background: 'none', border: '1px solid rgba(201,168,76,0.4)', borderRadius: 6, padding: '4px 10px', color: '#C9A84C', fontSize: 12, fontFamily: 'DM Sans, sans-serif', cursor: 'pointer', flexShrink: 0 }}>Edit</button>
    </div>
  );
}

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

function ReceiptFlow({ profile, initContext, initLabel, pendingTaskId, onComplete, onBack }) {
  const [vendor, setVendor] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [amount, setAmount] = useState(null);
  const [amountInput, setAmountInput] = useState('');
  const [category, setCategory] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [jobLabel, setJobLabel] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [loaded, setLoaded] = useState(false);
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
      const seen = new Set();
      const vlist = [];
      for (const r of (data || [])) {
        if (r.payer_or_payee_name && !seen.has(r.payer_or_payee_name)) {
          seen.add(r.payer_or_payee_name);
          vlist.push({ id: r.payer_or_payee_name, label: r.payer_or_payee_name });
          if (vlist.length >= 8) break;
        }
      }
      setVendors(vlist);

      const activeJobs = await loadActiveJobs();
      const recentNames = vlist.map(v => v.label);
      const parsed = parseReceiptLabel(initLabel || '', recentNames);
      if (parsed.vendor) setVendor(parsed.vendor);
      if (parsed.amount != null && parsed.amount > 0) { setAmount(parsed.amount); setAmountInput(String(parsed.amount)); }
      if (parsed.category) setCategory(parsed.category);
      if (parsed.project_hint) {
        const matches = matchProjectHint(parsed.project_hint, activeJobs);
        if (matches.length === 1) { setJobId(matches[0].id); setJobLabel(matches[0].address); }
      }
      setLoaded(true);
    })();
  }, []);

  const containerStyle = { display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'DM Sans, sans-serif' };
  const labelStyle = { fontSize: 13, fontWeight: 600, color: 'rgba(247,245,240,0.85)', marginBottom: 4 };
  const inputStyle = { border: '1px solid rgba(201,168,76,0.3)', borderRadius: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.07)', color: '#F7F5F0', fontFamily: 'DM Sans, sans-serif', fontSize: 16, outline: 'none', width: '100%', boxSizing: 'border-box' };
  const backStyle = { background: 'none', border: 'none', color: 'rgba(247,245,240,0.4)', fontSize: 12, cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'DM Sans, sans-serif' };

  const firstMissing = () => {
    if (!vendor) return 'vendor';
    if (amount == null || !(amount > 0)) return 'amount';
    if (!category) return 'category';
    if (!jobId && jobLabel !== 'Overhead') return 'project';
    return 'confirm';
  };
  const step = editingField || firstMissing();

  const submitAmount = () => {
    const n = parseFloat((amountInput || '').replace(/[^0-9.]/g, ''));
    if (!(n > 0)) return;
    setAmount(n);
    setEditingField(null);
  };

  const handleConfirm = async () => {
    setSaving(true);
    setError('');
    const today = new Date().toISOString().slice(0, 10);
    const result = await sbCreateTransaction({
      job_id: jobId || null,
      direction: 'out',
      type: CATEGORY_MAP[category] || 'other_expense',
      amount,
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

  if (!loaded) return <div style={containerStyle}><div style={{ fontSize: 12, color: 'rgba(247,245,240,0.5)' }}>Loading…</div></div>;

  if (step === 'vendor') return (
    <div style={containerStyle}>
      <div style={labelStyle}>Who did you pay?</div>
      <ChipPicker chips={vendors} allowOther={true} otherLabel="New vendor (type)" onSelect={c => { setVendor(c.isOther ? c.otherText : c.label); setEditingField(null); }} />
      <button onClick={onBack} style={backStyle}>← Back</button>
    </div>
  );

  if (step === 'amount') return (
    <div style={containerStyle}>
      <div style={labelStyle}>How much?{vendor ? ` (${vendor})` : ''}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: 'rgba(247,245,240,0.7)', fontSize: 18 }}>$</span>
        <input type="text" inputMode="decimal" value={amountInput} onChange={e => setAmountInput(e.target.value)} placeholder="0.00" autoFocus
          onKeyDown={e => { if (e.key === 'Enter') submitAmount(); }}
          style={{ ...inputStyle, flex: 1 }} />
      </div>
      <button onClick={submitAmount} disabled={!(parseFloat((amountInput || '').replace(/[^0-9.]/g, '')) > 0)} className="btn btn-navy" style={{ fontSize: 13 }}>Save</button>
      {editingField ? null : <button onClick={onBack} style={backStyle}>← Back</button>}
    </div>
  );

  if (step === 'category') return (
    <div style={containerStyle}>
      <div style={labelStyle}>Category</div>
      <ChipPicker chips={CATEGORY_CHIPS} allowOther={false} onSelect={c => { setCategory(c.label); setEditingField(null); }} />
      {editingField ? null : <button onClick={onBack} style={backStyle}>← Back</button>}
    </div>
  );

  if (step === 'project') return (
    <div style={containerStyle}>
      <div style={labelStyle}>Which project?</div>
      <JobChipPicker includeOverhead={true} onSelect={s => {
        if (s.isOverhead) { setJobId(null); setJobLabel('Overhead'); } else { setJobId(s.jobId); setJobLabel(s.jobLabel); }
        setEditingField(null);
      }} />
      {editingField ? null : <button onClick={onBack} style={backStyle}>← Back</button>}
    </div>
  );

  // confirm
  return (
    <div style={containerStyle}>
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 14, color: 'rgba(247,245,240,0.85)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontWeight: 600, color: '#C9A84C', marginBottom: 6, fontSize: 13 }}>Adding a receipt: confirm details</div>
        <FieldRow label="Vendor" value={vendor} onEdit={() => setEditingField('vendor')} />
        <FieldRow label="Amount" value={amount != null ? `$${amount.toFixed(2)}` : null} onEdit={() => { setAmountInput(amount != null ? String(amount) : ''); setEditingField('amount'); }} />
        <FieldRow label="Category" value={category} onEdit={() => setEditingField('category')} />
        <FieldRow label="Project" value={jobLabel} onEdit={() => setEditingField('project')} />
      </div>
      {error && <div style={{ color: '#FCA5A5', fontSize: 12 }}>{error}</div>}
      <button onClick={handleConfirm} disabled={saving}
        style={{ padding: '10px 12px', borderRadius: 8, background: '#C9A84C', color: '#0A1F44', border: 'none', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
        {saving ? 'Saving…' : 'Confirm'}
      </button>
      <button onClick={onBack} style={backStyle}>← Back</button>
    </div>
  );
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
  const [title, setTitle] = useState(null);
  const [titleInput, setTitleInput] = useState('');
  const [jobId, setJobId] = useState(null);
  const [jobLabel, setJobLabel] = useState(null);
  const [isPersonal, setIsPersonal] = useState(false);
  const [priority, setPriority] = useState('medium');
  const [dueDateChip, setDueDateChip] = useState(null);
  const [customDate, setCustomDate] = useState('');
  const [notes, setNotes] = useState('');
  const [editingField, setEditingField] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const activeJobs = await loadActiveJobs();
      const parsed = parseTodoLabel(initLabel || '');
      if (parsed.title) { setTitle(parsed.title); setTitleInput(parsed.title); }
      if (parsed.due_hint) setDueDateChip(parsed.due_hint);
      if (parsed.project_hint) {
        const matches = matchProjectHint(parsed.project_hint, activeJobs);
        if (matches.length === 1) { setJobId(matches[0].id); setJobLabel(matches[0].address); setIsPersonal(false); }
      }
      setLoaded(true);
    })();
  }, []);

  const labelStyle = { fontSize: 13, fontWeight: 600, color: 'rgba(247,245,240,0.85)', marginBottom: 4, fontFamily: 'DM Sans, sans-serif' };
  const containerStyle = { display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'DM Sans, sans-serif' };
  const inputStyle = { border: '1px solid rgba(201,168,76,0.3)', borderRadius: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.07)', color: '#F7F5F0', fontFamily: 'DM Sans, sans-serif', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' };
  const backStyle = { background: 'none', border: 'none', color: 'rgba(247,245,240,0.4)', fontSize: 12, cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'DM Sans, sans-serif' };

  const projectChosen = isPersonal || !!jobId;
  const dueChosen = dueDateChip != null;
  const firstMissing = () => {
    if (!title || !title.trim()) return 'title';
    if (!projectChosen) return 'project';
    return 'confirm';
  };
  const step = editingField || firstMissing();

  const submitTitle = () => {
    const t = (titleInput || '').trim();
    if (t.length < 3) return;
    setTitle(t);
    setEditingField(null);
  };

  const handleConfirm = async () => {
    setSaving(true);
    setError('');
    const dueDate = resolveDueDate(dueDateChip, customDate);
    try {
      const data = await sbCreateUserTodo({
        title: title || initLabel || 'New todo',
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

  if (!loaded) return <div style={containerStyle}><div style={{ fontSize: 12, color: 'rgba(247,245,240,0.5)' }}>Loading…</div></div>;

  if (step === 'title') return (
    <div style={containerStyle}>
      <div style={labelStyle}>What is this todo?</div>
      <input type="text" value={titleInput} onChange={e => setTitleInput(e.target.value)} placeholder="Min 3 characters..." autoFocus
        onKeyDown={e => { if (e.key === 'Enter') submitTitle(); }}
        style={inputStyle} />
      <button onClick={submitTitle} disabled={(titleInput || '').trim().length < 3} className="btn btn-navy" style={{ fontSize: 13 }}>Save</button>
      {editingField ? null : <button onClick={onBack} style={backStyle}>← Back</button>}
    </div>
  );

  if (step === 'project') return (
    <div style={containerStyle}>
      <div style={labelStyle}>Which project? (or Personal)</div>
      <JobChipPicker includePersonal={true} onSelect={s => {
        setIsPersonal(!!s.isPersonal);
        setJobId(s.isPersonal ? null : s.jobId);
        setJobLabel(s.isPersonal ? 'Personal' : s.jobLabel);
        setEditingField(null);
      }} />
      {editingField ? null : <button onClick={onBack} style={backStyle}>← Back</button>}
    </div>
  );

  if (step === 'priority') return (
    <div style={containerStyle}>
      <div style={labelStyle}>Priority</div>
      <ChipPicker chips={PRIORITY_CHIPS} allowOther={false} onSelect={c => { setPriority(c.id); setEditingField(null); }} />
    </div>
  );

  if (step === 'due') return (
    <div style={containerStyle}>
      <div style={labelStyle}>Due date</div>
      <ChipPicker chips={DUE_DATE_CHIPS} allowOther={false} onSelect={c => {
        setDueDateChip(c.id);
        if (c.id === 'pick_date') { setEditingField('pick_date'); } else { setEditingField(null); }
      }} />
    </div>
  );

  if (step === 'pick_date') return (
    <div style={containerStyle}>
      <div style={labelStyle}>Choose a date</div>
      <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)} style={inputStyle} />
      <button onClick={() => setEditingField(null)} disabled={!customDate} className="btn btn-navy" style={{ fontSize: 13 }}>Save</button>
    </div>
  );

  if (step === 'notes') return (
    <div style={containerStyle}>
      <div style={labelStyle}>Notes (optional)</div>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Add context..."
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setEditingField(null); } }}
        style={{ ...inputStyle, resize: 'none' }} />
      <button onClick={() => setEditingField(null)} className="btn btn-navy" style={{ fontSize: 13 }}>Save</button>
    </div>
  );

  // confirm
  const dueResolved = resolveDueDate(dueDateChip, customDate);
  const dueDisplay = dueResolved || (dueDateChip === 'no_due_date' ? 'No due date' : null);
  return (
    <div style={containerStyle}>
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 14, color: 'rgba(247,245,240,0.85)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontWeight: 600, color: '#C9A84C', marginBottom: 6, fontSize: 13 }}>Adding a todo: confirm details</div>
        <FieldRow label="Title" value={title} onEdit={() => { setTitleInput(title || ''); setEditingField('title'); }} />
        <FieldRow label="Project" value={isPersonal ? 'Personal' : jobLabel} onEdit={() => setEditingField('project')} />
        <FieldRow label="Priority" value={priority} onEdit={() => setEditingField('priority')} />
        <FieldRow label="Due" value={dueDisplay} onEdit={() => setEditingField('due')} />
        <FieldRow label="Notes" value={notes ? notes : null} onEdit={() => setEditingField('notes')} />
      </div>
      {error && <div style={{ color: '#FCA5A5', fontSize: 12 }}>{error}</div>}
      <button onClick={handleConfirm} disabled={saving}
        style={{ padding: '10px 12px', borderRadius: 8, background: '#C9A84C', color: '#0A1F44', border: 'none', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
        {saving ? 'Saving…' : 'Confirm'}
      </button>
      <button onClick={onBack} style={backStyle}>← Back</button>
    </div>
  );
}

const LEAD_SOURCE_CHIPS = [
  { id: 'door_knock', label: 'Door knock' },
  { id: 'referral', label: 'Referral' },
  { id: 'website', label: 'Website' },
  { id: 'sign', label: 'Sign' },
  { id: 'phone_in', label: 'Phone-in' },
];

function formatPhone(digits) {
  if (!digits) return digits;
  const d = String(digits).replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return digits;
}

function LeadFlow({ profile, initContext, initLabel, pendingTaskId, onComplete, onBack }) {
  const [customerName, setCustomerName] = useState(null);
  const [customerNameInput, setCustomerNameInput] = useState('');
  const [phone, setPhone] = useState(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [address, setAddress] = useState(null);
  const [addressInput, setAddressInput] = useState('');
  const [source, setSource] = useState(null);
  const [notes, setNotes] = useState('');
  const [editingField, setEditingField] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const parsed = parseLeadLabel(initLabel || '');
    if (parsed.customer_name) { setCustomerName(parsed.customer_name); setCustomerNameInput(parsed.customer_name); }
    if (parsed.phone) { setPhone(parsed.phone); setPhoneInput(formatPhone(parsed.phone)); }
    if (parsed.address) { setAddress(parsed.address); setAddressInput(parsed.address); }
    if (parsed.source) setSource(parsed.source);
    setLoaded(true);
  }, []);

  const labelStyle = { fontSize: 13, fontWeight: 600, color: 'rgba(247,245,240,0.85)', marginBottom: 4, fontFamily: 'DM Sans, sans-serif' };
  const containerStyle = { display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'DM Sans, sans-serif' };
  const inputStyle = { border: '1px solid rgba(201,168,76,0.3)', borderRadius: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.07)', color: '#F7F5F0', fontFamily: 'DM Sans, sans-serif', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' };
  const backStyle = { background: 'none', border: 'none', color: 'rgba(247,245,240,0.4)', fontSize: 12, cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'DM Sans, sans-serif' };

  const firstMissing = () => {
    if (!customerName) return 'customer_name';
    if (!phone) return 'phone';
    if (!address) return 'address';
    if (!source) return 'source';
    return 'confirm';
  };
  const step = editingField || firstMissing();

  const submitName = () => {
    const v = (customerNameInput || '').trim();
    if (!v) return;
    setCustomerName(v);
    setEditingField(null);
  };
  const submitPhone = () => {
    const v = (phoneInput || '').trim();
    if (!v) return;
    setPhone(v);
    setEditingField(null);
  };
  const submitAddress = () => {
    const v = (addressInput || '').trim();
    if (!v) return;
    setAddress(v);
    setEditingField(null);
  };

  const sourceLabel = (id) => {
    if (!id) return null;
    const m = LEAD_SOURCE_CHIPS.find(c => c.id === id);
    return m ? m.label : id;
  };

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

  if (!loaded) return <div style={containerStyle}><div style={{ fontSize: 12, color: 'rgba(247,245,240,0.5)' }}>Loading…</div></div>;

  if (step === 'customer_name') return (
    <div style={containerStyle}>
      <div style={labelStyle}>Customer name</div>
      <input type="text" value={customerNameInput} onChange={e => setCustomerNameInput(e.target.value)} placeholder="Full name" autoFocus
        onKeyDown={e => { if (e.key === 'Enter') submitName(); }}
        style={inputStyle} />
      <button onClick={submitName} disabled={!(customerNameInput || '').trim()} className="btn btn-navy" style={{ fontSize: 13 }}>Save</button>
      {editingField ? null : <button onClick={onBack} style={backStyle}>← Back</button>}
    </div>
  );

  if (step === 'phone') return (
    <div style={containerStyle}>
      <div style={labelStyle}>Phone number</div>
      <input type="tel" value={phoneInput} onChange={e => setPhoneInput(e.target.value)} placeholder="(816) 555-0100" autoFocus
        onKeyDown={e => { if (e.key === 'Enter') submitPhone(); }}
        style={inputStyle} />
      <button onClick={submitPhone} disabled={!(phoneInput || '').trim()} className="btn btn-navy" style={{ fontSize: 13 }}>Save</button>
      {editingField ? null : <button onClick={onBack} style={backStyle}>← Back</button>}
    </div>
  );

  if (step === 'address') return (
    <div style={containerStyle}>
      <div style={labelStyle}>Job address</div>
      <input type="text" value={addressInput} onChange={e => setAddressInput(e.target.value)} placeholder="123 Main St, Kansas City" autoFocus
        onKeyDown={e => { if (e.key === 'Enter') submitAddress(); }}
        style={inputStyle} />
      <button onClick={submitAddress} disabled={!(addressInput || '').trim()} className="btn btn-navy" style={{ fontSize: 13 }}>Save</button>
      {editingField ? null : <button onClick={onBack} style={backStyle}>← Back</button>}
    </div>
  );

  if (step === 'source') return (
    <div style={containerStyle}>
      <div style={labelStyle}>How did they find you?</div>
      <ChipPicker chips={LEAD_SOURCE_CHIPS} allowOther={true} otherLabel="Other" onSelect={c => { setSource(c.isOther ? c.otherText : c.id); setEditingField(null); }} />
      {editingField ? null : <button onClick={onBack} style={backStyle}>← Back</button>}
    </div>
  );

  if (step === 'notes') return (
    <div style={containerStyle}>
      <div style={labelStyle}>Notes (optional)</div>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Anything extra..."
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setEditingField(null); } }}
        style={{ ...inputStyle, resize: 'none' }} />
      <button onClick={() => setEditingField(null)} className="btn btn-navy" style={{ fontSize: 13 }}>Save</button>
    </div>
  );

  // confirm
  return (
    <div style={containerStyle}>
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 14, color: 'rgba(247,245,240,0.85)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontWeight: 600, color: '#C9A84C', marginBottom: 6, fontSize: 13 }}>Adding a lead: confirm details</div>
        <FieldRow label="Customer" value={customerName} onEdit={() => { setCustomerNameInput(customerName || ''); setEditingField('customer_name'); }} />
        <FieldRow label="Phone" value={formatPhone(phone)} onEdit={() => { setPhoneInput(formatPhone(phone) || ''); setEditingField('phone'); }} />
        <FieldRow label="Address" value={address} onEdit={() => { setAddressInput(address || ''); setEditingField('address'); }} />
        <FieldRow label="Source" value={sourceLabel(source)} onEdit={() => setEditingField('source')} />
        <FieldRow label="Notes" value={notes ? notes : null} onEdit={() => setEditingField('notes')} />
      </div>
      {error && <div style={{ color: '#FCA5A5', fontSize: 12 }}>{error}</div>}
      <button onClick={handleConfirm} disabled={saving}
        style={{ padding: '10px 12px', borderRadius: 8, background: '#C9A84C', color: '#0A1F44', border: 'none', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
        {saving ? 'Saving…' : 'Confirm'}
      </button>
      <button onClick={onBack} style={backStyle}>← Back</button>
    </div>
  );
}

function COFlow({ profile, initContext, initLabel, pendingTaskId, onComplete, onBack }) {
  const [jobId, setJobId] = useState(null);
  const [jobLabel, setJobLabel] = useState(null);
  const [title, setTitle] = useState(null);
  const [titleInput, setTitleInput] = useState('');
  const [description, setDescription] = useState(null);
  const [descriptionInput, setDescriptionInput] = useState('');
  const [amount, setAmount] = useState(null);
  const [amountInput, setAmountInput] = useState('');
  const [editingField, setEditingField] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const activeJobs = await loadActiveJobs();
      const parsed = parseCOLabel(initLabel || '');
      if (parsed.title) { setTitle(parsed.title); setTitleInput(parsed.title); }
      if (parsed.description) { setDescription(parsed.description); setDescriptionInput(parsed.description); }
      if (parsed.amount != null && parsed.amount > 0) { setAmount(parsed.amount); setAmountInput(String(parsed.amount)); }
      if (parsed.project_hint) {
        const matches = matchProjectHint(parsed.project_hint, activeJobs);
        if (matches.length === 1) { setJobId(matches[0].id); setJobLabel(matches[0].address); }
      }
      setLoaded(true);
    })();
  }, []);

  const labelStyle = { fontSize: 13, fontWeight: 600, color: 'rgba(247,245,240,0.85)', marginBottom: 4, fontFamily: 'DM Sans, sans-serif' };
  const containerStyle = { display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'DM Sans, sans-serif' };
  const inputStyle = { border: '1px solid rgba(201,168,76,0.3)', borderRadius: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.07)', color: '#F7F5F0', fontFamily: 'DM Sans, sans-serif', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' };
  const backStyle = { background: 'none', border: 'none', color: 'rgba(247,245,240,0.4)', fontSize: 12, cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'DM Sans, sans-serif' };

  const firstMissing = () => {
    if (!jobId) return 'project';
    if (!title || title.trim().length < 3) return 'title';
    if (!description || description.trim().length < 10) return 'description';
    if (amount == null || !(amount > 0)) return 'amount';
    return 'confirm';
  };
  const step = editingField || firstMissing();

  const submitTitle = () => {
    const v = (titleInput || '').trim();
    if (v.length < 3) return;
    setTitle(v);
    setEditingField(null);
  };
  const submitDescription = () => {
    const v = (descriptionInput || '').trim();
    if (v.length < 10) return;
    setDescription(v);
    setEditingField(null);
  };
  const submitAmount = () => {
    const n = parseFloat((amountInput || '').replace(/[^0-9.]/g, ''));
    if (!(n > 0)) return;
    setAmount(n);
    setEditingField(null);
  };

  const handleConfirm = async () => {
    setSaving(true);
    setError('');
    const result = await sbCreateChangeOrder({
      jobId,
      description: `${title}: ${description}`,
      amount,
      jobAddress: jobLabel,
      excludeUserId: profile?.id,
    });
    if (!result.ok) { setError(result.error || 'Failed to submit CO'); setSaving(false); return; }
    if (pendingTaskId) await sbCompletePendingTask(pendingTaskId, { resultingEntityType: 'change_order', resultingEntityId: result.data?.id });
    setSaving(false);
    onComplete('Change order submitted ✓');
  };

  if (!loaded) return <div style={containerStyle}><div style={{ fontSize: 12, color: 'rgba(247,245,240,0.5)' }}>Loading…</div></div>;

  if (step === 'project') return (
    <div style={containerStyle}>
      <div style={labelStyle}>Which project?</div>
      <JobChipPicker onSelect={s => { setJobId(s.jobId); setJobLabel(s.jobLabel); setEditingField(null); }} />
      {editingField ? null : <button onClick={onBack} style={backStyle}>← Back</button>}
    </div>
  );

  if (step === 'title') return (
    <div style={containerStyle}>
      <div style={labelStyle}>CO title (min 3 chars)</div>
      <input type="text" value={titleInput} onChange={e => setTitleInput(e.target.value)} placeholder="e.g. Added recessed lighting" autoFocus
        onKeyDown={e => { if (e.key === 'Enter') submitTitle(); }}
        style={inputStyle} />
      <button onClick={submitTitle} disabled={(titleInput || '').trim().length < 3} className="btn btn-navy" style={{ fontSize: 13 }}>Save</button>
      {editingField ? null : <button onClick={onBack} style={backStyle}>← Back</button>}
    </div>
  );

  if (step === 'description') return (
    <div style={containerStyle}>
      <div style={labelStyle}>Description (min 10 chars)</div>
      <textarea value={descriptionInput} onChange={e => setDescriptionInput(e.target.value)} rows={4} placeholder="Describe the scope change in detail..."
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitDescription(); } }}
        style={{ ...inputStyle, resize: 'none' }} />
      <button onClick={submitDescription} disabled={(descriptionInput || '').trim().length < 10} className="btn btn-navy" style={{ fontSize: 13 }}>Save</button>
      {editingField ? null : <button onClick={onBack} style={backStyle}>← Back</button>}
    </div>
  );

  if (step === 'amount') return (
    <div style={containerStyle}>
      <div style={labelStyle}>Amount</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: 'rgba(247,245,240,0.7)', fontSize: 18 }}>$</span>
        <input type="text" inputMode="decimal" value={amountInput} onChange={e => setAmountInput(e.target.value)} placeholder="0.00" autoFocus
          onKeyDown={e => { if (e.key === 'Enter') submitAmount(); }}
          style={{ ...inputStyle, flex: 1, width: 'auto' }} />
      </div>
      <button onClick={submitAmount} disabled={!(parseFloat((amountInput || '').replace(/[^0-9.]/g, '')) > 0)} className="btn btn-navy" style={{ fontSize: 13 }}>Save</button>
      {editingField ? null : <button onClick={onBack} style={backStyle}>← Back</button>}
    </div>
  );

  // confirm
  const amountWords = amount != null ? amountToWords(amount) : '';
  const amountDisplay = amount != null
    ? `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${amountWords ? ` — ${amountWords}` : ''}`
    : null;
  return (
    <div style={containerStyle}>
      <div style={{
        background: 'rgba(245,158,11,0.1)',
        border: '1px solid rgba(245,158,11,0.4)',
        borderRadius: 8,
        padding: '10px 14px',
        fontFamily: 'DM Sans, sans-serif',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 1,
        color: '#f59e0b',
        textTransform: 'uppercase',
      }}>
        ⚠ Money action — confirm before submitting
      </div>
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 14, color: 'rgba(247,245,240,0.85)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontWeight: 600, color: '#C9A84C', marginBottom: 6, fontSize: 13 }}>Adding a change order: confirm details</div>
        <FieldRow label="Project" value={jobLabel} onEdit={() => setEditingField('project')} />
        <FieldRow label="Title" value={title} onEdit={() => { setTitleInput(title || ''); setEditingField('title'); }} />
        <FieldRow label="Description" value={description} onEdit={() => { setDescriptionInput(description || ''); setEditingField('description'); }} />
        <FieldRow label="Amount" value={amountDisplay} onEdit={() => { setAmountInput(amount != null ? String(amount) : ''); setEditingField('amount'); }} />
      </div>
      {error && <div style={{ color: '#FCA5A5', fontSize: 12 }}>{error}</div>}
      <button onClick={handleConfirm} disabled={saving}
        style={{ padding: '10px 12px', borderRadius: 8, background: '#C9A84C', color: '#0A1F44', border: 'none', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
        {saving ? 'Submitting…' : 'Confirm'}
      </button>
      <button onClick={onBack} style={backStyle}>← Back</button>
    </div>
  );
}

function BugFlow({ profile, initContext, initLabel, pendingTaskId, onComplete, onBack }) {
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const containerStyle = { display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'DM Sans, sans-serif' };
  const inputStyle = { border: '1px solid rgba(201,168,76,0.3)', borderRadius: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.07)', color: '#F7F5F0', fontFamily: 'DM Sans, sans-serif', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box', resize: 'none' };

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      const { data: { session } } = await sb.auth.getSession();
      const jwt = session?.access_token;
      const ctx = initContext || {};
      const res = await fetch(SUBMIT_BUG_REPORT_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description,
          route: ctx.route || 'master-agent',
          app_version: ctx.version || '1.0.0',
          device_info: `${ctx.device || ''} ${ctx.os || ''}`.trim(),
          breadcrumbs: ctx.breadcrumbs || [],
          console_errors: ctx.consoleErrors || [],
          network_errors: ctx.networkErrors || [],
          screenshot_dataurl: ctx.screenshot_dataurl || null,
          pending_task_id: pendingTaskId || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error || 'Submission failed'); setSaving(false); return; }
      onComplete('Bug submitted ✓');
    } catch (e) {
      setError(e.message || 'Submission failed');
      setSaving(false);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(247,245,240,0.85)' }}>
        What were you trying to do, and what happened?
      </div>
      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        rows={5}
        placeholder="Min 10 characters..."
        style={inputStyle}
        autoFocus
      />
      {error && <div style={{ color: '#FCA5A5', fontSize: 12 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleSubmit}
          disabled={saving || description.trim().length < 10}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, background: description.trim().length >= 10 ? '#C9A84C' : 'rgba(201,168,76,0.3)', color: '#0A1F44', border: 'none', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 700, cursor: description.trim().length >= 10 ? 'pointer' : 'default' }}
        >
          {saving ? 'Submitting…' : 'Submit bug'}
        </button>
      </div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'rgba(247,245,240,0.4)', fontSize: 12, cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'DM Sans, sans-serif' }}>← Back</button>
    </div>
  );
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
                // Resume goes straight into the verb chip flow — quick capture already happened
                // when this task was first created. Without this, Resume re-shows QuickCapture
                // and a second pending_tasks row gets created on Continue Now.
                setFlowActive(true);
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
                          // Capture screenshot at tap time — screen changes during flow
                          import('html2canvas').then(({ default: html2canvas }) => {
                            html2canvas(document.body, { scale: 0.5, useCORS: true, logging: false }).then(canvas => {
                              const screenshot_dataurl = canvas.toDataURL('image/png');
                              setCaptureContext({ ...snap, screenshot_dataurl });
                            }).catch(() => {
                              setCaptureContext({ ...snap });
                            });
                          }).catch(() => {
                            setCaptureContext({ ...snap });
                          });
                          setCaptureContext({ ...snap }); // set immediately, screenshot fills in async
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
                  initLabel={captureLabel}
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
              {verb && flowActive && verb === 'change_order' && (
                <COFlow
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
              {verb && flowActive && verb === 'bug' && (
                <BugFlow
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
