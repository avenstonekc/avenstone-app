import { useState, useEffect } from 'react';
import { sb, AV_TENANT, AV_USER_ID, ANON_KEY, sbLoadActiveSubs } from '../../lib/supabase';
import { Ic, isMob } from '../../lib/utils';

const FN = 'https://cbfftukmhqvvjlrlnltk.supabase.co/functions/v1';
const hdr = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` });
const TRIGGERS = {
  manual:           'Manual',
  manual_sub:       'Manual — sub-contractor',
  new_contact:      'New Contact',
  missed_call:      'Missed Call',
  bid_sent:         'Bid sent (auto)',
  sub_invited:      'Sub invited (auto)',
  payment_made:     'Sub paid (auto)',
  sub_inactive_60d: 'Sub inactive 60+ days (auto)',
};
const STATUS_C = { draft: '#9CA3AF', active: '#22c55e', paused: '#f59e0b' };

function StatusBadge({ status, label }) {
  const color = STATUS_C[status] || '#9CA3AF';
  const text = label || (status ? status.charAt(0).toUpperCase() + status.slice(1) : '');
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 20,
      background: color + '18', color, fontSize: 11, fontWeight: 600
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {text}
    </span>
  );
}

function EnrollStatusBadge({ status }) {
  const map = { active: '#22c55e', complete: '#9CA3AF', stopped: '#EF4444' };
  const color = map[status] || '#9CA3AF';
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : '';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 20,
      background: color + '18', color, fontSize: 11, fontWeight: 600
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function dayLabel(day) {
  if (day === 0) return 'Day 0 · Immediate';
  return `Day ${day} · Follow-up`;
}

export default function SequencesScr({ profile }) {
  const [sequences, setSequences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [subs, setSubs] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '', description: '', trigger: 'manual', goal: '', context: '', steps_count: 3
  });
  const [generatedSteps, setGeneratedSteps] = useState(null);
  const [genError, setGenError] = useState('');
  const [editingSteps, setEditingSteps] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);
  const [enrollType, setEnrollType] = useState('contact');
  const [enrollContactId, setEnrollContactId] = useState('');
  const [enrollSubId, setEnrollSubId] = useState('');
  const [enrolling, setEnrolling] = useState(false);

  async function loadSequences() {
    setLoading(true);
    const { data, error } = await sb
      .from('sequences')
      .select('*')
      .eq('tenant_id', AV_TENANT)
      .order('created_at', { ascending: false });
    if (!error) setSequences(data || []);
    setLoading(false);
  }

  async function loadEnrollments(seqId) {
    const { data, error } = await sb
      .from('sequence_enrollments')
      .select('*, contact:contacts(first_name, last_name, phone, email), sub:profiles!sub_id(full_name, phone)')
      .eq('sequence_id', seqId)
      .order('enrolled_at', { ascending: false });
    if (!error) setEnrollments(data || []);
  }

  async function loadContacts() {
    const { data, error } = await sb
      .from('contacts')
      .select('id, first_name, last_name, phone, email')
      .eq('tenant_id', AV_TENANT)
      .order('first_name');
    if (!error) setContacts(data || []);
  }

  async function loadSubs() {
    const data = await sbLoadActiveSubs();
    setSubs(data);
  }

  useEffect(() => { loadSequences(); }, []);

  useEffect(() => {
    if (selected) {
      loadEnrollments(selected.id);
      loadContacts();
      loadSubs();
    }
  }, [selected]);

  async function generateSequence() {
    setCreating(true);
    setGenError('');
    try {
      const res = await fetch(`${FN}/ai-generate-sequence`, {
        method: 'POST',
        headers: hdr(),
        body: JSON.stringify({
          goal: createForm.goal,
          context: createForm.context,
          steps_count: createForm.steps_count,
          trigger: createForm.trigger
        })
      });
      const json = await res.json();
      if (json.steps && json.steps.length) {
        setGeneratedSteps(json.steps);
      } else {
        setGenError(json.error || 'AI did not return steps — try rephrasing your goal.');
      }
    } catch (e) {
      setGenError('Network error: ' + e.message);
    }
    setCreating(false);
  }

  async function saveSequence() {
    setSaving(true);
    const { error } = await sb.from('sequences').insert({
      name: createForm.name,
      description: createForm.description,
      trigger: createForm.trigger,
      status: 'draft',
      steps: generatedSteps,
      tenant_id: AV_TENANT,
      created_by: AV_USER_ID,
      created_at: new Date().toISOString()
    });
    if (!error) {
      await loadSequences();
      setShowCreate(false);
      setCreateForm({ name: '', description: '', trigger: 'manual', goal: '', context: '', steps_count: 3 });
      setGeneratedSteps(null);
    }
    setSaving(false);
  }

  async function activateSequence(id) {
    await sb.from('sequences').update({ status: 'active' }).eq('id', id);
    await loadSequences();
    if (selected?.id === id) setSelected(s => s ? { ...s, status: 'active' } : s);
  }

  async function pauseSequence(id) {
    await sb.from('sequences').update({ status: 'paused' }).eq('id', id);
    await loadSequences();
    if (selected?.id === id) setSelected(s => s ? { ...s, status: 'paused' } : s);
  }

  async function enrollContact() {
    const recipientId = enrollType === 'sub' ? enrollSubId : enrollContactId;
    if (!recipientId) return;
    setEnrolling(true);
    const steps = selected?.steps || [];
    let nextSendAt;
    if (steps[0]?.day === 0) {
      nextSendAt = new Date().toISOString();
    } else {
      const d = new Date();
      d.setDate(d.getDate() + (steps[0]?.day || 0));
      nextSendAt = d.toISOString();
    }
    const row = {
      tenant_id: AV_TENANT,
      sequence_id: selected.id,
      status: 'active',
      current_step: 0,
      next_send_at: nextSendAt,
      enrolled_at: new Date().toISOString()
    };
    if (enrollType === 'sub') {
      row.sub_id = enrollSubId;
    } else {
      row.contact_id = enrollContactId;
    }
    await sb.from('sequence_enrollments').insert(row);
    await loadEnrollments(selected.id);
    setShowEnroll(false);
    setEnrollContactId('');
    setEnrollSubId('');
    setEnrolling(false);
  }

  async function stopEnrollment(enrollId) {
    await sb.from('sequence_enrollments').update({ status: 'stopped' }).eq('id', enrollId);
    await loadEnrollments(selected.id);
  }

  function closeCreate() {
    setShowCreate(false);
    setGeneratedSteps(null);
    setCreateForm({ name: '', description: '', trigger: 'manual', goal: '', context: '', steps_count: 3 });
  }

  const mobile = isMob();

  return (
    <div style={{ display: 'flex', height: '100%', fontFamily: "'DM Sans', sans-serif", background: '#F7F5F0' }}>
      {/* LEFT PANEL */}
      <div style={{
        width: 320, flexShrink: 0,
        background: '#fff',
        borderRight: '1px solid #E8E4DC',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Left Header */}
        <div style={{
          padding: '16px 16px 12px',
          borderBottom: '1px solid #E8E4DC',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: '#0A1F44', fontWeight: 400 }}>
            Sequences
          </span>
          <button
            className="btn btn-gold"
            style={{ fontSize: 12, padding: '5px 12px' }}
            onClick={() => setShowCreate(true)}
          >
            + Create
          </button>
        </div>

        {/* Sequence List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Loading...</div>
          ) : sequences.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
              No sequences yet
            </div>
          ) : (
            sequences.map(seq => {
              const isSelected = selected?.id === seq.id;
              const stepCount = Array.isArray(seq.steps) ? seq.steps.length : 0;
              return (
                <div
                  key={seq.id}
                  onClick={() => setSelected(seq)}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #E8E4DC',
                    cursor: 'pointer',
                    background: isSelected ? '#FBF8F2' : '#fff',
                    borderLeft: isSelected ? '3px solid #C9A84C' : '3px solid transparent',
                    transition: 'background 0.15s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: '#0A1F44', fontSize: 14 }}>{seq.name}</span>
                    <StatusBadge status={seq.status} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 11, color: '#6B7280',
                      background: '#F3F4F6', borderRadius: 4, padding: '2px 6px'
                    }}>
                      {TRIGGERS[seq.trigger] || seq.trigger}
                    </span>
                    <span style={{ fontSize: 11, color: '#9CA3AF' }}>{stepCount} step{stepCount !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#F7F5F0' }}>
        {!selected ? (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            color: '#9CA3AF', gap: 8
          }}>
            <div style={{ fontSize: 36 }}>📬</div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>Select a sequence or create one</div>
          </div>
        ) : (
          <>
            {/* Right Header */}
            <div style={{
              background: '#fff', borderBottom: '1px solid #E8E4DC',
              padding: '16px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: '#0A1F44', fontWeight: 400 }}>
                  {selected.name}
                </span>
                <StatusBadge status={selected.status} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {selected.status !== 'active' ? (
                  <button
                    className="btn btn-gold"
                    style={{ fontSize: 13, padding: '6px 14px' }}
                    onClick={() => activateSequence(selected.id)}
                  >
                    Activate
                  </button>
                ) : (
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 13, padding: '6px 14px' }}
                    onClick={() => pauseSequence(selected.id)}
                  >
                    Pause
                  </button>
                )}
                <button
                  className="btn btn-navy"
                  style={{ fontSize: 13, padding: '6px 14px' }}
                  onClick={() => { setShowEnroll(true); setEnrollContactId(''); setEnrollSubId(''); setEnrollType('contact'); }}
                >
                  + Enroll
                </button>
              </div>
            </div>

            {/* Right Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Sequence Info Card */}
              <div className="card" style={{ padding: 16 }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  gap: 12, marginBottom: 16
                }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Trigger</div>
                    <div style={{ fontSize: 14, color: '#0A1F44', fontWeight: 500 }}>{TRIGGERS[selected.trigger] || selected.trigger}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Status</div>
                    <StatusBadge status={selected.status} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Steps</div>
                    <div style={{ fontSize: 14, color: '#0A1F44', fontWeight: 500 }}>
                      {Array.isArray(selected.steps) ? selected.steps.length : 0} step{Array.isArray(selected.steps) && selected.steps.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  {selected.description && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Description</div>
                      <div style={{ fontSize: 14, color: '#374151' }}>{selected.description}</div>
                    </div>
                  )}
                </div>

                {/* Steps List */}
                {Array.isArray(selected.steps) && selected.steps.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44', marginBottom: 2 }}>Steps</div>
                    {selected.steps.map((step, idx) => (
                      <div key={idx} style={{
                        background: '#F7F5F0', border: '1px solid #E8E4DC',
                        padding: 12, borderRadius: 8
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#C9A84C', marginBottom: 6 }}>
                          {idx + 1}. {step.day !== undefined ? dayLabel(step.day) : `Step ${idx + 1}`}
                        </div>
                        <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
                          {step.message || step.body || step.content || JSON.stringify(step)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Enrollments Card */}
              <div className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600, color: '#0A1F44', fontSize: 15 }}>Enrolled</span>
                    <span style={{
                      background: '#0A1F4414', color: '#0A1F44', borderRadius: 20,
                      padding: '2px 8px', fontSize: 12, fontWeight: 600
                    }}>
                      {enrollments.length}
                    </span>
                  </div>
                </div>

                {enrollments.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 14, padding: '16px 0' }}>
                    No one enrolled yet
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {enrollments.map(enr => {
                      const isSubRow = !!enr.sub_id;
                      const c = enr.contact || {};
                      const s = enr.sub || {};
                      const name = isSubRow
                        ? (s.full_name || 'Unknown Sub')
                        : ([c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown');
                      const phone = isSubRow ? s.phone : c.phone;
                      const totalSteps = Array.isArray(selected.steps) ? selected.steps.length : 0;
                      const isStopped = enr.status === 'stopped';
                      const isComplete = enr.status === 'complete';
                      return (
                        <div key={enr.id} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 12px', background: '#F7F5F0', borderRadius: 8,
                          border: '1px solid #E8E4DC', flexWrap: 'wrap', gap: 8
                        }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontWeight: 600, fontSize: 14, color: '#0A1F44' }}>{name}</span>
                              {isSubRow && (
                                <span style={{ fontSize: 10, fontWeight: 600, color: '#C9A84C', background: '#C9A84C18', padding: '1px 6px', borderRadius: 10 }}>SUB</span>
                              )}
                            </div>
                            {phone && <div style={{ fontSize: 12, color: '#6B7280' }}>{phone}</div>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <EnrollStatusBadge status={enr.status} />
                            <span style={{ fontSize: 12, color: '#6B7280' }}>
                              Step {(enr.current_step || 0) + 1} of {totalSteps}
                            </span>
                            <span style={{ fontSize: 12, color: '#6B7280' }}>
                              {isStopped ? 'Stopped' : isComplete ? 'Complete' : enr.next_send_at ? formatDate(enr.next_send_at) : '—'}
                            </span>
                            {enr.status === 'active' && (
                              <button
                                className="btn btn-ghost"
                                style={{ padding: '4px 8px', fontSize: 12 }}
                                onClick={() => stopEnrollment(enr.id)}
                                title="Stop enrollment"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {selected.status === 'active' && (
                  <button
                    className="btn btn-ghost"
                    style={{ marginTop: 12, fontSize: 13 }}
                    onClick={() => { setShowEnroll(true); setEnrollContactId(''); setEnrollSubId(''); setEnrollType('contact'); }}
                  >
                    + Enroll
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* CREATE MODAL */}
      {showCreate && (
        <div className="overlay" onClick={closeCreate}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, width: '100%' }}>
            <div className="modal-title" style={{ marginBottom: 16 }}>New Sequence</div>

            {!generatedSteps ? (
              /* PHASE 1 */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                    Name <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    className="finp"
                    placeholder="e.g. New Lead Follow-up"
                    value={createForm.name}
                    onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Trigger</label>
                  <select
                    className="finp"
                    value={createForm.trigger}
                    onChange={e => setCreateForm(f => ({ ...f, trigger: e.target.value }))}
                    style={{ width: '100%' }}
                  >
                    {Object.entries(TRIGGERS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Number of Steps</label>
                  <select
                    className="finp"
                    value={createForm.steps_count}
                    onChange={e => setCreateForm(f => ({ ...f, steps_count: Number(e.target.value) }))}
                    style={{ width: '100%' }}
                  >
                    {[2, 3, 4, 5].map(n => (
                      <option key={n} value={n}>{n} steps</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                    Goal <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <textarea
                    className="finp"
                    rows={3}
                    placeholder="e.g. Follow up with a new lead who requested a kitchen remodel quote"
                    value={createForm.goal}
                    onChange={e => setCreateForm(f => ({ ...f, goal: e.target.value }))}
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                    Context <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(optional)</span>
                  </label>
                  <textarea
                    className="finp"
                    rows={2}
                    placeholder="e.g. Budget around $50k, wants to start in spring"
                    value={createForm.context}
                    onChange={e => setCreateForm(f => ({ ...f, context: e.target.value }))}
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </div>

                {genError && (
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 14px', borderRadius: 6, fontSize: 13 }}>
                    {genError}
                  </div>
                )}
                {(!createForm.name || !createForm.goal) && (
                  <div style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'right' }}>
                    Fill in Name and Goal to generate
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                  <button className="btn btn-ghost" onClick={closeCreate}>Cancel</button>
                  <button
                    className="btn btn-gold"
                    onClick={generateSequence}
                    disabled={creating || !createForm.name || !createForm.goal}
                    style={{ opacity: (creating || !createForm.name || !createForm.goal) ? 0.5 : 1 }}
                  >
                    {creating ? 'Generating...' : 'Generate with AI ✨'}
                  </button>
                </div>
              </div>
            ) : (
              /* PHASE 2 */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#C9A84C' }}>
                  AI Generated — Review your sequence
                </div>

                {generatedSteps.map((step, idx) => {
                  const msg = step.message || step.body || step.content || '';
                  const charCount = msg.length;
                  return (
                    <div key={idx} style={{
                      background: '#F7F5F0', border: '1px solid #E8E4DC',
                      padding: 12, borderRadius: 8
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#C9A84C', marginBottom: 6 }}>
                        {step.day !== undefined ? dayLabel(step.day) : `Step ${idx + 1}`}
                      </div>
                      <textarea
                        className="finp"
                        rows={3}
                        value={msg}
                        onChange={e => {
                          const newVal = e.target.value;
                          setGeneratedSteps(prev => prev.map((s, i) => {
                            if (i !== idx) return s;
                            if ('message' in s) return { ...s, message: newVal };
                            if ('body' in s) return { ...s, body: newVal };
                            return { ...s, content: newVal };
                          }));
                        }}
                        style={{ width: '100%', resize: 'vertical' }}
                      />
                      <div style={{ fontSize: 11, color: charCount > 320 ? '#EF4444' : '#9CA3AF', marginTop: 4, textAlign: 'right' }}>
                        {charCount} / 320
                      </div>
                    </div>
                  );
                })}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                  <button
                    className="btn btn-ghost"
                    onClick={() => setGeneratedSteps(null)}
                  >
                    ← Regenerate
                  </button>
                  <button
                    className="btn btn-navy"
                    onClick={saveSequence}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save Sequence'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ENROLL MODAL */}
      {showEnroll && (
        <div className="overlay" onClick={() => setShowEnroll(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 360, width: '100%' }}>
            <div className="modal-title" style={{ marginBottom: 16 }}>Enroll in Sequence</div>

            {/* Recipient type toggle */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 16, border: '1px solid #E8E4DC', borderRadius: 8, overflow: 'hidden' }}>
              {['contact', 'sub'].map(t => (
                <button
                  key={t}
                  onClick={() => setEnrollType(t)}
                  style={{
                    flex: 1, padding: '8px 0', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                    background: enrollType === t ? '#0A1F44' : '#fff',
                    color: enrollType === t ? '#fff' : '#6B7280',
                    transition: 'background 0.15s'
                  }}
                >
                  {t === 'contact' ? 'Contact' : 'Sub-contractor'}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: 16 }}>
              {enrollType === 'contact' ? (
                <>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                    Select Contact
                  </label>
                  <select
                    className="finp"
                    value={enrollContactId}
                    onChange={e => setEnrollContactId(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    <option value="">— Choose a contact —</option>
                    {contacts.map(c => (
                      <option key={c.id} value={c.id}>
                        {[c.first_name, c.last_name].filter(Boolean).join(' ')}{c.phone ? ` — ${c.phone}` : ''}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                    Select Sub-contractor
                  </label>
                  <select
                    className="finp"
                    value={enrollSubId}
                    onChange={e => setEnrollSubId(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    <option value="">— Choose a sub —</option>
                    {subs.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.full_name}{s.phone ? ` — ${s.phone}` : ' — no phone'}
                      </option>
                    ))}
                  </select>
                  {enrollSubId && !subs.find(s => s.id === enrollSubId)?.phone && (
                    <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 6 }}>
                      This sub has no phone number — SMS steps will be skipped.
                    </div>
                  )}
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowEnroll(false)}>Cancel</button>
              <button
                className="btn btn-navy"
                onClick={enrollContact}
                disabled={enrolling || (enrollType === 'contact' ? !enrollContactId : !enrollSubId)}
              >
                {enrolling ? 'Enrolling...' : 'Enroll'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
