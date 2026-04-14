import { useState, useEffect, useRef } from 'react';
import { sb, AV_TENANT, AV_USER_ID, sbNotify } from '../../lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Material Selection — v1.0.2
// Chained after AiIntakeWizard completes. Uses real job context.
// Scripted AI for now (real AI edge function in v1.0.3).
// Real DB save + sbNotify fires on Send to Avenstone.
// Real construction-estimate format on the done screen.
// See docs/MATERIAL_SELECTION.md for the full roadmap.
// ─────────────────────────────────────────────────────────────────────────────

// Real photos via picsum.photos with a seed — always works, no API key, free.
// Replaced by actual product photography in v1.0.1+.
const photo = (seed) => `https://picsum.photos/seed/${seed}/600/450`;

const HERO = 'https://picsum.photos/seed/avenstone-bath-hero/1200/800';

const CATALOG = {
  tile: [
    { id: 'tile-1', brand: 'Daltile',          name: 'Restore 12x24 Matte White',          vendor: 'Home Depot', price: 1.99, unit: 'sf',  vibe: 'modern',       photo: photo('avtile1'), note: 'Larger format hides the slight floor unevenness common in 1962 homes like yours.' },
    { id: 'tile-2', brand: 'Marazzi',          name: 'Studio Life 12x24 Park Avenue',      vendor: 'Home Depot', price: 3.49, unit: 'sf',  vibe: 'modern',       photo: photo('avtile2'), note: 'Warm neutral that hides water spots better than pure white. Most popular pick.' },
    { id: 'tile-3', brand: 'Style Selections', name: 'Mitte Gray 12x24 Porcelain',         vendor: 'Lowes',      price: 2.49, unit: 'sf',  vibe: 'modern',       photo: photo('avtile3'), note: 'Budget pick that still looks high-end. Holds up well in wet areas.' },
    { id: 'tile-4', brand: 'MSI',              name: 'Carrara White 12x24 Polished',       vendor: 'Home Depot', price: 4.99, unit: 'sf',  vibe: 'modern',       photo: photo('avtile4'), note: 'Marble look, porcelain durability. Pricier but feels luxe.' },
    { id: 'tile-5', brand: 'Florida Tile',     name: 'Streamline Bianco 12x24',            vendor: 'Lowes',      price: 2.79, unit: 'sf',  vibe: 'transitional', photo: photo('avtile5'), note: 'Subtle texture that adds depth without being busy.' },
    { id: 'tile-6', brand: 'Daltile',          name: 'Volume 1.0 Hex Mosaic',              vendor: 'Home Depot', price: 8.99, unit: 'sf',  vibe: 'modern',       photo: photo('avtile6'), note: 'Statement floor. Heads up: small format adds about $400 in labor — totally worth it for the look.' },
  ],
  vanity: [
    { id: 'van-1',  brand: 'Glacier Bay',      name: 'Hampton 36" Vanity — White',         vendor: 'Home Depot', price: 499,  unit: 'each', vibe: 'transitional', photo: photo('avvan1'), note: 'Soft-close drawers, marble-look top included. Great value.' },
    { id: 'van-2',  brand: 'Style Selections', name: 'Westcourt 36" Vanity — Gray',        vendor: 'Lowes',      price: 599,  unit: 'each', vibe: 'modern',       photo: photo('avvan2'), note: 'Modern lines with a quartz top. Pairs well with the Marazzi tile.' },
    { id: 'van-3',  brand: 'Home Decorators',  name: 'Sonoma 36" Vanity — Espresso',       vendor: 'Home Depot', price: 649,  unit: 'each', vibe: 'traditional',  photo: photo('avvan3'), note: 'Solid wood, traditional profile. Best fit if you want a warmer, classic look.' },
    { id: 'van-4',  brand: 'allen + roth',     name: 'Brisette 36" — Linen White',         vendor: 'Lowes',      price: 549,  unit: 'each', vibe: 'transitional', photo: photo('avvan4'), note: 'Beadboard detail, brushed nickel hardware. Coastal vibe.' },
  ],
  faucet: [
    { id: 'fau-1',  brand: 'Moen',             name: 'Adler Centerset — Chrome',           vendor: 'Home Depot', price: 89,   unit: 'each', photo: photo('avfau1'), note: 'Reliable, easy to clean, lifetime warranty. Most common choice.' },
    { id: 'fau-2',  brand: 'Pfister',          name: 'Pasadena Single-Handle — Brushed',   vendor: 'Home Depot', price: 129,  unit: 'each', photo: photo('avfau2'), note: 'Brushed nickel hides fingerprints. Nice mid-tier upgrade.' },
    { id: 'fau-3',  brand: 'Delta',            name: 'Foundations Two-Handle — Chrome',    vendor: 'Lowes',      price: 69,   unit: 'each', photo: photo('avfau3'), note: 'Budget pick. Two-handle is more traditional but still works modern.' },
    { id: 'fau-4',  brand: 'Kohler',           name: 'Bancroft Widespread — Polished Nickel', vendor: 'Lowes',   price: 289,  unit: 'each', photo: photo('avfau4'), note: 'Designer pick. Polished nickel ages beautifully and feels heirloom.' },
  ],
  lighting: [
    { id: 'lig-1',  brand: 'Hampton Bay',      name: '3-Light Vanity — Brushed Nickel',    vendor: 'Home Depot', price: 59,   unit: 'each', photo: photo('avlig1'), note: 'Standard 3-bulb vanity bar. Goes with anything.' },
    { id: 'lig-2',  brand: 'Globe Electric',   name: 'Holden 4-Light — Matte Black',       vendor: 'Home Depot', price: 149,  unit: 'each', photo: photo('avlig2'), note: 'Black hardware is having a moment. Modern statement piece.' },
    { id: 'lig-3',  brand: 'Project Source',   name: '3-Light Vanity — Chrome',            vendor: 'Lowes',      price: 39,   unit: 'each', photo: photo('avlig3'), note: 'Budget pick, still UL-listed. Hard to beat the price.' },
    { id: 'lig-4',  brand: 'Kichler',          name: 'Brinley 2-Light — Aged Brass',       vendor: 'Lowes',      price: 199,  unit: 'each', photo: photo('avlig4'), note: 'Warm brass, glass shades. Designer-level finish for under $200.' },
  ],
  hardware: [
    { id: 'hw-1',   brand: 'Liberty',          name: 'Bar Pull 1.25" — Brushed Nickel (10pk)', vendor: 'Home Depot', price: 14, unit: 'each', photo: photo('avhw1'), note: 'Clean modern profile. Matches most faucet finishes.' },
    { id: 'hw-2',   brand: 'Brainerd',         name: 'Round Knob 1.25" — Satin Nickel (10pk)', vendor: 'Lowes',      price: 11, unit: 'each', photo: photo('avhw2'), note: 'Classic round knob. Works with any vanity style.' },
    { id: 'hw-3',   brand: 'Amerock',          name: 'Westerly Pull 3" — Matte Black (5pk)',   vendor: 'Home Depot', price: 18, unit: 'each', photo: photo('avhw3'), note: 'Bold matte black. Great with the Holden light.' },
  ],
  paint: [
    { id: 'pai-1',  brand: 'Behr',             name: 'Premium Plus Eggshell — Polar Bear', vendor: 'Home Depot', price: 34,  unit: 'gallon', photo: photo('avpai1'), note: 'Soft warm white. Eggshell wipes clean, perfect for bathrooms.' },
    { id: 'pai-2',  brand: 'Valspar',          name: 'Reserve Eggshell — Du Jour',         vendor: 'Lowes',      price: 39,  unit: 'gallon', photo: photo('avpai2'), note: 'Light cream — adds warmth without going yellow.' },
    { id: 'pai-3',  brand: 'Behr',             name: 'Marquee Satin — Ultra Pure White',   vendor: 'Home Depot', price: 47,  unit: 'gallon', photo: photo('avpai3'), note: 'Crisp pure white. Satin handles bathroom moisture better than eggshell.' },
    { id: 'pai-4',  brand: 'Sherwin-Williams', name: 'ProClassic Satin — Sea Salt',        vendor: 'Home Depot', price: 64,  unit: 'gallon', photo: photo('avpai4'), note: 'Spa-like soft greige. The internet\'s favorite bathroom color for a reason.' },
  ],
};

