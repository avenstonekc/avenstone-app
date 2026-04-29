import { useState, useEffect, useRef } from 'react';
import { sbSaveSubPricing, sbUploadDoc, sbLoadTradeTaxonomy } from '../../lib/supabase';

const UNIT_OPTIONS = [
  { label: 'per sq ft', value: 'sf' },
  { label: 'per linear ft', value: 'lf' },
  { label: 'per hour', value: 'hour' },
  { label: 'per item', value: 'each' },
];

const STORAGE_KEY = 'av_sub_onboard_progress';

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveProgress(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

function clearProgress() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export default function SubOnboardingWizard({ profile, onComplete }) {
  const saved = loadProgress();

  const [taxonomy, setTaxonomy] = useState([]);
  const [step, setStep] = useState(saved?.step || 1);
  const [selectedTrades, setSelectedTrades] = useState(saved?.selectedTrades || []);
  const [tradeIndex, setTradeIndex] = useState(saved?.tradeIndex || 0);
  const [tradeMode, setTradeMode] = useState(null);
  const [rateForm, setRateForm] = useState({ unit: '', rate: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [tradeError, setTradeError] = useState(null);

  // Other trade input
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [otherTradeText, setOtherTradeText] = useState('');
  const otherInputRef = useRef(null);

  // Docs step
  const [w9File, setW9File] = useState(null);
  const [insFile, setInsFile] = useState(null);
  const [w9Status, setW9Status] = useState(null); // null | 'uploading' | 'done' | 'error'
  const [insStatus, setInsStatus] = useState(null);

  // Persist progress
  useEffect(() => {
    saveProgress({ step, selectedTrades, tradeIndex });
  }, [step, selectedTrades, tradeIndex]);

  useEffect(() => { sbLoadTradeTaxonomy().then(setTaxonomy); }, []);

  // Focus other input when shown
  useEffect(() => {
    if (showOtherInput) {
      setTimeout(() => otherInputRef.current?.focus(), 50);
    }
  }, [showOtherInput]);

  const currentTrade = selectedTrades[tradeIndex];
  const totalTrades = selectedTrades.length;

  // Build flat set of canonical trade strings for "custom" detection
  const canonicalStrings = new Set(taxonomy.flatMap(g =>
    g.subTrades.length ? g.subTrades.map(s => `${g.parent} - ${s.sub_trade}`) : [g.parent]
  ));

  // Look up default_unit for the current trade string
  function defaultUnitFor(tradeStr) {
    for (const g of taxonomy) {
      if (g.subTrades.length) {
        for (const s of g.subTrades) {
          if (`${g.parent} - ${s.sub_trade}` === tradeStr) return s.default_unit || '';
        }
      } else if (g.parent === tradeStr) {
        return '';
      }
    }
    return '';
  }

  // ── Step navigation ────────────────────────────────────────────────────────

  function goBack() {
    if (step === 1) return;
    if (step === 3 && tradeIndex > 0) {
      setTradeIndex(t => t - 1);
      setTradeMode(null);
      setRateForm({ unit: '', rate: '', notes: '' });
      setTradeError(null);
      return;
    }
    setStep(s => s - 1);
    if (step === 3) {
      setTradeIndex(0);
      setTradeMode(null);
      setRateForm({ unit: '', rate: '', notes: '' });
      setTradeError(null);
    }
  }

  // ── Trade chip toggle ───────────────────────────────────────────────────────

  function toggleTrade(trade) {
    setSelectedTrades(prev =>
      prev.includes(trade) ? prev.filter(t => t !== trade) : [...prev, trade]
    );
  }

  function commitOtherTrade() {
    const val = otherTradeText.trim();
    if (val && !selectedTrades.includes(val)) {
      setSelectedTrades(prev => [...prev, val]);
    }
    setOtherTradeText('');
    setShowOtherInput(false);
  }

  // ── Pricing step helpers ───────────────────────────────────────────────────

  function advanceTrade() {
    const next = tradeIndex + 1;
    if (next >= totalTrades) {
      setStep(4);
    } else {
      setTradeIndex(next);
      setTradeMode(null);
      setRateForm({ unit: '', rate: '', notes: '' });
      setTradeError(null);
    }
  }

  async function handleSelfBid() {
    setSaving(true);
    setTradeError(null);
    try {
      await sbSaveSubPricing({
        subId: profile.id,
        tenantId: profile.tenant_id,
        trade: currentTrade,
        pricingMode: 'self_bid',
        unit: null,
        rate: null,
        notes: null,
      });
      advanceTrade();
    } catch (err) {
      setTradeError(err?.message || 'Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveRate() {
    setSaving(true);
    setTradeError(null);
    try {
      await sbSaveSubPricing({
        subId: profile.id,
        tenantId: profile.tenant_id,
        trade: currentTrade,
        pricingMode: 'rate',
        unit: rateForm.unit,
        rate: parseFloat(rateForm.rate),
        notes: rateForm.notes || null,
      });
      advanceTrade();
    } catch (err) {
      setTradeError(err?.message || 'Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  // ── Document upload ────────────────────────────────────────────────────────

  async function handleUpload(file, docType, setStatus) {
    if (!file) return;
    setStatus('uploading');
    try {
      await sbUploadDoc({
        subId: profile.id,
        tenantId: profile.tenant_id,
        file,
        docType,
      });
      setStatus('done');
    } catch {
      setStatus('error');
    }
  }

  // ── Shared styles ──────────────────────────────────────────────────────────

  const card = {
    background: '#FFFFFF',
    borderRadius: 12,
    padding: 32,
    border: '1px solid #E8E4DC',
  };

  const heading = {
    fontFamily: 'DM Serif Display, serif',
    fontSize: 26,
    color: '#0A1F44',
    margin: '0 0 12px 0',
    lineHeight: 1.2,
  };

  const body = {
    fontFamily: 'DM Sans, sans-serif',
    fontSize: 15,
    color: '#374151',
    lineHeight: 1.6,
    margin: '0 0 24px 0',
  };

  const progressLabel = {
    fontFamily: 'DM Sans, sans-serif',
    fontSize: 12,
    color: '#9B8E7A',
    margin: '0 0 16px 0',
  };

  const backLink = {
    fontFamily: 'DM Sans, sans-serif',
    fontSize: 14,
    color: '#9B8E7A',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    marginBottom: 20,
    display: 'inline-block',
    textDecoration: 'none',
  };

  const btnGold = {
    width: '100%',
    padding: '16px',
    fontSize: 16,
    fontFamily: 'DM Sans, sans-serif',
    fontWeight: 600,
    background: '#C9A84C',
    color: '#0A1F44',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  };

  const btnGhost = {
    width: '100%',
    padding: '16px',
    fontSize: 15,
    fontFamily: 'DM Sans, sans-serif',
    fontWeight: 600,
    background: '#FFFFFF',
    color: '#374151',
    border: '1px solid #E8E4DC',
    borderRadius: 8,
    cursor: 'pointer',
  };

  // ── Step 1 — Welcome ───────────────────────────────────────────────────────

  if (step === 1) {
    return (
      <div style={{ minHeight: '100dvh', background: '#F7F5F0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '24px 16px' }}>
        <div style={{ width: '100%', maxWidth: 480 }}>
          <div style={card}>
            <h1 style={heading}>Welcome to Avenstone</h1>
            <p style={body}>Let's get you set up to receive bid invitations. This takes about 2 minutes.</p>
            <button style={btnGold} onClick={() => setStep(2)}>
              Get Started →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2 — Pick trades ───────────────────────────────────────────────────

  if (step === 2) {
    return (
      <div style={{ minHeight: '100dvh', background: '#F7F5F0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '24px 16px' }}>
        <div style={{ width: '100%', maxWidth: 480 }}>
          <button style={backLink} onClick={goBack}>← Back</button>
          <p style={progressLabel}>Step 2 of 5</p>
          <div style={card}>
            <h1 style={{ ...heading, fontSize: 22 }}>What trades do you work in?</h1>
            <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: '#6B7280', margin: '0 0 20px 0' }}>Select all that apply</p>

            {/* Trade grid — grouped by parent */}
            <div style={{ marginBottom: 16 }}>
              {taxonomy.map(({ parent, subTrades }) => {
                const items = subTrades.length
                  ? subTrades.map(s => `${parent} - ${s.sub_trade}`)
                  : [parent];
                return (
                  <div key={parent} style={{ marginBottom: 12 }}>
                    {subTrades.length > 0 && (
                      <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 700, color: '#9B8E7A', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px 0' }}>{parent}</p>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {items.map(tradeStr => {
                        const selected = selectedTrades.includes(tradeStr);
                        return (
                          <button
                            key={tradeStr}
                            onClick={() => toggleTrade(tradeStr)}
                            style={{
                              padding: '10px 14px',
                              borderRadius: 8,
                              fontSize: 13,
                              fontWeight: 600,
                              fontFamily: 'DM Sans, sans-serif',
                              cursor: 'pointer',
                              border: `1px solid ${selected ? '#0A1F44' : '#E8E4DC'}`,
                              background: selected ? '#0A1F44' : '#FFFFFF',
                              color: selected ? '#FFFFFF' : '#374151',
                              textAlign: 'left',
                            }}
                          >
                            {subTrades.length ? tradeStr.split(' - ')[1] : tradeStr}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Custom added trades not in taxonomy */}
              {selectedTrades.filter(t => !canonicalStrings.has(t)).length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, fontWeight: 700, color: '#9B8E7A', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px 0' }}>Other</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {selectedTrades.filter(t => !canonicalStrings.has(t)).map(trade => (
                      <button
                        key={trade}
                        onClick={() => toggleTrade(trade)}
                        style={{
                          padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                          fontFamily: 'DM Sans, sans-serif', cursor: 'pointer',
                          border: '1px solid #0A1F44', background: '#0A1F44', color: '#FFFFFF', textAlign: 'left',
                        }}
                      >
                        {trade}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Other trade */}
            {showOtherInput ? (
              <input
                ref={otherInputRef}
                type="text"
                className="finp"
                placeholder="Other trade..."
                value={otherTradeText}
                onChange={e => setOtherTradeText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitOtherTrade();
                }}
                onBlur={commitOtherTrade}
                style={{ width: '100%', marginBottom: 16, boxSizing: 'border-box' }}
              />
            ) : (
              <button
                onClick={() => setShowOtherInput(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#C9A84C',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                  marginBottom: 24,
                  display: 'block',
                }}
              >
                ＋ Add other trade
              </button>
            )}

            <button
              style={{
                ...btnGold,
                opacity: selectedTrades.length === 0 ? 0.45 : 1,
                cursor: selectedTrades.length === 0 ? 'not-allowed' : 'pointer',
                marginTop: 8,
              }}
              disabled={selectedTrades.length === 0}
              onClick={() => { setTradeIndex(0); setTradeMode(null); setRateForm({ unit: '', rate: '', notes: '' }); setStep(3); }}
            >
              Continue →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 3 — Per-trade pricing ─────────────────────────────────────────────

  if (step === 3) {
    const rateValid = rateForm.unit && rateForm.rate && !isNaN(parseFloat(rateForm.rate));

    return (
      <div style={{ minHeight: '100dvh', background: '#F7F5F0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '24px 16px' }}>
        <div style={{ width: '100%', maxWidth: 480 }}>
          <button style={backLink} onClick={goBack}>← Back</button>
          <p style={progressLabel}>Step 3 of 5</p>
          <div style={card}>
            <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: '#9B8E7A', margin: '0 0 6px 0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Trade {tradeIndex + 1} of {totalTrades}
            </p>
            <h1 style={{ ...heading, fontSize: 24, marginBottom: 16 }}>{currentTrade}</h1>

            {/* Explanation block */}
            <div style={{ background: '#F7F5F0', border: '1px solid #E8E4DC', borderRadius: 8, padding: 16, marginBottom: 20 }}>
              <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0 }}>
                Give us your rate and we'll handle the rest. When a job comes up that needs your trade, we'll auto-build the bid for you using your rate and the actual takeoff measurements. You'll get the bid with photos, plans, and the option to request a site visit before approving. You can adjust the bid if needed — your rate is a starting point, not a contract.
              </p>
              <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#374151', lineHeight: 1.6, margin: '10px 0 0 0' }}>
                The more detail you give us upfront (different rates by complexity, exclusions, minimums), the closer your auto-generated bids will land to what you'd quote yourself.
              </p>
            </div>

            {/* Mode buttons */}
            {!tradeMode && (
              <>
                <button
                  style={{ ...btnGold, fontSize: 15, marginBottom: 12 }}
                  disabled={saving}
                  onClick={() => {
                    const defUnit = defaultUnitFor(currentTrade);
                    setRateForm(f => ({ ...f, unit: defUnit || f.unit }));
                    setTradeMode('rate');
                  }}
                >
                  Give me a rate
                </button>
                <button
                  style={{ ...btnGhost, fontSize: 15 }}
                  disabled={saving}
                  onClick={handleSelfBid}
                >
                  {saving ? 'Saving...' : "I'll bid each job myself"}
                </button>
              </>
            )}

            {/* Rate form */}
            {tradeMode === 'rate' && (
              <div style={{ marginTop: 4 }}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                    Unit
                  </label>
                  <select
                    className="finp"
                    value={rateForm.unit}
                    onChange={e => setRateForm(f => ({ ...f, unit: e.target.value }))}
                    style={{ width: '100%', appearance: 'none' }}
                  >
                    <option value="">Select unit...</option>
                    {UNIT_OPTIONS.map(u => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                    Your rate ($)
                  </label>
                  <input
                    className="finp"
                    type="number"
                    placeholder="e.g. 4.50"
                    value={rateForm.rate}
                    onChange={e => setRateForm(f => ({ ...f, rate: e.target.value }))}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                    Notes
                  </label>
                  <textarea
                    className="finp"
                    rows={3}
                    placeholder="Minimums, exclusions, complexity tiers, materials included/excluded... the more detail the better."
                    value={rateForm.notes}
                    onChange={e => setRateForm(f => ({ ...f, notes: e.target.value }))}
                    style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
                  />
                </div>

                <button
                  style={{
                    ...btnGold,
                    fontSize: 15,
                    opacity: (!rateValid || saving) ? 0.45 : 1,
                    cursor: (!rateValid || saving) ? 'not-allowed' : 'pointer',
                  }}
                  disabled={!rateValid || saving}
                  onClick={handleSaveRate}
                >
                  {saving ? 'Saving...' : 'Save & Continue →'}
                </button>
              </div>
            )}

            {/* Error state */}
            {tradeError && (
              <div style={{ marginTop: 12 }}>
                <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: '#EF4444', margin: '0 0 6px 0' }}>
                  {tradeError}
                </p>
                <button
                  onClick={advanceTrade}
                  style={{ background: 'none', border: 'none', color: '#9B8E7A', fontFamily: 'DM Sans, sans-serif', fontSize: 12, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                >
                  Skip this trade
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Step 4 — Documents ─────────────────────────────────────────────────────

  if (step === 4) {
    function UploadRow({ label, accept, file, setFile, status, setStatus, docType }) {
      return (
        <div style={{ marginBottom: 20, padding: 16, border: '1px solid #E8E4DC', borderRadius: 8 }}>
          <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 14, fontWeight: 600, color: '#374151', margin: '0 0 10px 0' }}>{label}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ cursor: 'pointer' }}>
              <input
                type="file"
                accept={accept}
                style={{ display: 'none' }}
                onChange={async e => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setFile(f);
                  await handleUpload(f, docType, setStatus);
                }}
              />
              <span style={{
                display: 'inline-block',
                padding: '8px 16px',
                background: '#F7F5F0',
                border: '1px solid #E8E4DC',
                borderRadius: 6,
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 13,
                fontWeight: 600,
                color: '#374151',
                cursor: 'pointer',
              }}>
                Choose file
              </span>
            </label>
            {file && (
              <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#6B7280' }}>
                {file.name}
              </span>
            )}
            {status === 'uploading' && (
              <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#9B8E7A' }}>Uploading...</span>
            )}
            {status === 'done' && (
              <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#22c55e', fontWeight: 600 }}>Uploaded</span>
            )}
            {status === 'error' && (
              <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: '#EF4444' }}>Upload failed — you can add this later</span>
            )}
          </div>
        </div>
      );
    }

    return (
      <div style={{ minHeight: '100dvh', background: '#F7F5F0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '24px 16px' }}>
        <div style={{ width: '100%', maxWidth: 480 }}>
          <button style={backLink} onClick={goBack}>← Back</button>
          <p style={progressLabel}>Step 4 of 5</p>
          <div style={card}>
            <h1 style={{ ...heading, fontSize: 22 }}>Almost done</h1>
            <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: '#6B7280', margin: '0 0 24px 0', lineHeight: 1.6 }}>
              Upload your W9 and insurance certificate so contractors can work with you. You can skip and add these later.
            </p>

            <UploadRow
              label="W9 Form"
              accept=".pdf,.doc,.docx"
              file={w9File}
              setFile={setW9File}
              status={w9Status}
              setStatus={setW9Status}
              docType="w9"
            />
            <UploadRow
              label="Insurance Certificate"
              accept=".pdf,.jpg,.jpeg,.png"
              file={insFile}
              setFile={setInsFile}
              status={insStatus}
              setStatus={setInsStatus}
              docType="insurance"
            />

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button
                style={{ ...btnGhost, flex: 1, padding: '14px 12px', fontSize: 14 }}
                onClick={() => setStep(5)}
              >
                Skip for now →
              </button>
              <button
                style={{ ...btnGold, flex: 1, padding: '14px 12px', fontSize: 14 }}
                onClick={() => setStep(5)}
              >
                Continue →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 5 — Done ──────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100dvh', background: '#F7F5F0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: 48, color: '#C9A84C', lineHeight: 1, marginBottom: 16 }}>✓</div>
          <h1 style={{ ...heading, textAlign: 'center', marginBottom: 12 }}>You're all set!</h1>
          <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 15, color: '#374151', lineHeight: 1.6, margin: '0 0 24px 0' }}>
            We'll send you bid invitations as jobs come up that match your trades.
          </p>

          {/* Selected trades pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 28 }}>
            {selectedTrades.map(trade => (
              <span key={trade} style={{
                background: '#0A1F44',
                color: '#FFFFFF',
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 12,
                fontWeight: 600,
                padding: '4px 12px',
                borderRadius: 20,
              }}>
                {trade}
              </span>
            ))}
          </div>

          <button
            style={btnGold}
            onClick={() => {
              clearProgress();
              onComplete();
            }}
          >
            Go to Dashboard →
          </button>
        </div>
      </div>
    </div>
  );
}
