import { useState, useEffect, useRef } from 'react';
import { sbLoadSubJobs, sbLoadSubITBs, sbSubmitBid, sbLoadSubPricing, sbLoadSubRating, AV_USER_ID, ANON_KEY } from '../../lib/supabase';
import { Ic, sc, sl, f$, fD } from '../../lib/utils';
import SubJobView from './SubJobView';
import SubOnboardingWizard from './SubOnboardingWizard';

const AI_SUB_PRICING_URL = 'https://cbfftukmhqvvjlrlnltk.supabase.co/functions/v1/ai-sub-pricing';
const NAV = '#0A1F44';
const GOLD = '#C9A84C';
const BORDER = '#E8E4DC';

function StarRating({ value }) {
  return (
    <span style={{ color: GOLD, fontSize: 18, letterSpacing: 2 }}>
      {[1,2,3,4,5].map(i => <span key={i} style={{ opacity: i <= Math.round(value) ? 1 : 0.25 }}>★</span>)}
    </span>
  );
}

export default function SubPortal({ profile, signOut }) {
  const [view, setView] = useState('jobs');
  const [jobs, setJobs] = useState([]);
  const [itbs, setItbs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [itbsLoading, setItbsLoading] = useState(false);
  const [sel, setSel] = useState(null);
  const [bidITB, setBidITB] = useState(null);
  const [bidForm, setBidForm] = useState({ amount: '', notes: '' });
  const [bidFile, setBidFile] = useState(null);
  const [bidSaving, setBidSaving] = useState(false);
  const [bidDone, setBidDone] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [pricing, setPricing] = useState([]);
  const [pricingLoaded, setPricingLoaded] = useState(false);
  const [rating, setRating] = useState(null);

  // Pricing AI bot state
  const [botMsgs, setBotMsgs] = useState([]);
  const [botHistory, setBotHistory] = useState([]);
  const [botInput, setBotInput] = useState('');
  const [botSending, setBotSending] = useState(false);
  const [botStarted, setBotStarted] = useState(false);
  const botBottomRef = useRef();
  const bidFileRef = useRef();

  useEffect(() => {
    if (profile?.id) {
      sbLoadSubJobs(profile.id).then(d => { setJobs(d); setLoading(false); });
      sbLoadSubRating(profile.id).then(d => setRating(d));
      // Check if pricing exists — show onboarding if not
      sbLoadSubPricing(profile.id).then(d => {
        setPricing(d);
        setPricingLoaded(true);
        if (!d.length) setShowOnboarding(true);
      });
    }
  }, [profile?.id]);

  useEffect(() => {
    if (view !== 'bids' || itbs.length) return;
    setItbsLoading(true);
    sbLoadSubITBs(profile.id).then(d => { setItbs(d); setItbsLoading(false); });
  }, [view, profile?.id]);

  // Auto-scroll pricing bot
  useEffect(() => { botBottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [botMsgs]);

  const submitBid = async () => {
    if (!bidITB) return;
    setBidSaving(true);
    const r = await sbSubmitBid(bidITB.id, bidForm.amount, bidForm.notes, bidFile);
    if (r) { setBidDone(bidITB.id); setItbs(p => p.map(x => x.id === bidITB.id ? { ...x, responses: [...(x.responses || []).filter(b => b.sub_id !== AV_USER_ID), r] } : x)); }
    setBidITB(null); setBidForm({ amount: '', notes: '' }); setBidFile(null); setBidSaving(false);
  };

  const startPricingBot = async () => {
    setBotStarted(true);
    setBotSending(true);
    try {
      const res = await fetch(AI_SUB_PRICING_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sub_id: profile.id, tenant_id: profile.tenant_id, full_name: profile.full_name, trade: profile.trade }),
      });
      const json = await res.json();
      const msg = json.message || "Hi! I can help you review and update your pricing. What would you like to look at?";
      setBotMsgs([{ role: 'ai', text: msg }]);
      setBotHistory([{ role: 'assistant', content: msg }]);
    } catch {
      setBotMsgs([{ role: 'ai', text: "Something went wrong. Please try again." }]);
    }
    setBotSending(false);
  };

  const sendBotMessage = async () => {
    const text = botInput.trim();
    if (!text || botSending) return;
    setBotInput('');
    setBotSending(true);
    const newMsgs = [...botMsgs, { role: 'user', text }];
    setBotMsgs(newMsgs);
    const newHistory = [...botHistory, { role: 'user', content: text }];
    setBotHistory(newHistory);
    try {
      const res = await fetch(AI_SUB_PRICING_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sub_id: profile.id, tenant_id: profile.tenant_id,
          full_name: profile.full_name, trade: profile.trade,
          message: text, conversation_history: newHistory,
        }),
      });
      const json = await res.json();
      const aiMsg = json.message || "Something went wrong. Try again.";
      setBotMsgs(p => [...p, { role: 'ai', text: aiMsg }]);
      setBotHistory(p => [...p, { role: 'assistant', content: aiMsg }]);
      // If a price change was approved, refresh pricing
      if (json.price_change?.decision === 'approved') {
        sbLoadSubPricing(profile.id).then(setPricing);
      }
    } catch {
      setBotMsgs(p => [...p, { role: 'ai', text: "Network error. Please try again." }]);
    }
    setBotSending(false);
  };

  if (sel) return <SubJobView job={sel} back={() => setSel(null)} profile={profile} />;
  if (showOnboarding && pricingLoaded) return (
    <SubOnboardingWizard
      profile={profile}
      onComplete={() => {
        setShowOnboarding(false);
        sbLoadSubPricing(profile.id).then(setPricing);
      }}
    />
  );

  const unreadBids = itbs.filter(x => !(x.responses || []).find(r => r.sub_id === AV_USER_ID)).length;

  // Group pricing by trade
  const pricingByTrade = pricing.reduce((acc, item) => {
    if (!acc[item.trade]) acc[item.trade] = [];
    acc[item.trade].push(item);
    return acc;
  }, {});

  const TABS = [
    { id: 'jobs', lb: 'My Projects', ic: 'home' },
    { id: 'bids', lb: 'Bid Invitations', ic: 'doc', badge: unreadBids },
    { id: 'pricing', lb: 'My Pricing', ic: 'box' },
  ];

  return (
    <div style={{ minHeight: '100dvh', background: '#F7F5F0' }}>
      {/* Header */}
      <div style={{ background: NAV, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, color: GOLD, letterSpacing: 4, textTransform: 'uppercase' }}>Avenstone Group</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{profile?.full_name}</div>
        </div>
        {/* Rating display */}
        {rating && (
          <div style={{ textAlign: 'right', marginRight: 4 }}>
            <StarRating value={rating.average} />
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{rating.average.toFixed(1)} · {rating.count} review{rating.count !== 1 ? 's' : ''}</div>
          </div>
        )}
        <button onClick={signOut} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', padding: 4 }}>
          <span style={{ width: 16, height: 16, display: 'flex' }}>{Ic.logout}</span>
        </button>
      </div>

      {/* Tabs */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${BORDER}`, display: 'flex', overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setView(t.id)} style={{ flex: '0 0 auto', padding: '12px 16px', background: 'transparent', border: 'none', borderBottom: `2px solid ${view === t.id ? GOLD : 'transparent'}`, color: view === t.id ? NAV : '#9CA3AF', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <span style={{ width: 14, height: 14, display: 'flex' }}>{Ic[t.ic] || Ic.home}</span>
            {t.lb}
            {t.badge > 0 && <span style={{ background: GOLD, color: NAV, width: 16, height: 16, borderRadius: '50%', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t.badge}</span>}
          </button>
        ))}
      </div>

      <div style={{ padding: 16 }}>
        {/* Jobs tab */}
        {view === 'jobs' && <>
          {loading && <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>Loading your projects...</div>}
          {!loading && !jobs.length && <div className="empty" style={{ paddingTop: 60 }}>{Ic.home}<div className="empty-t">No projects assigned yet</div><div>Your contractor will assign you to a project</div></div>}
          {jobs.map(j => (
            <div key={j.id} onClick={() => setSel(j)} style={{ background: '#fff', border: '1px solid #E8E4DC', borderLeft: `4px solid ${sc(j.status)}`, padding: '14px 16px', marginBottom: 10, cursor: 'pointer', borderRadius: 8 }} onMouseEnter={e => e.currentTarget.style.borderColor = GOLD} onMouseLeave={e => e.currentTarget.style.borderColor = BORDER}>
              <div style={{ fontSize: 14, fontWeight: 600, color: NAV, marginBottom: 4 }}>{j.address}</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {j.client_name && <span style={{ fontSize: 12, color: '#9CA3AF' }}>{j.client_name}</span>}
                <span style={{ fontSize: 10, background: sc(j.status) + '18', color: sc(j.status), padding: '2px 8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, borderRadius: 20 }}>{sl(j.status)}</span>
              </div>
            </div>
          ))}
        </>}

        {/* Bids tab */}
        {view === 'bids' && <>
          {itbsLoading && <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>Loading invitations...</div>}
          {!itbsLoading && !itbs.length && <div className="empty" style={{ paddingTop: 60 }}>{Ic.doc}<div className="empty-t">No bid invitations yet</div><div>Bid invitations from contractors will appear here</div></div>}
          {itbs.map(itb => {
            const myBid = (itb.responses || []).find(r => r.sub_id === AV_USER_ID);
            // Find relevant stored pricing for this trade
            const tradePricing = pricing.filter(p => (p.trade || '').toLowerCase() === (itb.trade || '').toLowerCase());
            return (
              <div key={itb.id} style={{ background: '#fff', border: '1px solid #E8E4DC', borderLeft: `3px solid ${myBid ? '#22c55e' : GOLD}`, padding: 16, marginBottom: 10, borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: NAV, marginBottom: 2 }}>{itb.trade || 'General'}</div>
                    {itb.job && <div style={{ fontSize: 12, color: '#9CA3AF' }}>{itb.job.address}</div>}
                  </div>
                  <span style={{ fontSize: 10, background: myBid ? '#F0FDF4' : 'rgba(201,168,76,0.1)', color: myBid ? '#16a34a' : GOLD, padding: '3px 10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, border: `1px solid ${myBid ? '#BBF7D0' : 'rgba(201,168,76,0.3)'}`, borderRadius: 20 }}>
                    {myBid ? 'Bid Submitted' : 'Awaiting Your Bid'}
                  </span>
                </div>
                {itb.description && <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, marginBottom: 10 }}>{itb.description}</div>}
                <div style={{ display: 'flex', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
                  {itb.budget_range && <span style={{ fontSize: 12, color: '#9CA3AF' }}><strong style={{ color: '#374151' }}>Budget:</strong> {itb.budget_range}</span>}
                  {itb.due_date && <span style={{ fontSize: 12, color: '#9CA3AF' }}><strong style={{ color: '#374151' }}>Due:</strong> {fD(itb.due_date)}</span>}
                </div>
                {/* Your pricing reference */}
                {tradePricing.length > 0 && !myBid && (
                  <div style={{ background: '#F7F5F0', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Your Pricing on File</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {tradePricing.slice(0, 6).map(p => (
                        <span key={p.id} style={{ fontSize: 12, color: NAV, background: '#fff', border: `1px solid ${BORDER}`, padding: '2px 8px', borderRadius: 20 }}>
                          {p.item_label}: <strong>{f$(p.price)}</strong> / {p.unit}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {myBid ? (
                  <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', padding: 12, borderRadius: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#16a34a', marginBottom: 4 }}>Your bid: {myBid.amount ? f$(myBid.amount) : 'No amount'}</div>
                    {myBid.notes && <div style={{ fontSize: 12, color: '#6B7280' }}>{myBid.notes}</div>}
                    {myBid.quote_file_name && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>Quote: {myBid.quote_file_name}</div>}
                    {myBid.status === 'awarded' && <div style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', marginTop: 6 }}>🏆 Your bid was awarded!</div>}
                  </div>
                ) : (
                  <button className="btn btn-navy" style={{ width: '100%', marginTop: 4 }} onClick={() => { setBidITB(itb); setBidDone(null); }}>Submit Your Bid</button>
                )}
                {bidDone === itb.id && <div style={{ fontSize: 13, color: '#16a34a', fontWeight: 600, marginTop: 8, textAlign: 'center' }}>✓ Bid submitted successfully!</div>}
              </div>
            );
          })}
        </>}

        {/* Pricing tab */}
        {view === 'pricing' && (
          <div>
            {/* AI pricing bot */}
            <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}>
              <div style={{ background: NAV, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>✦</span>
                <div>
                  <div style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>Pricing Assistant</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Discuss your rates, request changes, see market context</div>
                </div>
              </div>
              <div style={{ padding: 16 }}>
                {!botStarted ? (
                  <button className="btn btn-gold" style={{ width: '100%' }} onClick={startPricingBot}>
                    Open Pricing Chat
                  </button>
                ) : (
                  <>
                    <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                      {botMsgs.map((m, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                          <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px', background: m.role === 'user' ? NAV : '#F7F5F0', color: m.role === 'user' ? '#fff' : '#374151', fontSize: 13, lineHeight: 1.55, border: m.role === 'user' ? 'none' : `1px solid ${BORDER}` }}>
                            {m.text}
                          </div>
                        </div>
                      ))}
                      {botSending && (
                        <div style={{ display: 'flex', gap: 4, padding: '10px 14px' }}>
                          {[0,1,2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#9CA3AF', animation: `bounce 1.2s ${i * 0.2}s infinite` }} />)}
                        </div>
                      )}
                      <div ref={botBottomRef} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        className="finp"
                        style={{ flex: 1, marginBottom: 0 }}
                        value={botInput}
                        onChange={e => setBotInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBotMessage(); } }}
                        placeholder="Ask about your pricing..."
                        disabled={botSending}
                      />
                      <button className="btn btn-navy" onClick={sendBotMessage} disabled={botSending || !botInput.trim()}>Send</button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Stored pricing */}
            <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 18, color: NAV, marginBottom: 12 }}>Your Pricing on File</div>
            {!pricing.length ? (
              <div className="empty">{Ic.box}<div className="empty-t">No pricing on file</div><button className="btn btn-gold" style={{ marginTop: 12 }} onClick={() => setShowOnboarding(true)}>Set Up My Pricing</button></div>
            ) : (
              Object.entries(pricingByTrade).map(([trade, items]) => (
                <div key={trade} style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, marginBottom: 16, overflow: 'hidden' }}>
                  <div style={{ background: '#F7F5F0', padding: '10px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: NAV, textTransform: 'capitalize' }}>{trade}</span>
                    <span style={{ fontSize: 12, color: '#9CA3AF' }}>{items.length} item{items.length !== 1 ? 's' : ''}</span>
                  </div>
                  {items.map((item, i) => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: i < items.length - 1 ? `1px solid ${BORDER}` : 'none', background: i % 2 === 0 ? '#fff' : '#FAFAF8' }}>
                      <div>
                        <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{item.item_label}</span>
                        {item.is_custom && <span style={{ fontSize: 10, color: GOLD, fontWeight: 700, marginLeft: 6, background: 'rgba(201,168,76,0.1)', padding: '1px 6px', borderRadius: 10 }}>custom</span>}
                        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{item.unit}</div>
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 700, color: NAV }}>{f$(item.price)}</span>
                    </div>
                  ))}
                </div>
              ))
            )}
            {pricing.length > 0 && (
              <button className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => setShowOnboarding(true)}>
                Re-run Pricing Onboarding
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bid submit modal */}
      {bidITB && <div className="overlay" onClick={() => setBidITB(null)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-title">Submit Bid</div>
          <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 14 }}>{bidITB.trade} — {bidITB.job?.address || ''}</div>
          <div className="fg"><label className="flbl">Your Bid Amount ($)</label><input className="finp" type="number" value={bidForm.amount} onChange={e => setBidForm(p => ({ ...p, amount: e.target.value }))} placeholder="e.g. 9500" /></div>
          <div className="fg"><label className="flbl">Notes / Scope Clarifications</label><textarea className="finp fta" value={bidForm.notes} onChange={e => setBidForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any assumptions, exclusions, or details about your quote..." rows={3} /></div>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label className="flbl">Upload Quote (PDF, Word, Excel)</label>
            <input ref={bidFileRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" onChange={e => setBidFile(e.target.files[0] || null)} style={{ display: 'none' }} />
            <button className="btn btn-ghost" style={{ width: '100%', padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={() => bidFileRef.current.click()}>
              <span style={{ width: 14, height: 14, display: 'flex' }}>{Ic.dl}</span>{bidFile ? bidFile.name : 'Choose file to upload'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setBidITB(null); setBidForm({ amount: '', notes: '' }); setBidFile(null); }}>Cancel</button>
            <button className="btn btn-gold" style={{ flex: 1 }} onClick={submitBid} disabled={bidSaving}>{bidSaving ? 'Submitting...' : 'Submit Bid'}</button>
          </div>
        </div>
      </div>}

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}