const APPROX_QTY = {
  tile:     { qty: 200, unit: 'sf' },
  vanity:   { qty: 1,   unit: 'each' },
  faucet:   { qty: 1,   unit: 'each' },
  lighting: { qty: 1,   unit: 'each' },
  hardware: { qty: 8,   unit: 'pulls' },
  paint:    { qty: 2,   unit: 'gallons' },
};

const FLOW = ['greeting', 'vibe', 'tile', 'vanity', 'faucet', 'lighting', 'hardware', 'paint', 'done'];

const STEP_LABEL = {
  greeting: 'Welcome',
  vibe:     'Style',
  tile:     'Tile',
  vanity:   'Vanity',
  faucet:   'Faucet',
  lighting: 'Lighting',
  hardware: 'Hardware',
  paint:    'Paint',
  done:     'Review',
};

const STEP_INTRO = {
  vanity:   "Beautiful pick. Now let's pick a vanity — three that fit the style you chose:",
  faucet:   "Faucets next. All highly rated, easy to clean, and built to last:",
  lighting: "Vanity lighting — this is where the bathroom really comes together:",
  hardware: "Cabinet pulls — small detail, big impact. Three options that match your vibe:",
  paint:    "Last big decision: paint. Eggshell or satin — both work in bathrooms, satin is slightly more moisture-resistant:",
  done:     "That's everything! Let's review your selections.",
};

// Pulls real project context from the job passed by ClientPortal.
// Falls back to demo data if launched without a job (e.g. from tests).
function getProjectContext(job, profile) {
  if (!job) {
    return {
      client_name:  profile?.full_name?.split(' ')[0] || 'there',
      address:      '1234 Maple Dr',
      year_built:   1962,
      project_type: 'Master Bath Remodel',
      sqft:         85,
      budget_low:   42000,
      budget_high:  58000,
    };
  }
  const ia = job.intake_answers || {};
  const scope = (ia.project_type || ia.scope_summary || '').toLowerCase();
  // Rough budget bracket from sqft if no explicit budget
  const sqft = Number(ia.sqft_estimate || job.sqft || 85);
  const budgetLow  = ia.budget_low  || Math.max(15000, sqft * 400);
  const budgetHigh = ia.budget_high || Math.max(25000, sqft * 700);
  return {
    client_name:  (job.client_name || profile?.full_name || 'there').split(' ')[0],
    address:      job.address || 'your project',
    year_built:   ia.year_built || null,
    project_type: ia.project_type || scope || 'Remodel',
    sqft,
    budget_low:   Math.round(budgetLow),
    budget_high:  Math.round(budgetHigh),
  };
}

// Trigger thresholds for the allowance pivot
const ALLOWANCE_TRIGGER_CYCLE = 4; // 4 options shown without a pick
const ALLOWANCE_TRIGGER_STARS = 3; // 3 stars in one category without a pick

function f$(n) {
  return `$${Math.round(n).toLocaleString()}`;
}

function calcLineTotal(item, category) {
  const q = APPROX_QTY[category]?.qty || 1;
  return item.price * q;
}

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '12px 16px' }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#C9A84C', display: 'inline-block', animation: 'msDot 1.2s infinite', animationDelay: `${i * 0.2}s` }} />
      ))}
    </div>
  );
}

