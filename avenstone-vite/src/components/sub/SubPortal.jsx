import { useState, useEffect, useRef } from 'react'; // useRef kept for bidFileRef
import { sb, sbLoadSubJobs, sbLoadSubITBs, sbSubmitBid, sbLoadSubPricing, sbSaveSubPricing, sbDeleteSubPricing, sbLoadSubRating, sbLoadActiveTradeStrings, sbLoadEngagementsForSub, AV_USER_ID } from '../../lib/supabase';
import { Ic, sc, sl, f$, fD, fDT } from '../../lib/utils';
import { t } from '../../lib/i18n';
import SubJobView from './SubJobView';
import SubOnboardingWizard from './SubOnboardingWizard';
import EngagementDetailModal from '../modals/EngagementDetailModal';
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
  const [bidErr, setBidErr] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [pricing, setPricing] = useState([]);
  const [pricingLoaded, setPricingLoaded] = useState(false);
  const [rating, setRating] = useState(null);
  const [lang, setLang] = useState(() => localStorage.getItem('av_sub_lang') || 'en');

  const toggleLang = () => {
    const next = lang === 'en' ? 'es' : 'en';
    setLang(next);
    localStorage.setItem('av_sub_lang', next);
  };

  // Trade rate editing state
  const [editingTrade, setEditingTrade] = useState(null); // trade string being edited
  const [editForm, setEditForm] = useState({ pricing_mode: 'rate', unit: 'sf', rate: '', notes: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState('');
  const [showAddTrade, setShowAddTrade] = useState(false);
  const [addTrades, setAddTrades] = useState([]);
  const [allTradeStrings, setAllTradeStrings] = useState([]);
  const bidFileRef = useRef();

  const [engagements, setEngagements] = useState([]);
  const [showPast, setShowPast] = useState(false);
  const [detailEngId, setDetailEngId] = useState(null);

  useEffect(() => {
    sbLoadActiveTradeStrings().then(setAllTradeStrings);
  }, []);

  useEffect(() => {
    if (profile?.id) {
      sbLoadEngagementsForSub(profile.id).then(res => { if (res.ok) setEngagements(res.data); });
    }
  }, [profile?.id]);

  useEffect(() => {
    if (profile?.id) {
      sbLoadSubJobs(profile.id).then(d => { setJobs(d); setLoading(false); });
      sbLoadSubRating(profile.id).then(d => setRating(d));
      sbLoadSubPricing(profile.id).then(d => {
        setPricing(d);
        setPricingLoaded(true);
        if (!profile.onboarding_completed) setShowOnboarding(true);
      });
    }
  }, [profile?.id]);

  useEffect(() => {
    if (view !== 'bids' || itbs.length) return;
    setItbsLoading(true);
    sbLoadSubITBs(profile.id).then(d => { setItbs(d); setItbsLoading(false); });
  }, [view, profile?.id]);

  const submitBid = async () => {
    if (!bidITB) return;
    setBidSaving(true); setBidErr('');
    const r = await sbSubmitBid(bidITB.id, bidForm.amount, bidForm.notes, bidFile);
    if (r.ok) {
      setBidDone(bidITB.id);
      setItbs(p => p.map(x => x.id === bidITB.id ? { ...x, responses: [...(x.responses || []).filter(b => b.sub_id !== AV_USER_ID), r.data] } : x));
      setBidITB(null); setBidForm({ amount: '', notes: '' }); setBidFile(null);
    } else {
      setBidErr(r.error || 'Submit failed');
    }
    setBidSaving(false);
  };

  const existingTrades = pricing.map(p => p.trade);
  const availableToAdd = allTradeStrings.filter(tr => !existingTrades.includes(tr));

  const openEdit = (row) => {
    setEditingTrade(row.trade);
    setEditForm({ pricing_mode: row.pricing_mode || 'rate', unit: row.unit || 'sf', rate: row.rate ?? '', notes: row.notes || '' });
    setEditErr('');
  };

  const saveEdit = async () => {
    setEditSaving(true); setEditErr('');
    const { error } = await sbSaveSubPricing({ subId: profile.id, tenantId: profile.tenant_id, trade: editingTrade, pricingMode: editForm.pricing_mode, unit: editForm.pricing_mode === 'rate' ? editForm.unit : null, rate: editForm.pricing_mode === 'rate' ? parseFloat(editForm.rate) : null, notes: editForm.notes || null });
    if (error) { setEditErr('Save failed. Try again.'); }
    else { setPricing(await sbLoadSubPricing(profile.id)); setEditingTrade(null); }
    setEditSaving(false);
  };

  const deleteTrade = async (trade) => {
    await sbDeleteSubPricing(profile.id, trade);
    setPricing(await sbLoadSubPricing(profile.id));
  };

  const addNewTrade = async (trade) => {
    await sbSaveSubPricing({ subId: profile.id, tenantId: profile.tenant_id, trade, pricingMode: 'self_bid', unit: null, rate: null, notes: null });
    setPricing(await sbLoadSubPricing(profile.id));
    setAddTrades(p => p.filter(t => t !== trade));
    setShowAddTrade(false);
    openEdit({ trade, pricing_mode: 'self_bid', unit: 'sf', rate: '', notes: '' });
  };

  if (sel) return <SubJobView job={sel} back={() => setSel(null)} profile={profile} lang={lang} />;
  if (showOnboarding && pricingLoaded && !loading) return (
    <SubOnboardingWizard
      profile={profile}
      onComplete={async () => {
        await sb.from('profiles').update({ onboarding_completed: true }).eq('id', profile.id);
        setShowOnboarding(false);
        sbLoadSubPricing(profile.id).then(setPricing);
      }}
    />
  );

  const unreadBids = itbs.filter(x => !(x.responses || []).find(r => r.sub_id === AV_USER_ID)).length;

  const TABS = [
    { id: 'jobs', lb: t('My Projects', lang), ic: 'home' },
    { id: 'bids', lb: t('Bid Invitations', lang), ic: 'doc', badge: unreadBids },
    { id: 'pricing', lb: t('My Pricing', lang), ic: 'box' },
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
        <button onClick={toggleLang} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, cursor: 'pointer', color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 8px', letterSpacing: 1 }}>
          {lang === 'en' ? 'ES' : 'EN'}
        </button>
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

        {/* ── My Engagements ── */}
        {(() => {
          const actionNeeded = engagements.filter(e => e.status === 'invited');
          const awaitingPM   = engagements.filter(e => e.status === 'bid_submitted');
          const active       = engagements.filter(e => e.status === 'active');
          const past         = engagements.filter(e => ['completed', 'declined', 'withdrawn', 'removed'].includes(e.status));

          const statusMeta = {
            invited:       { label: 'Invited',    color: GOLD,      bg: 'rgba(201,168,76,0.12)' },
            bid_submitted: { label: 'Bid In',     color: '#3b82f6', bg: 'rgba(59,130,246,0.1)'  },
            active:        { label: 'Active',     color: '#22c55e', bg: 'rgba(34,197,94,0.1)'   },
            completed:     { label: 'Completed',  color: '#9CA3AF', bg: 'rgba(156,163,175,0.1)' },
            declined:      { label: 'Declined',   color: '#ef4444', bg: 'rgba(239,68,68,0.1)'   },
            withdrawn:     { label: 'Withdrawn',  color: '#ef4444', bg: 'rgba(239,68,68,0.1)'   },
            removed:       { label: 'Removed',    color: '#ef4444', bg: 'rgba(239,68,68,0.1)'   },
          };

          const renderRow = eng => {
            const meta = statusMeta[eng.status] || statusMeta.invited;
            const lastTs = [eng.invited_at, eng.bid_submitted_at, eng.activated_at, eng.completed_at, eng.terminated_at].filter(Boolean).sort().pop();
            return (
              <div key={eng.id} onClick={() => setDetailEngId(eng.id)} style={{ background: '#fff', border: `1px solid ${BORDER}`, borderLeft: `3px solid ${meta.color}`, borderRadius: 8, padding: '12px 14px', marginBottom: 8, cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: NAV, marginBottom: 2 }}>{eng.job?.address || '—'}</div>
                    <div style={{ fontSize: 12, color: '#9CA3AF', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {eng.trade && <span>{eng.trade}</span>}
                      {eng.current_bid?.total_amount != null && <span style={{ color: NAV, fontWeight: 600 }}>{f$(eng.current_bid.total_amount)}</span>}
                      {lastTs && <span>{fDT(lastTs)}</span>}
                    </div>
                    {eng.status === 'invited' && (
                      <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4, display: 'inline-block', background: eng.bid_type === 'gc_drafted' ? 'rgba(59,130,246,0.1)' : 'rgba(201,168,76,0.12)', color: eng.bid_type === 'gc_drafted' ? '#3b82f6' : GOLD }}>
                        {eng.bid_type === 'gc_drafted' ? 'Pre-drafted bid ready for your review' : 'Submit your bid'}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: meta.bg, color: meta.color, border: `1px solid ${meta.color}44`, flexShrink: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>{meta.label}</span>
                </div>
              </div>
            );
          };

          const groupHeader = (label, count) => (
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              {label}
              <span style={{ background: '#F7F5F0', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '1px 7px', fontSize: 10, color: '#9CA3AF' }}>{count}</span>
            </div>
          );

          return (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: NAV, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                My Engagements
                {engagements.length > 0 && <span style={{ fontSize: 12, background: '#F7F5F0', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '1px 9px', color: '#9CA3AF', fontWeight: 600 }}>{engagements.length}</span>}
              </div>

              {engagements.length === 0 ? (
                <div style={{ fontSize: 13, color: '#9CA3AF', padding: '12px 0' }}>
                  No engagements yet. PMs will reach out when they want a bid from you.
                </div>
              ) : (
                <div>
                  {actionNeeded.length > 0 && <div style={{ marginBottom: 14 }}>{groupHeader('Action needed', actionNeeded.length)}{actionNeeded.map(renderRow)}</div>}
                  {awaitingPM.length > 0 && <div style={{ marginBottom: 14 }}>{groupHeader('Awaiting PM', awaitingPM.length)}{awaitingPM.map(renderRow)}</div>}
                  {active.length > 0 && <div style={{ marginBottom: 14 }}>{groupHeader('Active', active.length)}{active.map(renderRow)}</div>}
                  {past.length > 0 && (
                    <div>
                      <button onClick={() => setShowPast(v => !v)} style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 8 }}>
                        {showPast ? '▾' : '▸'} Show {past.length} past
                      </button>
                      {showPast && past.map(renderRow)}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Jobs tab */}
        {view === 'jobs' && <>
          {loading && <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>{t('Loading your projects...', lang)}</div>}
          {!loading && !jobs.length && <div className="empty" style={{ paddingTop: 60 }}>{Ic.home}<div className="empty-t">{t('No projects assigned yet', lang)}</div><div>{t('Your contractor will assign you to a project', lang)}</div></div>}
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
          {itbsLoading && <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>{t('Loading invitations...', lang)}</div>}
          {!itbsLoading && !itbs.length && <div className="empty" style={{ paddingTop: 60 }}>{Ic.doc}<div className="empty-t">{t('No bid invitations yet', lang)}</div><div>{t('Bid invitations from contractors will appear here', lang)}</div></div>}
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
                    {myBid ? t('Bid Submitted', lang) : t('Awaiting Your Bid', lang)}
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
                    <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{t('Your Rate on File', lang)}</div>
                    {tradePricing.map(p => (
                      <div key={p.id} style={{ fontSize: 13, color: NAV, fontWeight: 600 }}>
                        {p.pricing_mode === 'self_bid' ? t('Bidding each job myself', lang) : `${f$(p.rate)} / ${p.unit}`}
                        {p.notes && <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 400, marginTop: 2 }}>{p.notes}</div>}
                      </div>
                    ))}
                  </div>
                )}
                {myBid ? (
                  <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', padding: 12, borderRadius: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#16a34a', marginBottom: 4 }}>{t('Your bid', lang)}: {myBid.amount ? f$(myBid.amount) : 'No amount'}</div>
                    {myBid.notes && <div style={{ fontSize: 12, color: '#6B7280' }}>{myBid.notes}</div>}
                    {myBid.quote_file_name && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>Quote: {myBid.quote_file_name}</div>}
                    {myBid.status === 'awarded' && <div style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', marginTop: 6 }}>🏆 {t('Your bid was awarded!', lang)}</div>}
                  </div>
                ) : (
                  <button className="btn btn-navy" style={{ width: '100%', marginTop: 4 }} onClick={() => { setBidITB(itb); setBidDone(null); }}>{t('Submit Your Bid', lang)}</button>
                )}
                {bidDone === itb.id && <div style={{ fontSize: 13, color: '#16a34a', fontWeight: 600, marginTop: 8, textAlign: 'center' }}>✓ {t('Bid submitted successfully!', lang)}</div>}
              </div>
            );
          })}
        </>}

        {/* Pricing tab — Trade Rates */}
        {view === 'pricing' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 18, color: NAV }}>{t('Trade Rates', lang)}</div>
              {availableToAdd.length > 0 && <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => setShowAddTrade(true)}>{t('+ Add Trade', lang)}</button>}
            </div>

            {!pricing.length ? (
              <div className="empty">{Ic.box}<div className="empty-t">{t('No rates on file', lang)}</div><button className="btn btn-gold" style={{ marginTop: 12 }} onClick={() => setShowOnboarding(true)}>{t('Set Up My Pricing', lang)}</button></div>
            ) : (
              pricing.map(row => (
                <div key={row.id} style={{ background: '#fff', border: `1px solid ${editingTrade === row.trade ? GOLD : BORDER}`, borderRadius: 10, marginBottom: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: NAV, textTransform: 'capitalize' }}>{row.trade}</div>
                      <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
                        {row.pricing_mode === 'self_bid' ? t('Bidding each job myself', lang) : `${f$(row.rate)} / ${row.unit}`}
                      </div>
                      {row.notes && <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{row.notes}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => editingTrade === row.trade ? setEditingTrade(null) : openEdit(row)}>{editingTrade === row.trade ? t('Cancel', lang) : t('Edit', lang)}</button>
                    </div>
                  </div>

                  {editingTrade === row.trade && (
                    <div style={{ borderTop: `1px solid ${BORDER}`, padding: '14px 16px', background: '#FAFAF8' }}>
                      <div className="fg" style={{ marginBottom: 10 }}>
                        <label className="flbl">{t('Pricing mode', lang)}</label>
                        <select className="finp" style={{ appearance: 'none' }} value={editForm.pricing_mode} onChange={e => setEditForm(p => ({ ...p, pricing_mode: e.target.value }))}>
                          <option value="rate">{t('Give a rate', lang)}</option>
                          <option value="self_bid">{t("I'll bid each job myself", lang)}</option>
                        </select>
                      </div>
                      {editForm.pricing_mode === 'rate' && <>
                        <div className="fg" style={{ marginBottom: 10 }}>
                          <label className="flbl">{t('Unit', lang)}</label>
                          <select className="finp" style={{ appearance: 'none' }} value={editForm.unit} onChange={e => setEditForm(p => ({ ...p, unit: e.target.value }))}>
                            <option value="sf">{t('per sq ft', lang)}</option>
                            <option value="lf">{t('per linear ft', lang)}</option>
                            <option value="hour">{t('per hour', lang)}</option>
                            <option value="each">{t('per item', lang)}</option>
                          </select>
                        </div>
                        <div className="fg" style={{ marginBottom: 10 }}>
                          <label className="flbl">{t('Rate ($)', lang)}</label>
                          <input className="finp" type="number" min="0" step="0.01" value={editForm.rate} onChange={e => setEditForm(p => ({ ...p, rate: e.target.value }))} placeholder="e.g. 4.50" />
                        </div>
                      </>}
                      <div className="fg" style={{ marginBottom: 12 }}>
                        <label className="flbl">{t('Notes', lang)}</label>
                        <textarea className="finp fta" rows={2} value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} placeholder={t('Minimums, exclusions, complexity tiers...', lang)} />
                      </div>
                      {editErr && <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 8 }}>{editErr}</div>}
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button className="btn btn-danger" style={{ fontSize: 12, padding: '7px 14px' }} onClick={() => { if (window.confirm(`Remove ${row.trade}?`)) deleteTrade(row.trade); }}>{t('Remove', lang)}</button>
                        <button className="btn btn-gold" style={{ flex: 1 }} onClick={saveEdit} disabled={editSaving || (editForm.pricing_mode === 'rate' && !editForm.rate)}>{editSaving ? t('Saving...', lang) : t('Save', lang)}</button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}

            {pricing.length > 0 && availableToAdd.length > 0 && (
              <button className="btn btn-ghost" style={{ width: '100%', marginTop: 4 }} onClick={() => setShowAddTrade(true)}>{t('+ Add another trade', lang)}</button>
            )}
          </div>
        )}
      </div>

      {/* Add trade modal */}
      {showAddTrade && <div className="overlay" onClick={() => setShowAddTrade(false)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-title">{t('Add a Trade', lang)}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
            {availableToAdd.map(tr => (
              <button key={tr} className="btn btn-ghost" style={{ textAlign: 'center', padding: '10px 8px', fontSize: 13 }} onClick={() => addNewTrade(tr)}>{tr}</button>
            ))}
          </div>
          <button className="btn btn-ghost" style={{ width: '100%' }} onClick={() => setShowAddTrade(false)}>{t('Cancel', lang)}</button>
        </div>
      </div>}

      <EngagementDetailModal isOpen={!!detailEngId} onClose={() => setDetailEngId(null)} engagementId={detailEngId} />

      {/* Bid submit modal */}
      {bidITB && <div className="overlay" onClick={() => setBidITB(null)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-title">{t('Submit Bid', lang)}</div>
          <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 14 }}>{bidITB.trade} — {bidITB.job?.address || ''}</div>
          <div className="fg"><label className="flbl">{t('Your Bid Amount ($)', lang)}</label><input className="finp" type="number" value={bidForm.amount} onChange={e => setBidForm(p => ({ ...p, amount: e.target.value }))} placeholder="e.g. 9500" /></div>
          <div className="fg"><label className="flbl">{t('Notes / Scope Clarifications', lang)}</label><textarea className="finp fta" value={bidForm.notes} onChange={e => setBidForm(p => ({ ...p, notes: e.target.value }))} placeholder={t('Any assumptions, exclusions, or details about your quote...', lang)} rows={3} /></div>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label className="flbl">{t('Upload Quote (PDF, Word, Excel)', lang)}</label>
            <input ref={bidFileRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" onChange={e => setBidFile(e.target.files[0] || null)} style={{ display: 'none' }} />
            <button className="btn btn-ghost" style={{ width: '100%', padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={() => bidFileRef.current.click()}>
              <span style={{ width: 14, height: 14, display: 'flex' }}>{Ic.dl}</span>{bidFile ? bidFile.name : t('Choose file to upload', lang)}
            </button>
          </div>
          {bidErr && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', padding: '8px 12px', fontSize: 12, marginBottom: 8 }}>{bidErr}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setBidITB(null); setBidForm({ amount: '', notes: '' }); setBidFile(null); setBidErr(''); }}>{t('Cancel', lang)}</button>
            <button className="btn btn-gold" style={{ flex: 1 }} onClick={submitBid} disabled={bidSaving}>{bidSaving ? t('Submitting...', lang) : t('Submit Bid', lang)}</button>
          </div>
        </div>
      </div>}

    </div>
  );
}