export default function MaterialSelectionScr({ onClose, job, profile }) {
  const project = getProjectContext(job, profile);
  const [welcomed, setWelcomed]       = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [submitted, setSubmitted]     = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [step, setStep]               = useState('greeting');
  const [messages, setMessages]       = useState([]);
  const [vibe, setVibe]               = useState(null);
  const [selections, setSelections]   = useState({}); // { tile: { item, state, allowance? }, ... }
  const [stars, setStars]             = useState({}); // { tile: [item,item], vanity: [item], ... }
  const [cycleCount, setCycleCount]   = useState({}); // { tile: 4, ... } — increments per option viewed without pick
  const [allowanceOffered, setAllowanceOffered] = useState({});
  const [showStarred, setShowStarred] = useState(false);
  const [showCart, setShowCart]       = useState(false);
  const [showAllowancePicker, setShowAllowancePicker] = useState(null); // category being pivoted
  const [loading, setLoading]         = useState(false);
  const msgsEndRef = useRef();

  useEffect(() => {
    if (msgsEndRef.current) msgsEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function pushAssistant(content) {
    setMessages((prev) => [...prev, { role: 'assistant', content }]);
  }
  function pushUser(content) {
    setMessages((prev) => [...prev, { role: 'user', content }]);
  }
  function pushAssistantWithDelay(content, delay = 700) {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      pushAssistant(content);
    }, delay);
  }

  // ── Welcome → start chat ──────────────────────────────────────────────────
  function dismissWelcome() {
    setWelcomed(true);
    pushAssistant(`Hi ${project.client_name}! I'm your Avenstone designer. I'll walk you through every finish for your ${project.project_type.toLowerCase()} — about 15 minutes. You can pause anytime.`);
    setTimeout(() => {
      pushAssistant("First — what's the overall vibe you're going for? This helps me narrow down the options.");
      setStep('vibe');
    }, 900);
  }

  function pickVibe(label) {
    setVibe(label);
    pushUser(label);
    setStep('tile');
    pushAssistantWithDelay(
      `Got it — ${label.toLowerCase()}. Let's start with tile, that's the biggest visual decision. Here are a few I think would work for your bath:`
    );
  }

  // ── Selecting an item ─────────────────────────────────────────────────────
  function selectItem(category, item, state = 'final', allowance = null) {
    setSelections((prev) => ({
      ...prev,
      [category]: { item, state, allowance },
    }));
    pushUser(state === 'placeholder' ? `Set as placeholder: ${item.brand} ${item.name}` : `Selected ${item.brand} ${item.name}`);
    const lineTotal = state === 'placeholder' && allowance ? allowance : calcLineTotal(item, category);
    pushAssistantWithDelay(
      state === 'placeholder'
        ? `✓ Locked in ${f$(allowance)} as your ${category} allowance. You can refine the exact pick anytime before we order. ${item.note}`
        : `✓ Added. ${f$(lineTotal)} for your ${category}. ${item.note}`,
      500
    );
    advance(category);
  }

  function skipCategory(category) {
    pushUser(`Skip ${category}`);
    advance(category);
  }

  function advance() {
    const idx = FLOW.indexOf(step);
    const next = FLOW[idx + 1];
    if (!next) return;
    setStep(next);
    setTimeout(() => {
      if (STEP_INTRO[next]) pushAssistantWithDelay(STEP_INTRO[next], 800);
    }, 600);
  }

  // ── Star handlers ─────────────────────────────────────────────────────────
  function toggleStar(category, item) {
    setStars((prev) => {
      const list = prev[category] || [];
      const isStarred = list.some((s) => s.id === item.id);
      const next = isStarred
        ? { ...prev, [category]: list.filter((s) => s.id !== item.id) }
        : { ...prev, [category]: [...list, item] };

      // Trigger allowance pivot if 3+ stars in this category
      const newCount = next[category]?.length || 0;
      if (newCount >= ALLOWANCE_TRIGGER_STARS && !allowanceOffered[category] && !selections[category]) {
        setTimeout(() => offerAllowancePivot(category), 500);
      }
      return next;
    });
  }
  function isStarred(category, item) {
    return (stars[category] || []).some((s) => s.id === item.id);
  }

  // ── Allowance pivot ───────────────────────────────────────────────────────
  function offerAllowancePivot(category) {
    if (allowanceOffered[category]) return;
    setAllowanceOffered((prev) => ({ ...prev, [category]: true }));
    const starredCount = (stars[category] || []).length;
    pushAssistantWithDelay(
      `I notice you've ${starredCount >= ALLOWANCE_TRIGGER_STARS ? `starred ${starredCount} ${category}s` : `looked at a lot of ${category} options`} — that's totally normal, this is one of the harder decisions. Want to set an allowance instead? You'd lock in a budget number now, and pick the exact one later (even after the project starts). Most clients do this for ${category}.`,
      800
    );
  }

  function acceptAllowancePivot(category) {
    pushUser('Set an allowance');
    setShowAllowancePicker(category);
  }

  function declineAllowancePivot(category) {
    pushUser('Keep looking');
    pushAssistantWithDelay("Got it — let's keep going. No pressure.", 500);
  }

  function lockAllowance(category, item, allowanceAmount) {
    setShowAllowancePicker(null);
    selectItem(category, item, 'placeholder', allowanceAmount);
  }

  // ── Done — real save to DB + notification ─────────────────────────────────
  async function sendToAvenstone() {
    pushUser('Send to Avenstone');
    setSubmitting(true);
    setSubmitError(null);

    try {
      // Build the selections blob that gets stored on the job
      const selectionsBlob = {
        vibe,
        items: selectionList.map((s) => ({
          category:    s.category,
          brand:       s.item.brand,
          name:        s.item.name,
          vendor:      s.item.vendor,
          unit_price:  s.item.price,
          unit:        s.item.unit,
          line_total:  s.lineTotal,
          state:       s.state,
          allowance:   s.allowance,
        })),
        subtotal: total,
        estimate: buildEstimate(total, project),
        submitted_at: new Date().toISOString(),
      };

      // If we have a real job_id, update the existing job's intake_answers
      if (job?.id) {
        const merged = { ...(job.intake_answers || {}), material_selection: selectionsBlob };
        const { error: updateErr } = await sb
          .from('jobs')
          .update({ intake_answers: merged })
          .eq('id', job.id);
        if (updateErr) throw new Error(updateErr.message);

        // Notify the tenant owner
        await sbNotify(
          'material_selection_submitted',
          `${project.client_name} finished material selections`,
          `${selectionList.length} items picked · subtotal ${f$(total)} · estimate ${f$(selectionsBlob.estimate.low)}–${f$(selectionsBlob.estimate.high)}`,
          job.id,
          AV_USER_ID
        );
      }

      setSubmitted(true);
      pushAssistantWithDelay(
        `All sent, ${project.client_name}! Your selections + draft estimate are on their way to our team. You'll get a recap email within a few minutes, and we'll reach out within 24 hours to confirm next steps.`,
        900
      );
    } catch (err) {
      setSubmitError(err.message || 'Something went wrong saving your selections.');
      pushAssistantWithDelay(
        "Hmm — I couldn't save that just now. Please try the Send button again, or reach out to us directly if it keeps happening.",
        500
      );
    } finally {
      setSubmitting(false);
    }
  }

  // Build a real-looking construction estimate from the subtotal.
  // In v1.2.0 this comes from ai_knowledge-based pricing rules.
  function buildEstimate(materialsSubtotal, proj) {
    const materials     = materialsSubtotal || 0;
    // Rough KC mid-tier bath remodel ratios (placeholder — refined in v1.2)
    const demo          = Math.round((proj.sqft || 85) * 26);    // ≈ $26/sf demo
    const plumbing      = Math.round((proj.sqft || 85) * 45);
    const electrical    = Math.round((proj.sqft || 85) * 28);
    const tileInstall   = Math.round((proj.sqft || 85) * 53);
    const drywallPaint  = Math.round((proj.sqft || 85) * 25);
    const fixtureInstall= Math.round((proj.sqft || 85) * 21);
    const finalPunch    = Math.round((proj.sqft || 85) * 20);
    const labor         = demo + plumbing + electrical + tileInstall + drywallPaint + fixtureInstall + finalPunch;
    const overheadProfit= Math.round((materials + labor) * 0.18);
    const contingency   = Math.round((materials + labor + overheadProfit) * 0.10);
    const subtotal      = materials + labor + overheadProfit + contingency;
    const low           = Math.round(subtotal * 0.92);
    const high          = Math.round(subtotal * 1.12);
    return {
      materials, demo, plumbing, electrical, tileInstall, drywallPaint,
      fixtureInstall, finalPunch, labor, overheadProfit, contingency,
      subtotal, low, high,
    };
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const selectionList = Object.entries(selections).map(([category, sel]) => ({
    category,
    item: sel.item,
    state: sel.state,
    allowance: sel.allowance,
    lineTotal: sel.state === 'placeholder' && sel.allowance ? sel.allowance : calcLineTotal(sel.item, category),
  }));
  const total = selectionList.reduce((sum, s) => sum + s.lineTotal, 0);
  const totalStars = Object.values(stars).reduce((sum, list) => sum + list.length, 0);

  // ── Render ────────────────────────────────────────────────────────────────
  const currentCatalog = CATALOG[step];

  return (
    <>
      <style>{`
        @keyframes msDot { 0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }
        @keyframes msSlideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes msFadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes msPop     { 0% { transform: scale(0.85); opacity: 0; } 60% { transform: scale(1.05); } 100% { transform: scale(1); opacity: 1; } }

        .ms-overlay { position: fixed; inset: 0; z-index: 1000; background: #faf8f3; display: flex; flex-direction: column; font-family: 'DM Sans', sans-serif; }

        /* ── Welcome screen ───────────────────────────────────── */
        .ms-welcome { position: fixed; inset: 0; z-index: 1010; display: flex; flex-direction: column; background: #0A1F44; animation: msFadeIn 0.4s ease; }
        .ms-welcome-hero { flex: 1; min-height: 0; position: relative; overflow: hidden; }
        .ms-welcome-hero img { width: 100%; height: 100%; object-fit: cover; opacity: 0.55; }
        .ms-welcome-hero::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(10,31,68,0.2) 0%, rgba(10,31,68,0.5) 50%, rgba(10,31,68,0.95) 100%); }
        .ms-welcome-close { position: absolute; top: 16px; right: 16px; z-index: 2; background: rgba(0,0,0,0.4); border: none; color: #fff; width: 36px; height: 36px; border-radius: 50%; font-size: 22px; cursor: pointer; backdrop-filter: blur(8px); }
        .ms-welcome-content { background: #0A1F44; padding: 24px 28px 36px; flex-shrink: 0; color: #fff; position: relative; z-index: 2; margin-top: -120px; }
        .ms-welcome-eyebrow { font-size: 11px; font-weight: 700; color: #C9A84C; text-transform: uppercase; letter-spacing: 0.18em; margin-bottom: 10px; }
        .ms-welcome-title { font-family: 'DM Serif Display', serif; font-size: 32px; line-height: 1.1; color: #fff; margin: 0 0 18px; }
        .ms-welcome-title span { color: #C9A84C; }
        .ms-welcome-body { font-size: 15.5px; line-height: 1.65; color: rgba(255,255,255,0.85); margin: 0 0 28px; max-width: 480px; }
        .ms-welcome-body strong { color: #C9A84C; font-weight: 600; }
        .ms-welcome-meta { display: flex; gap: 18px; margin-bottom: 28px; flex-wrap: wrap; }
        .ms-welcome-meta-item { display: flex; flex-direction: column; gap: 2px; }
        .ms-welcome-meta-label { font-size: 10px; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
        .ms-welcome-meta-val { font-size: 14px; color: #fff; font-weight: 600; }
        .ms-welcome-cta { display: block; width: 100%; background: #C9A84C; color: #0A1F44; border: none; border-radius: 14px; padding: 18px 24px; font-size: 16px; font-weight: 700; cursor: pointer; font-family: 'DM Sans', sans-serif; box-shadow: 0 8px 24px rgba(201,168,76,0.35); transition: all 0.15s; }
        .ms-welcome-cta:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(201,168,76,0.45); }
        .ms-welcome-skip { display: block; width: 100%; background: none; border: none; color: rgba(255,255,255,0.55); font-size: 13px; padding: 14px; cursor: pointer; font-family: 'DM Sans', sans-serif; margin-top: 6px; }
        .ms-welcome-skip:hover { color: rgba(255,255,255,0.85); }

        /* ── Header ────────────────────────────────────────────── */
        .ms-header { background: #0A1F44; color: #fff; padding: 16px 20px 14px; flex-shrink: 0; box-shadow: 0 2px 12px rgba(10,31,68,0.18); }
        .ms-header-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .ms-header-info h2 { font-family: 'DM Serif Display', serif; font-size: 18px; margin: 0; color: #fff; line-height: 1.2; }
        .ms-header-info-sub { font-size: 11px; color: rgba(255,255,255,0.65); margin-top: 3px; letter-spacing: 0.02em; }
        .ms-close-btn { background: rgba(255,255,255,0.08); border: none; color: #fff; font-size: 22px; cursor: pointer; width: 36px; height: 36px; border-radius: 50%; line-height: 1; opacity: 0.9; transition: all 0.15s; }
        .ms-close-btn:hover { background: rgba(255,255,255,0.18); opacity: 1; }
        .ms-budget-bar { margin-top: 14px; }
        .ms-budget-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 11px; color: rgba(255,255,255,0.85); margin-bottom: 7px; }
        .ms-budget-row strong { color: #C9A84C; font-size: 13px; font-weight: 700; }
        .ms-budget-track { width: 100%; height: 7px; background: rgba(255,255,255,0.12); border-radius: 4px; overflow: hidden; }
        .ms-budget-fill { height: 100%; background: linear-gradient(90deg, #C9A84C, #e6c876); border-radius: 4px; transition: width 0.5s ease; }
        .ms-step-dots { display: flex; gap: 5px; margin-top: 12px; }
        .ms-step-dot { flex: 1; height: 5px; background: rgba(255,255,255,0.12); border-radius: 3px; transition: background 0.3s; }
        .ms-step-dot.active { background: #C9A84C; }
        .ms-step-dot.done { background: rgba(201,168,76,0.45); }

        /* ── Body / chat ──────────────────────────────────────── */
        .ms-body { flex: 1; overflow-y: auto; padding: 22px 18px 14px; display: flex; flex-direction: column; background: #faf8f3; }
        .ms-chat-list { display: flex; flex-direction: column; gap: 14px; padding-bottom: 8px; max-width: 920px; width: 100%; margin: 0 auto; }
        .ms-bubble { max-width: 88%; padding: 13px 17px; border-radius: 16px; font-size: 15px; line-height: 1.55; word-break: break-word; animation: msSlideUp 0.28s ease; }
        .ms-bubble.assistant { background: #fff; border: 1px solid #ECE7DA; align-self: flex-start; color: #0A1F44; box-shadow: 0 2px 8px rgba(10,31,68,0.04); border-bottom-left-radius: 4px; }
        .ms-bubble.user { background: #0A1F44; color: #fff; align-self: flex-end; border-bottom-right-radius: 4px; }

        .ms-options-grid { display: grid; grid-template-columns: 1fr; gap: 14px; margin: 6px 0 10px; animation: msSlideUp 0.35s ease; }
        @media (min-width: 640px) { .ms-options-grid { grid-template-columns: 1fr 1fr; } }
        @media (min-width: 920px) { .ms-options-grid { grid-template-columns: 1fr 1fr 1fr; } }

        /* ── Product cards ─────────────────────────────────────── */
        .ms-card { background: #fff; border: 1px solid #ECE7DA; border-radius: 18px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 4px 14px rgba(10,31,68,0.06); transition: transform 0.18s ease, box-shadow 0.18s ease; }
        .ms-card:hover { transform: translateY(-3px); box-shadow: 0 10px 28px rgba(10,31,68,0.12); }
        .ms-card-photo-wrap { position: relative; aspect-ratio: 4 / 3; overflow: hidden; background: #ECE7DA; }
        .ms-card-photo-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .ms-card-vendor-badge { position: absolute; top: 12px; left: 12px; background: rgba(255,255,255,0.95); backdrop-filter: blur(6px); color: #0A1F44; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 5px 10px; border-radius: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .ms-card-star-btn { position: absolute; top: 10px; right: 10px; background: rgba(255,255,255,0.95); backdrop-filter: blur(6px); border: none; width: 36px; height: 36px; border-radius: 50%; cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 10px rgba(0,0,0,0.15); transition: all 0.15s; }
        .ms-card-star-btn:hover { transform: scale(1.1); }
        .ms-card-star-btn.starred { background: #C9A84C; }
        .ms-card-body { padding: 16px 18px 18px; display: flex; flex-direction: column; flex: 1; }
        .ms-card-brand { font-size: 11px; font-weight: 700; color: #C9A84C; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }
        .ms-card-name { font-size: 16px; font-weight: 600; color: #0A1F44; line-height: 1.3; margin-bottom: 12px; }
        .ms-card-price-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #F2EEE2; }
        .ms-card-unit-price { font-size: 12px; color: #7a7060; }
        .ms-card-line-total { font-size: 17px; font-weight: 700; color: #0A1F44; }
        .ms-card-line-total span { font-size: 10px; font-weight: 500; color: #7a7060; }
        .ms-card-note { font-size: 12.5px; color: #5a4e38; line-height: 1.5; margin-bottom: 16px; padding: 10px 12px; background: #faf6e8; border-left: 3px solid #C9A84C; border-radius: 6px; }
        .ms-card-actions { display: flex; gap: 8px; margin-top: auto; }
        .ms-card-add { flex: 1; background: #0A1F44; color: #fff; border: none; border-radius: 10px; padding: 12px 14px; font-size: 13.5px; font-weight: 600; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.15s; }
        .ms-card-add:hover { background: #142a55; transform: translateY(-1px); }
        .ms-card-skip { background: none; border: 1.5px solid #E8E4DC; color: #7a7060; border-radius: 10px; padding: 12px 16px; font-size: 13.5px; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.15s; }
        .ms-card-skip:hover { background: #F7F5F0; }

        /* ── Quick reply chips ─────────────────────────────────── */
        .ms-quick-row { display: flex; flex-wrap: wrap; gap: 10px; margin: 6px 0 10px; animation: msSlideUp 0.3s ease; }
        .ms-quick-chip { background: #fff; border: 2px solid #C9A84C; color: #0A1F44; border-radius: 24px; padding: 11px 22px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.15s; }
        .ms-quick-chip:hover { background: #C9A84C; color: #fff; transform: translateY(-2px); box-shadow: 0 6px 18px rgba(201,168,76,0.35); }

        /* ── Floating star + cart bar ─────────────────────────── */
        .ms-star-chip { position: fixed; top: 84px; right: 16px; z-index: 900; background: #fff; border: 2px solid #C9A84C; border-radius: 24px; padding: 8px 14px; display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 700; color: #0A1F44; cursor: pointer; box-shadow: 0 4px 16px rgba(10,31,68,0.12); animation: msPop 0.35s ease; }
        .ms-star-chip:hover { transform: scale(1.05); }
        .ms-cart-bar { background: #0A1F44; color: #fff; padding: 14px 20px; cursor: pointer; flex-shrink: 0; border-top: 2px solid #C9A84C; display: flex; align-items: center; justify-content: space-between; transition: background 0.2s; }
        .ms-cart-bar:hover { background: #142a55; }
        .ms-cart-bar-left { display: flex; align-items: center; gap: 12px; }
        .ms-cart-count { background: #C9A84C; color: #0A1F44; font-weight: 700; font-size: 12px; padding: 3px 9px; border-radius: 14px; min-width: 22px; text-align: center; }
        .ms-cart-bar-text { font-size: 14px; }
        .ms-cart-total { font-size: 16px; font-weight: 700; color: #C9A84C; }

        /* ── Sheets ────────────────────────────────────────────── */
        .ms-backdrop { position: fixed; inset: 0; background: rgba(10,31,68,0.4); backdrop-filter: blur(4px); z-index: 1090; animation: msFadeIn 0.18s ease; }
        .ms-sheet { position: fixed; left: 0; right: 0; bottom: 0; background: #fff; border-top: 3px solid #C9A84C; border-radius: 22px 22px 0 0; padding: 22px 20px 28px; max-height: 85vh; overflow-y: auto; z-index: 1100; box-shadow: 0 -12px 40px rgba(10,31,68,0.25); animation: msSlideUp 0.3s ease; }
        @media (min-width: 640px) { .ms-sheet { left: 50%; right: auto; transform: translateX(-50%); width: 540px; max-width: 92vw; border-radius: 22px; bottom: auto; top: 50%; transform: translate(-50%, -50%); margin-top: 0; } }
        .ms-sheet h3 { font-family: 'DM Serif Display', serif; font-size: 22px; margin: 0 0 6px; color: #0A1F44; }
        .ms-sheet-sub { font-size: 13px; color: #7a7060; margin-bottom: 18px; }
        .ms-sheet-close { position: absolute; top: 14px; right: 14px; background: #F7F5F0; border: none; width: 36px; height: 36px; border-radius: 50%; font-size: 22px; cursor: pointer; color: #5a4e38; }
        .ms-sheet-close:hover { background: #ECE7DA; }

        /* ── Cart items ────────────────────────────────────────── */
        .ms-cart-item { display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid #F0EDE5; align-items: center; }
        .ms-cart-item:last-of-type { border-bottom: none; }
        .ms-cart-item-thumb { width: 56px; height: 56px; border-radius: 10px; overflow: hidden; flex-shrink: 0; background: #ECE7DA; }
        .ms-cart-item-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .ms-cart-item-info { flex: 1; min-width: 0; }
        .ms-cart-item-cat { font-size: 10px; color: #C9A84C; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; margin-bottom: 2px; }
        .ms-cart-item-name { font-size: 13px; color: #0A1F44; font-weight: 600; line-height: 1.3; }
        .ms-cart-item-state { display: inline-block; font-size: 9px; background: #FEF3C7; color: #92400E; padding: 1px 6px; border-radius: 8px; margin-left: 6px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.04em; }
        .ms-cart-item-price { font-size: 15px; font-weight: 700; color: #0A1F44; flex-shrink: 0; }
        .ms-cart-total-row { display: flex; justify-content: space-between; align-items: baseline; padding: 16px 0 4px; border-top: 2px solid #0A1F44; margin-top: 12px; font-weight: 700; font-size: 15px; color: #0A1F44; }
        .ms-cart-total-row strong { color: #C9A84C; font-size: 22px; font-family: 'DM Serif Display', serif; }
        .ms-cart-empty { text-align: center; padding: 40px 20px; color: #7a7060; font-size: 14px; }

        /* ── Done card ────────────────────────────────────────── */
        .ms-done-card { background: #fff; border: 2px solid #C9A84C; border-radius: 18px; padding: 24px; margin: 16px 0; box-shadow: 0 8px 24px rgba(201,168,76,0.18); }
        .ms-done-card h3 { font-family: 'DM Serif Display', serif; font-size: 24px; margin: 0 0 4px; color: #0A1F44; }
        .ms-done-sub { font-size: 13px; color: #7a7060; margin-bottom: 18px; }
        .ms-done-row { display: flex; gap: 12px; padding: 14px 0; align-items: center; border-bottom: 1px solid #F2EEE2; }
        .ms-done-row:last-of-type { border-bottom: none; }
        .ms-done-thumb { width: 64px; height: 64px; border-radius: 12px; overflow: hidden; background: #ECE7DA; flex-shrink: 0; }
        .ms-done-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .ms-done-info { flex: 1; min-width: 0; }
        .ms-done-cat { font-size: 10px; color: #C9A84C; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; }
        .ms-done-name { font-size: 14px; color: #0A1F44; font-weight: 600; }
        .ms-done-price { font-size: 16px; font-weight: 700; color: #0A1F44; flex-shrink: 0; }
        .ms-done-total { display: flex; justify-content: space-between; padding: 18px 0 0; margin-top: 12px; border-top: 2px solid #0A1F44; font-weight: 700; font-size: 16px; color: #0A1F44; }
        .ms-done-total strong { color: #C9A84C; font-size: 26px; font-family: 'DM Serif Display', serif; }
        .ms-done-disclaimer { font-size: 12px; color: #7a7060; margin-top: 12px; line-height: 1.55; padding: 14px; background: #F7F5F0; border-radius: 10px; border-left: 3px solid #C9A84C; }
        .ms-done-btn { background: linear-gradient(135deg, #C9A84C, #e6c876); color: #0A1F44; border: none; border-radius: 12px; padding: 16px; font-size: 16px; font-weight: 700; cursor: pointer; width: 100%; margin-top: 16px; font-family: 'DM Sans', sans-serif; box-shadow: 0 6px 20px rgba(201,168,76,0.35); transition: all 0.15s; }
        .ms-done-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(201,168,76,0.45); }

        /* ── Estimate document ────────────────────────────────── */
        .ms-estimate { background: #fff; border: 1px solid #ECE7DA; border-radius: 16px; overflow: hidden; margin: 14px 0; box-shadow: 0 12px 40px rgba(10,31,68,0.1); }
        .ms-est-header { background: #0A1F44; color: #fff; padding: 22px 24px; border-bottom: 3px solid #C9A84C; }
        .ms-est-eyebrow { font-size: 10px; font-weight: 700; color: #C9A84C; text-transform: uppercase; letter-spacing: 0.18em; margin-bottom: 8px; }
        .ms-est-title { font-family: 'DM Serif Display', serif; font-size: 26px; color: #fff; margin: 0 0 4px; line-height: 1.1; }
        .ms-est-address { font-size: 13px; color: rgba(255,255,255,0.7); margin: 0; }
        .ms-est-body { padding: 20px 22px 22px; }
        .ms-est-section { margin-bottom: 20px; }
        .ms-est-section:last-of-type { margin-bottom: 0; }
        .ms-est-section-h { display: flex; justify-content: space-between; align-items: baseline; font-size: 11px; font-weight: 800; color: #0A1F44; text-transform: uppercase; letter-spacing: 0.1em; padding-bottom: 8px; border-bottom: 1.5px solid #0A1F44; margin-bottom: 10px; }
        .ms-est-section-h strong { font-size: 14px; font-family: 'DM Sans', sans-serif; color: #0A1F44; }
        .ms-est-line { display: flex; justify-content: space-between; padding: 7px 0; font-size: 13px; color: #3a3530; line-height: 1.5; }
        .ms-est-line-label { flex: 1; padding-right: 12px; }
        .ms-est-line-label strong { color: #0A1F44; font-weight: 600; display: block; font-size: 13.5px; }
        .ms-est-line-label span { color: #7a7060; font-size: 11px; }
        .ms-est-line-amt { font-variant-numeric: tabular-nums; color: #0A1F44; font-weight: 600; }
        .ms-est-placeholder { display: inline-block; font-size: 9px; background: #FEF3C7; color: #92400E; padding: 1px 6px; border-radius: 8px; margin-left: 6px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.04em; }
        .ms-est-total-box { background: linear-gradient(135deg, #faf6e8 0%, #fff 100%); border: 2px solid #C9A84C; border-radius: 14px; padding: 18px 20px; margin: 18px 0 14px; }
        .ms-est-total-label { font-size: 11px; font-weight: 700; color: #C9A84C; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 4px; }
        .ms-est-total-range { font-family: 'DM Serif Display', serif; font-size: 32px; color: #0A1F44; line-height: 1.1; }
        .ms-est-total-range span { font-size: 22px; color: #7a7060; margin: 0 8px; }
        .ms-est-total-sub { font-size: 11px; color: #7a7060; margin-top: 4px; }
        .ms-est-disclaimer { font-size: 12px; color: #5a4e38; line-height: 1.6; padding: 14px 16px; background: #F7F5F0; border-radius: 10px; border-left: 3px solid #C9A84C; margin-top: 14px; }
        .ms-est-disclaimer strong { color: #0A1F44; }
        .ms-est-actions { display: flex; flex-direction: column; gap: 10px; padding: 4px 22px 24px; }
        .ms-est-submit { background: linear-gradient(135deg, #C9A84C, #e6c876); color: #0A1F44; border: none; border-radius: 12px; padding: 18px; font-size: 16px; font-weight: 700; cursor: pointer; font-family: 'DM Sans', sans-serif; box-shadow: 0 8px 24px rgba(201,168,76,0.35); transition: all 0.15s; }
        .ms-est-submit:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(201,168,76,0.45); }
        .ms-est-submit:disabled { opacity: 0.6; cursor: not-allowed; }
        .ms-est-success { text-align: center; padding: 30px 20px; }
        .ms-est-success-icon { width: 64px; height: 64px; background: #D1FAE5; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 32px; color: #22c55e; margin-bottom: 14px; animation: msPop 0.4s ease; }
        .ms-est-success h4 { font-family: 'DM Serif Display', serif; font-size: 22px; color: #0A1F44; margin: 0 0 8px; }
        .ms-est-success p { font-size: 14px; color: #5a4e38; line-height: 1.6; margin: 0 0 18px; }
        .ms-est-error { background: #FEE2E2; color: #991B1B; border: 1px solid #FCA5A5; border-radius: 10px; padding: 12px 14px; font-size: 13px; margin: 0 22px 14px; }

        /* ── Allowance picker ─────────────────────────────────── */
        .ms-allowance-options { display: grid; grid-template-columns: 1fr; gap: 10px; margin: 14px 0; }
        .ms-allowance-tier { background: #F7F5F0; border: 2px solid #ECE7DA; border-radius: 12px; padding: 14px 16px; cursor: pointer; text-align: left; transition: all 0.15s; font-family: 'DM Sans', sans-serif; }
        .ms-allowance-tier:hover { border-color: #C9A84C; background: #faf6e8; }
        .ms-allowance-tier-label { font-size: 11px; color: #C9A84C; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
        .ms-allowance-tier-amt { font-size: 22px; font-weight: 700; color: #0A1F44; font-family: 'DM Serif Display', serif; margin-top: 2px; }
        .ms-allowance-tier-desc { font-size: 12px; color: #5a4e38; margin-top: 6px; }
      `}</style>

      {/* ── Welcome screen ──────────────────────────────────────── */}
      {!welcomed && (
        <div className="ms-welcome">
          <div className="ms-welcome-hero">
            <img src={HERO} alt="Bathroom inspiration" />
            <button className="ms-welcome-close" onClick={onClose} aria-label="Close">×</button>
          </div>
          <div className="ms-welcome-content">
            <div className="ms-welcome-eyebrow">Avenstone Designer</div>
            <h1 className="ms-welcome-title">Welcome,<br/><span>{project.client_name}</span></h1>
            <p className="ms-welcome-body">
              I'm here to walk you through every finish for your <strong>{project.project_type.toLowerCase()}</strong> — about 15 minutes. I already have the details from your project intake, so we'll just focus on picking what you love.
            </p>
            <div className="ms-welcome-meta">
              <div className="ms-welcome-meta-item">
                <span className="ms-welcome-meta-label">Project</span>
                <span className="ms-welcome-meta-val">{project.project_type}</span>
              </div>
              <div className="ms-welcome-meta-item">
                <span className="ms-welcome-meta-label">Address</span>
                <span className="ms-welcome-meta-val">{project.address}</span>
              </div>
              <div className="ms-welcome-meta-item">
                <span className="ms-welcome-meta-label">Built</span>
                <span className="ms-welcome-meta-val">{project.year_built}</span>
              </div>
              <div className="ms-welcome-meta-item">
                <span className="ms-welcome-meta-label">Budget</span>
                <span className="ms-welcome-meta-val">{f$(project.budget_low)}–{f$(project.budget_high)}</span>
              </div>
            </div>
            <button className="ms-welcome-cta" onClick={dismissWelcome}>
              Let's design your bathroom →
            </button>
            <button className="ms-welcome-skip" onClick={onClose}>Maybe later</button>
          </div>
        </div>
      )}

      {/* ── Main app ────────────────────────────────────────────── */}
      <div className="ms-overlay" role="dialog" aria-modal="true" aria-label="Material Selection">
        <div className="ms-header">
          <div className="ms-header-row">
            <div className="ms-header-info">
              <h2>Material Selection</h2>
              <div className="ms-header-info-sub">{project.project_type} · {project.address} · Built {project.year_built}</div>
            </div>
            <button className="ms-close-btn" onClick={onClose} aria-label="Close">×</button>
          </div>

          <div className="ms-budget-bar">
            <div className="ms-budget-row">
              <span>Budget {f$(project.budget_low)} – {f$(project.budget_high)}</span>
              <span>Selections <strong>{f$(total)}</strong></span>
            </div>
            <div className="ms-budget-track">
              <div className="ms-budget-fill" style={{ width: `${Math.min(100, (total / project.budget_high) * 100)}%` }} />
            </div>
          </div>

          <div className="ms-step-dots">
            {FLOW.map((s) => {
              const idx = FLOW.indexOf(s);
              const cur = FLOW.indexOf(step);
              return <div key={s} className={`ms-step-dot ${idx === cur ? 'active' : idx < cur ? 'done' : ''}`} title={STEP_LABEL[s]} />;
            })}
          </div>
        </div>

        {/* Floating star chip */}
        {totalStars > 0 && welcomed && (
          <button className="ms-star-chip" onClick={() => setShowStarred(true)}>
            ⭐ <span>{totalStars} starred</span>
          </button>
        )}

        <div className="ms-body">
          <div className="ms-chat-list">
            {messages.map((msg, i) => (
              <div key={i} className={`ms-bubble ${msg.role}`}>{msg.content}</div>
            ))}
            {loading && <div className="ms-bubble assistant"><TypingDots /></div>}

            {/* Vibe chips */}
            {!loading && step === 'vibe' && messages.some((m) => m.content.includes('vibe')) && (
              <div className="ms-quick-row">
                {['Modern', 'Transitional', 'Traditional'].map((v) => (
                  <button key={v} className="ms-quick-chip" onClick={() => pickVibe(v)}>{v}</button>
                ))}
              </div>
            )}

            {/* Allowance pivot chips */}
            {!loading && allowanceOffered[step] && !selections[step] && !showAllowancePicker && (
              <div className="ms-quick-row">
                <button className="ms-quick-chip" onClick={() => acceptAllowancePivot(step)}>Set an allowance</button>
                <button className="ms-quick-chip" onClick={() => declineAllowancePivot(step)}>Keep looking</button>
              </div>
            )}

            {/* Product cards */}
            {!loading && currentCatalog && messages.some((m) => m.content.toLowerCase().includes(step)) && !selections[step] && (
              <div className="ms-options-grid">
                {currentCatalog.map((item) => {
                  const lineTotal = calcLineTotal(item, step);
                  const qty = APPROX_QTY[step]?.qty || 1;
                  const unit = APPROX_QTY[step]?.unit || '';
                  const starred = isStarred(step, item);
                  return (
                    <div key={item.id} className="ms-card">
                      <div className="ms-card-photo-wrap">
                        <img src={item.photo} alt={item.name} loading="lazy" />
                        <div className="ms-card-vendor-badge">{item.vendor}</div>
                        <button
                          className={`ms-card-star-btn ${starred ? 'starred' : ''}`}
                          onClick={() => toggleStar(step, item)}
                          aria-label={starred ? 'Unstar' : 'Star'}
                        >
                          {starred ? '⭐' : '☆'}
                        </button>
                      </div>
                      <div className="ms-card-body">
                        <div className="ms-card-brand">{item.brand}</div>
                        <div className="ms-card-name">{item.name}</div>
                        <div className="ms-card-price-row">
                          <span className="ms-card-unit-price">${item.price}/{item.unit}</span>
                          <span className="ms-card-line-total">{f$(lineTotal)} <span>· {qty} {unit}</span></span>
                        </div>
                        <div className="ms-card-note">{item.note}</div>
                        <div className="ms-card-actions">
                          <button className="ms-card-add" onClick={() => selectItem(step, item)}>Add to selections</button>
                          <button className="ms-card-skip" onClick={() => skipCategory(step)}>Skip</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Done state — real estimate document */}
            {!loading && step === 'done' && (
              <EstimateDocument
                project={project}
                selectionList={selectionList}
                total={total}
                estimate={buildEstimate(total, project)}
                submitting={submitting}
                submitted={submitted}
                submitError={submitError}
                onSubmit={sendToAvenstone}
                onClose={onClose}
              />
            )}

            <div ref={msgsEndRef} />
          </div>
        </div>

        {/* Cart bar */}
        {welcomed && (
          <div className="ms-cart-bar" onClick={() => setShowCart((v) => !v)}>
            <div className="ms-cart-bar-left">
              <span className="ms-cart-count">{selectionList.length}</span>
              <span className="ms-cart-bar-text">{selectionList.length === 0 ? 'No selections yet' : `${selectionList.length} item${selectionList.length === 1 ? '' : 's'} selected`}</span>
            </div>
            <div className="ms-cart-total">{f$(total)}</div>
          </div>
        )}

        {/* Cart sheet */}
        {showCart && (
          <>
            <div className="ms-backdrop" onClick={() => setShowCart(false)} />
            <div className="ms-sheet">
              <button className="ms-sheet-close" onClick={() => setShowCart(false)}>×</button>
              <h3>Your Selections</h3>
              <div className="ms-sheet-sub">Tap a category in the chat above to swap it out</div>
              {selectionList.length === 0 ? (
                <div className="ms-cart-empty">Nothing selected yet. Pick something to get started!</div>
              ) : (
                <>
                  {selectionList.map((s) => (
                    <div key={s.category} className="ms-cart-item">
                      <div className="ms-cart-item-thumb"><img src={s.item.photo} alt={s.item.name} /></div>
                      <div className="ms-cart-item-info">
                        <div className="ms-cart-item-cat">{s.category}</div>
                        <div className="ms-cart-item-name">{s.item.brand} {s.item.name}{s.state === 'placeholder' && <span className="ms-cart-item-state">placeholder</span>}</div>
                      </div>
                      <div className="ms-cart-item-price">{f$(s.lineTotal)}</div>
                    </div>
                  ))}
                  <div className="ms-cart-total-row">
                    <span>Total</span>
                    <strong>{f$(total)}</strong>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* Starred sheet */}
        {showStarred && (
          <>
            <div className="ms-backdrop" onClick={() => setShowStarred(false)} />
            <div className="ms-sheet">
              <button className="ms-sheet-close" onClick={() => setShowStarred(false)}>×</button>
              <h3>Your Starred Items</h3>
              <div className="ms-sheet-sub">{totalStars} item{totalStars === 1 ? '' : 's'} saved across categories</div>
              {totalStars === 0 ? (
                <div className="ms-cart-empty">Tap the ⭐ on any product card to save it here for later.</div>
              ) : (
                Object.entries(stars).map(([cat, items]) =>
                  items.length > 0 && (
                    <div key={cat} style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#C9A84C', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{cat} ({items.length})</div>
                      {items.map((it) => (
                        <div key={it.id} className="ms-cart-item">
                          <div className="ms-cart-item-thumb"><img src={it.photo} alt={it.name} /></div>
                          <div className="ms-cart-item-info">
                            <div className="ms-cart-item-name">{it.brand} {it.name}</div>
                            <div style={{ fontSize: 12, color: '#7a7060', marginTop: 2 }}>${it.price}/{it.unit}</div>
                          </div>
                          <div className="ms-cart-item-price">{f$(calcLineTotal(it, cat))}</div>
                        </div>
                      ))}
                    </div>
                  )
                )
              )}
            </div>
          </>
        )}

        {/* Allowance picker sheet */}
        {showAllowancePicker && (
          <>
            <div className="ms-backdrop" onClick={() => setShowAllowancePicker(null)} />
            <div className="ms-sheet">
              <button className="ms-sheet-close" onClick={() => setShowAllowancePicker(null)}>×</button>
              <h3>Set a {showAllowancePicker} allowance</h3>
              <div className="ms-sheet-sub">Pick a budget tier. We'll lock in the dollar amount and use one of your starred items as the placeholder. You can refine the exact pick anytime before we order.</div>
              <div className="ms-allowance-options">
                {(() => {
                  const cat = showAllowancePicker;
                  const candidates = stars[cat] && stars[cat].length > 0 ? stars[cat] : CATALOG[cat];
                  const tiers = [
                    { label: 'Budget', mult: 0.7,  desc: 'Stretch your dollars further' },
                    { label: 'Mid',    mult: 1.0,  desc: 'Most popular for your project size' },
                    { label: 'Premium',mult: 1.4,  desc: 'Designer-level finishes' },
                  ];
                  // Use first candidate as the anchor item
                  const anchor = candidates[0];
                  const baseTotal = calcLineTotal(anchor, cat);
                  return tiers.map((tier) => {
                    const amt = Math.round(baseTotal * tier.mult);
                    return (
                      <button
                        key={tier.label}
                        className="ms-allowance-tier"
                        onClick={() => lockAllowance(cat, anchor, amt)}
                      >
                        <div className="ms-allowance-tier-label">{tier.label}</div>
                        <div className="ms-allowance-tier-amt">{f$(amt)}</div>
                        <div className="ms-allowance-tier-desc">{tier.desc}</div>
                      </button>
                    );
                  });
                })()}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EstimateDocument — real construction-estimate format
// ─────────────────────────────────────────────────────────────────────────────
function EstimateDocument({ project, selectionList, total, estimate, submitting, submitted, submitError, onSubmit, onClose }) {
  if (submitted) {
    return (
      <div className="ms-estimate">
        <div className="ms-est-success">
          <div className="ms-est-success-icon">✓</div>
          <h4>Sent to Avenstone</h4>
          <p>
            Your selections and draft estimate are on their way. You&apos;ll get a recap email within a few minutes with everything laid out, and our team will reach out within 24 hours to confirm next steps.
          </p>
          <button className="ms-est-submit" style={{ maxWidth: 280 }} onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  if (selectionList.length === 0) {
    return (
      <div className="ms-estimate" style={{ padding: 24, textAlign: 'center' }}>
        <div style={{ color: '#7a7060', fontSize: 14 }}>You skipped everything! Close and try again.</div>
      </div>
    );
  }

  return (
    <div className="ms-estimate">
      <div className="ms-est-header">
        <div className="ms-est-eyebrow">Preliminary Estimate</div>
        <h3 className="ms-est-title">{project.project_type}</h3>
        <p className="ms-est-address">
          {project.address}
          {project.year_built ? ` · Built ${project.year_built}` : ''}
          {project.sqft ? ` · ${project.sqft} sf` : ''}
        </p>
      </div>

      <div className="ms-est-body">
        {/* MATERIALS section */}
        <div className="ms-est-section">
          <div className="ms-est-section-h">
            <span>Materials</span>
            <strong>{f$(estimate.materials)}</strong>
          </div>
          {selectionList.map((s) => (
            <div key={s.category} className="ms-est-line">
              <div className="ms-est-line-label">
                <strong style={{ textTransform: 'capitalize' }}>
                  {s.category}
                  {s.state === 'placeholder' && <span className="ms-est-placeholder">allowance</span>}
                </strong>
                <span>{s.item.brand} · {s.item.name} · {s.item.vendor}</span>
              </div>
              <div className="ms-est-line-amt">{f$(s.lineTotal)}</div>
            </div>
          ))}
        </div>

        {/* LABOR section */}
        <div className="ms-est-section">
          <div className="ms-est-section-h">
            <span>Labor</span>
            <strong>{f$(estimate.labor)}</strong>
          </div>
          <div className="ms-est-line"><div className="ms-est-line-label"><strong>Demo &amp; disposal</strong></div><div className="ms-est-line-amt">{f$(estimate.demo)}</div></div>
          <div className="ms-est-line"><div className="ms-est-line-label"><strong>Plumbing rough-in</strong></div><div className="ms-est-line-amt">{f$(estimate.plumbing)}</div></div>
          <div className="ms-est-line"><div className="ms-est-line-label"><strong>Electrical</strong></div><div className="ms-est-line-amt">{f$(estimate.electrical)}</div></div>
          <div className="ms-est-line"><div className="ms-est-line-label"><strong>Tile installation</strong></div><div className="ms-est-line-amt">{f$(estimate.tileInstall)}</div></div>
          <div className="ms-est-line"><div className="ms-est-line-label"><strong>Drywall &amp; paint</strong></div><div className="ms-est-line-amt">{f$(estimate.drywallPaint)}</div></div>
          <div className="ms-est-line"><div className="ms-est-line-label"><strong>Vanity &amp; fixture install</strong></div><div className="ms-est-line-amt">{f$(estimate.fixtureInstall)}</div></div>
          <div className="ms-est-line"><div className="ms-est-line-label"><strong>Final &amp; punch</strong></div><div className="ms-est-line-amt">{f$(estimate.finalPunch)}</div></div>
        </div>

        {/* OVERHEAD + CONTINGENCY */}
        <div className="ms-est-section">
          <div className="ms-est-section-h">
            <span>Overhead, Profit &amp; Contingency</span>
            <strong>{f$(estimate.overheadProfit + estimate.contingency)}</strong>
          </div>
          <div className="ms-est-line"><div className="ms-est-line-label"><strong>Overhead &amp; profit</strong><span>Project management, insurance, fees</span></div><div className="ms-est-line-amt">{f$(estimate.overheadProfit)}</div></div>
          <div className="ms-est-line"><div className="ms-est-line-label"><strong>Contingency</strong><span>10% for variable conditions</span></div><div className="ms-est-line-amt">{f$(estimate.contingency)}</div></div>
        </div>

        {/* TOTAL */}
        <div className="ms-est-total-box">
          <div className="ms-est-total-label">Estimated Range</div>
          <div className="ms-est-total-range">
            {f$(estimate.low)}<span>—</span>{f$(estimate.high)}
          </div>
          <div className="ms-est-total-sub">Includes all materials, labor, overhead, and contingency for the scope above.</div>
        </div>

        <div className="ms-est-disclaimer">
          <strong>A note on the range.</strong> This number is built from your scan, your selections, and our pricing database — no site visit required. Once your project kicks off, if anything changes scope (you decide to add a feature, or we need to swap a material), we&apos;ll walk you through any change orders and updated numbers <strong>before</strong> any work happens. You&apos;re never surprised.
        </div>
      </div>

      {submitError && <div className="ms-est-error">{submitError}</div>}

      <div className="ms-est-actions">
        <button className="ms-est-submit" onClick={onSubmit} disabled={submitting}>
          {submitting ? 'Sending…' : 'Send to Avenstone →'}
        </button>
      </div>
    </div>
  );
}
