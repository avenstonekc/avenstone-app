import { useState, useEffect, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Material Selection — v1.0 (skeleton)
// Pure UI demo. Hardcoded HD/Lowes catalog. Scripted "AI" responses.
// Real AI swap-in lands in v1.0.2 (see docs/MATERIAL_SELECTION.md).
// ─────────────────────────────────────────────────────────────────────────────

// Hardcoded sample HD/Lowes products. Replaced by Supabase `materials` table in v1.0.1.
const CATALOG = {
  tile: [
    { id: 'tile-1', brand: 'Daltile',          name: 'Restore 12x24 Matte White',          vendor: 'Home Depot', price: 1.99, unit: 'sf',  vibe: 'modern',       color: '#f5f5f0', note: 'Larger format hides the slight floor unevenness common in 1962 homes like yours.' },
    { id: 'tile-2', brand: 'Marazzi',          name: 'Studio Life 12x24 Park Avenue',      vendor: 'Home Depot', price: 3.49, unit: 'sf',  vibe: 'modern',       color: '#d4d0c8', note: 'Warm neutral that hides water spots better than pure white. Most popular pick.' },
    { id: 'tile-3', brand: 'Style Selections', name: 'Mitte Gray 12x24 Porcelain',         vendor: 'Lowes',      price: 2.49, unit: 'sf',  vibe: 'modern',       color: '#a8a8a0', note: 'Budget pick that still looks high-end. Holds up well in wet areas.' },
  ],
  vanity: [
    { id: 'van-1',  brand: 'Glacier Bay',      name: 'Hampton 36" Vanity — White',         vendor: 'Home Depot', price: 499,  unit: 'each', vibe: 'transitional', color: '#fafaf5', note: 'Soft-close drawers, marble-look top included. Great value for the price.' },
    { id: 'van-2',  brand: 'Style Selections', name: 'Westcourt 36" Vanity — Gray',        vendor: 'Lowes',      price: 599,  unit: 'each', vibe: 'modern',       color: '#7a7060', note: 'Modern lines with a quartz top. Pairs well with the Marazzi tile.' },
    { id: 'van-3',  brand: 'Home Decorators',  name: 'Sonoma 36" Vanity — Espresso',       vendor: 'Home Depot', price: 649,  unit: 'each', vibe: 'traditional',  color: '#3d2817', note: 'Solid wood, traditional profile. Best fit if you want a warmer, classic look.' },
  ],
  faucet: [
    { id: 'fau-1',  brand: 'Moen',             name: 'Adler Centerset — Chrome',           vendor: 'Home Depot', price: 89,   unit: 'each', color: '#c0c0c0',     note: 'Reliable, easy to clean, lifetime warranty. Most common choice for the budget.' },
    { id: 'fau-2',  brand: 'Pfister',          name: 'Pasadena Single-Handle — Brushed',   vendor: 'Home Depot', price: 129,  unit: 'each', color: '#9d9b95',     note: 'Brushed nickel hides fingerprints. Nice mid-tier upgrade.' },
    { id: 'fau-3',  brand: 'Delta',            name: 'Foundations Two-Handle — Chrome',    vendor: 'Lowes',      price: 69,   unit: 'each', color: '#c0c0c0',     note: 'Budget pick. Two-handle is more traditional but still works in modern baths.' },
  ],
  lighting: [
    { id: 'lig-1',  brand: 'Hampton Bay',      name: '3-Light Vanity — Brushed Nickel',    vendor: 'Home Depot', price: 59,   unit: 'each', color: '#9d9b95',     note: 'Standard 3-bulb vanity bar. Goes with anything.' },
    { id: 'lig-2',  brand: 'Globe Electric',   name: 'Holden 4-Light — Matte Black',       vendor: 'Home Depot', price: 149,  unit: 'each', color: '#1a1a1a',     note: 'Black hardware is having a moment. Modern statement piece.' },
    { id: 'lig-3',  brand: 'Project Source',   name: '3-Light Vanity — Chrome',            vendor: 'Lowes',      price: 39,   unit: 'each', color: '#c0c0c0',     note: 'Budget pick, still UL-listed. Hard to beat the price.' },
  ],
  paint: [
    { id: 'pai-1',  brand: 'Behr',             name: 'Premium Plus Eggshell — Polar Bear', vendor: 'Home Depot', price: 34,   unit: 'gallon', color: '#f5f0e8',  note: 'Soft warm white. Eggshell wipes clean, perfect for bathrooms.' },
    { id: 'pai-2',  brand: 'Valspar',          name: 'Reserve Eggshell — Du Jour',         vendor: 'Lowes',      price: 39,   unit: 'gallon', color: '#e8dcc8',  note: 'Light cream — adds warmth without going yellow.' },
    { id: 'pai-3',  brand: 'Behr',             name: 'Marquee Satin — Ultra Pure White',   vendor: 'Home Depot', price: 47,   unit: 'gallon', color: '#fafafa',  note: 'Crisp pure white. Satin handles bathroom moisture better than eggshell.' },
  ],
};

// Approximate quantities based on a typical 85 sf master bath.
// In v1.0.1 these come from the actual room scan dimensions.
const APPROX_QTY = {
  tile:     { qty: 200, unit: 'sf' },     // floor + wet walls
  vanity:   { qty: 1,   unit: 'each' },
  faucet:   { qty: 1,   unit: 'each' },
  lighting: { qty: 1,   unit: 'each' },
  paint:    { qty: 2,   unit: 'gallon' }, // walls + ceiling
};

// Scripted flow steps, in order
const FLOW = ['greeting', 'vibe', 'tile', 'vanity', 'faucet', 'lighting', 'paint', 'done'];

const STEP_LABEL = {
  greeting: 'Welcome',
  vibe:     'Style',
  tile:     'Tile',
  vanity:   'Vanity',
  faucet:   'Faucet',
  lighting: 'Lighting',
  paint:    'Paint',
  done:     'Done',
};

const PROJECT_FAKE = {
  client_name:  'Sarah',
  address:      '1234 Maple Dr',
  year_built:   1962,
  project_type: 'Master Bath Remodel',
  sqft:         85,
  budget_low:   42000,
  budget_high:  58000,
};

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '10px 14px' }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#C9A84C', display: 'inline-block', animation: 'msDot 1.2s infinite', animationDelay: `${i * 0.2}s` }} />
      ))}
    </div>
  );
}

function ProductSwatch({ color, label }) {
  // Visual placeholder for product photo. Real photos land in v1.0.1.
  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '4 / 3',
        background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'flex-start',
        padding: 8,
        marginBottom: 10,
        border: '1px solid #E8E4DC',
      }}
    >
      <span style={{ fontSize: 10, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
        {label}
      </span>
    </div>
  );
}

function calcLineTotal(item, category) {
  const q = APPROX_QTY[category]?.qty || 1;
  return item.price * q;
}

function f$(n) {
  return `$${Math.round(n).toLocaleString()}`;
}

export default function MaterialSelectionScr({ onClose }) {
  const [step, setStep] = useState('greeting');
  const [messages, setMessages] = useState([]);
  const [selections, setSelections] = useState({}); // { tile: itemObj, vanity: itemObj, ... }
  const [vibe, setVibe] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const msgsEndRef = useRef();

  // Push initial greeting on mount
  useEffect(() => {
    pushAssistant(
      `Hi ${PROJECT_FAKE.client_name}! I'm your Avenstone material assistant. I'll walk you through picking finishes for your ${PROJECT_FAKE.project_type.toLowerCase()} — about 15 minutes.`
    );
    setTimeout(() => {
      pushAssistant("Ready to get started?");
    }, 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (msgsEndRef.current) msgsEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

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

  // ── Step handlers ─────────────────────────────────────────────────────────
  function startFlow() {
    pushUser("Let's go");
    setStep('vibe');
    pushAssistantWithDelay(
      "Great. First — what's the overall vibe you're going for? This helps me narrow down the options."
    );
  }

  function pickVibe(label) {
    setVibe(label);
    pushUser(label);
    setStep('tile');
    pushAssistantWithDelay(
      `Got it — ${label.toLowerCase()}. Let's start with tile, that's the biggest visual decision. Here are 3 I think would work for your bath, all in your budget:`
    );
  }

  function selectItem(category, item) {
    setSelections((prev) => ({ ...prev, [category]: item }));
    pushUser(`Selected ${item.brand} ${item.name}`);
    const lineTotal = calcLineTotal(item, category);
    pushAssistantWithDelay(
      `✓ Added. ${f$(lineTotal)} for your ${category}. ${item.note}`,
      500
    );
    advance();
  }

  function skipCategory(category) {
    pushUser(`Skip ${category}`);
    advance();
  }

  function advance() {
    const idx = FLOW.indexOf(step);
    const next = FLOW[idx + 1];
    if (!next) return;
    setStep(next);
    setTimeout(() => {
      const intros = {
        vanity:   "Now let's pick a vanity. Three options that fit the style you picked:",
        faucet:   "Faucets next. These are all highly rated and easy to clean:",
        lighting: "Vanity lighting — this is where the bathroom really comes together:",
        paint:    "Last big decision: paint. Eggshell or satin both work in bathrooms — satin is slightly more moisture-resistant:",
        done:     "That's everything! Here's a summary of your selections.",
      };
      if (intros[next]) pushAssistantWithDelay(intros[next], 800);
    }, 600);
  }

  function sendToAvenstone() {
    pushUser('Send to Avenstone');
    pushAssistantWithDelay(
      `All sent, ${PROJECT_FAKE.client_name}! You'll get a recap email with your selections + a draft estimate within a few minutes. Kalin will reach out within 24 hours.`,
      900
    );
  }

  // ── Computed totals ───────────────────────────────────────────────────────
  const selectionList = Object.entries(selections).map(([category, item]) => ({
    category,
    item,
    lineTotal: calcLineTotal(item, category),
  }));
  const total = selectionList.reduce((sum, s) => sum + s.lineTotal, 0);

  // ── Render ────────────────────────────────────────────────────────────────
  const currentCatalog = CATALOG[step];

  return (
    <>
      <style>{`
        @keyframes msDot { 0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }
        @keyframes msSlideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .ms-overlay { position: fixed; inset: 0; z-index: 1000; background: #fff; display: flex; flex-direction: column; font-family: 'DM Sans', sans-serif; }
        .ms-header { background: #0A1F44; color: #fff; padding: 14px 18px; flex-shrink: 0; }
        .ms-header-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .ms-header h2 { font-family: 'DM Serif Display', serif; font-size: 17px; margin: 0; color: #fff; line-height: 1.2; }
        .ms-header-sub { font-size: 11px; color: rgba(255,255,255,0.7); margin-top: 2px; }
        .ms-close-btn { background: none; border: none; color: #fff; font-size: 22px; cursor: pointer; padding: 4px 10px; border-radius: 6px; line-height: 1; opacity: 0.85; }
        .ms-close-btn:hover { opacity: 1; background: rgba(255,255,255,0.08); }
        .ms-budget-bar { margin-top: 12px; }
        .ms-budget-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 11px; color: rgba(255,255,255,0.85); margin-bottom: 6px; }
        .ms-budget-row strong { color: #C9A84C; font-size: 13px; font-weight: 700; }
        .ms-budget-track { width: 100%; height: 6px; background: rgba(255,255,255,0.15); border-radius: 3px; overflow: hidden; }
        .ms-budget-fill { height: 100%; background: linear-gradient(90deg, #C9A84C, #d9b85a); border-radius: 3px; transition: width 0.4s ease; }
        .ms-step-dots { display: flex; gap: 4px; margin-top: 10px; }
        .ms-step-dot { flex: 1; height: 4px; background: rgba(255,255,255,0.15); border-radius: 2px; transition: background 0.3s; }
        .ms-step-dot.active { background: #C9A84C; }
        .ms-step-dot.done { background: rgba(201,168,76,0.5); }
        .ms-body { flex: 1; overflow-y: auto; padding: 18px 16px 8px; display: flex; flex-direction: column; background: #fafaf7; }
        .ms-chat-list { display: flex; flex-direction: column; gap: 12px; padding-bottom: 8px; }
        .ms-bubble { max-width: 86%; padding: 11px 15px; border-radius: 12px; font-size: 14.5px; line-height: 1.5; word-break: break-word; animation: msSlideUp 0.25s ease; }
        .ms-bubble.assistant { background: #fff; border: 1px solid #E8E4DC; align-self: flex-start; color: #0A1F44; }
        .ms-bubble.user { background: #0A1F44; color: #fff; align-self: flex-end; }
        .ms-options-row { display: grid; grid-template-columns: 1fr; gap: 12px; margin: 4px 0 8px; }
        @media (min-width: 600px) { .ms-options-row { grid-template-columns: 1fr 1fr 1fr; } }
        .ms-card { background: #fff; border: 1.5px solid #E8E4DC; border-radius: 14px; padding: 14px; animation: msSlideUp 0.3s ease; display: flex; flex-direction: column; }
        .ms-card-brand { font-size: 11px; font-weight: 700; color: #C9A84C; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 2px; }
        .ms-card-name { font-size: 15px; font-weight: 600; color: #0A1F44; line-height: 1.3; margin-bottom: 6px; }
        .ms-card-vendor { display: inline-block; font-size: 10px; font-weight: 600; color: #5a4e38; background: #F7F5F0; border: 1px solid #E8E4DC; border-radius: 12px; padding: 2px 8px; margin-bottom: 8px; align-self: flex-start; }
        .ms-card-price { font-size: 13px; color: #0A1F44; margin-bottom: 4px; }
        .ms-card-price strong { font-size: 16px; color: #0A1F44; }
        .ms-card-note { font-size: 12px; color: #5a4e38; line-height: 1.45; margin: 8px 0 12px; padding: 8px 10px; background: #F7F5F0; border-left: 2px solid #C9A84C; border-radius: 4px; }
        .ms-card-actions { display: flex; gap: 8px; margin-top: auto; }
        .ms-card-add { flex: 1; background: #0A1F44; color: #fff; border: none; border-radius: 8px; padding: 10px 12px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: opacity 0.15s; }
        .ms-card-add:hover { opacity: 0.88; }
        .ms-card-skip { background: none; border: 1px solid #E8E4DC; color: #5a4e38; border-radius: 8px; padding: 10px 12px; font-size: 13px; cursor: pointer; font-family: 'DM Sans', sans-serif; }
        .ms-quick-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 8px; }
        .ms-quick-chip { background: #fff; border: 1.5px solid #C9A84C; color: #0A1F44; border-radius: 22px; padding: 9px 18px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.15s; }
        .ms-quick-chip:hover { background: #C9A84C; color: #fff; }
        .ms-cart-bar { background: #0A1F44; color: #fff; padding: 12px 18px; cursor: pointer; flex-shrink: 0; border-top: 2px solid #C9A84C; display: flex; align-items: center; justify-content: space-between; }
        .ms-cart-bar-left { display: flex; align-items: center; gap: 10px; }
        .ms-cart-count { background: #C9A84C; color: #0A1F44; font-weight: 700; font-size: 12px; padding: 2px 8px; border-radius: 12px; }
        .ms-cart-total { font-size: 14px; font-weight: 600; }
        .ms-cart-sheet { position: fixed; left: 0; right: 0; bottom: 0; background: #fff; border-top: 2px solid #C9A84C; border-radius: 16px 16px 0 0; padding: 18px; max-height: 70vh; overflow-y: auto; z-index: 1100; box-shadow: 0 -8px 32px rgba(10,31,68,0.2); animation: msSlideUp 0.25s ease; }
        .ms-cart-sheet h3 { font-family: 'DM Serif Display', serif; font-size: 18px; margin: 0 0 14px; color: #0A1F44; }
        .ms-cart-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #E8E4DC; }
        .ms-cart-item:last-of-type { border-bottom: none; }
        .ms-cart-item-name { font-size: 13px; color: #0A1F44; font-weight: 600; }
        .ms-cart-item-cat { font-size: 10px; color: #7a7060; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }
        .ms-cart-item-price { font-size: 14px; font-weight: 700; color: #0A1F44; }
        .ms-cart-total-row { display: flex; justify-content: space-between; align-items: baseline; padding: 12px 0 4px; border-top: 2px solid #0A1F44; margin-top: 8px; font-weight: 700; font-size: 16px; color: #0A1F44; }
        .ms-cart-total-row strong { color: #C9A84C; font-size: 18px; }
        .ms-cart-empty { text-align: center; padding: 40px 20px; color: #7a7060; font-size: 13px; }
        .ms-done-card { background: #fff; border: 2px solid #C9A84C; border-radius: 14px; padding: 22px; margin: 12px 0; }
        .ms-done-card h3 { font-family: 'DM Serif Display', serif; font-size: 19px; margin: 0 0 12px; color: #0A1F44; }
        .ms-done-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13.5px; color: #0A1F44; border-bottom: 1px solid #F0EDE5; }
        .ms-done-row:last-of-type { border-bottom: none; }
        .ms-done-total { display: flex; justify-content: space-between; padding: 12px 0 0; margin-top: 8px; border-top: 2px solid #0A1F44; font-weight: 700; font-size: 16px; color: #0A1F44; }
        .ms-done-total strong { color: #C9A84C; font-size: 19px; }
        .ms-done-btn { background: #C9A84C; color: #fff; border: none; border-radius: 10px; padding: 14px; font-size: 15px; font-weight: 700; cursor: pointer; width: 100%; margin-top: 14px; font-family: 'DM Sans', sans-serif; }
        .ms-done-btn:hover { opacity: 0.9; }
        .ms-banner { background: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 10px 14px; font-size: 12px; color: #92400E; margin-bottom: 12px; }
      `}</style>

      <div className="ms-overlay" role="dialog" aria-modal="true" aria-label="Material Selection">
        {/* Header */}
        <div className="ms-header">
          <div className="ms-header-row">
            <div>
              <h2>Material Selection</h2>
              <div className="ms-header-sub">{PROJECT_FAKE.project_type} · {PROJECT_FAKE.address} · Built {PROJECT_FAKE.year_built}</div>
            </div>
            <button className="ms-close-btn" onClick={onClose} aria-label="Close">×</button>
          </div>

          <div className="ms-budget-bar">
            <div className="ms-budget-row">
              <span>Project budget {f$(PROJECT_FAKE.budget_low)} – {f$(PROJECT_FAKE.budget_high)}</span>
              <span>Selections so far <strong>{f$(total)}</strong></span>
            </div>
            <div className="ms-budget-track">
              <div
                className="ms-budget-fill"
                style={{ width: `${Math.min(100, (total / PROJECT_FAKE.budget_high) * 100)}%` }}
              />
            </div>
          </div>

          <div className="ms-step-dots">
            {FLOW.map((s) => {
              const idx = FLOW.indexOf(s);
              const cur = FLOW.indexOf(step);
              return (
                <div
                  key={s}
                  className={`ms-step-dot ${idx === cur ? 'active' : idx < cur ? 'done' : ''}`}
                  title={STEP_LABEL[s]}
                />
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="ms-body">
          <div className="ms-banner">
            Demo build (v1.0) — scripted responses, hardcoded sample HD/Lowes products. Real AI + DB persistence + product photos land in v1.0.1+.
          </div>

          <div className="ms-chat-list">
            {messages.map((msg, i) => (
              <div key={i} className={`ms-bubble ${msg.role}`}>{msg.content}</div>
            ))}

            {loading && <div className="ms-bubble assistant"><TypingDots /></div>}

            {/* Quick reply chips per step */}
            {!loading && step === 'greeting' && messages.length >= 2 && (
              <div className="ms-quick-row">
                <button className="ms-quick-chip" onClick={startFlow}>Let&apos;s go</button>
                <button className="ms-quick-chip" onClick={onClose}>Maybe later</button>
              </div>
            )}

            {!loading && step === 'vibe' && messages.some((m) => m.content.includes('vibe')) && (
              <div className="ms-quick-row">
                {['Modern', 'Transitional', 'Traditional'].map((v) => (
                  <button key={v} className="ms-quick-chip" onClick={() => pickVibe(v)}>{v}</button>
                ))}
              </div>
            )}

            {/* Product option cards */}
            {!loading && currentCatalog && messages.some((m) => m.content.toLowerCase().includes(step)) && (
              <div className="ms-options-row">
                {currentCatalog.map((item) => {
                  const lineTotal = calcLineTotal(item, step);
                  const qty = APPROX_QTY[step]?.qty || 1;
                  const unit = APPROX_QTY[step]?.unit || '';
                  return (
                    <div key={item.id} className="ms-card">
                      <ProductSwatch color={item.color} label={item.brand} />
                      <div className="ms-card-brand">{item.brand}</div>
                      <div className="ms-card-name">{item.name}</div>
                      <div className="ms-card-vendor">{item.vendor}</div>
                      <div className="ms-card-price">
                        ${item.price}/{item.unit} · ≈ <strong>{f$(lineTotal)}</strong> for your room
                        <div style={{ fontSize: 11, color: '#7a7060', marginTop: 2 }}>
                          ({qty} {unit})
                        </div>
                      </div>
                      <div className="ms-card-note">{item.note}</div>
                      <div className="ms-card-actions">
                        <button className="ms-card-add" onClick={() => selectItem(step, item)}>
                          Add to selections
                        </button>
                        <button className="ms-card-skip" onClick={() => skipCategory(step)}>Skip</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Done state */}
            {!loading && step === 'done' && (
              <div className="ms-done-card">
                <h3>Your Selections</h3>
                {selectionList.length === 0 ? (
                  <div style={{ color: '#7a7060', fontSize: 13, padding: '8px 0' }}>You skipped everything! Hit close and try again.</div>
                ) : (
                  selectionList.map((s) => (
                    <div key={s.category} className="ms-done-row">
                      <span>
                        <strong style={{ textTransform: 'capitalize' }}>{s.category}</strong> · {s.item.brand} {s.item.name}
                      </span>
                      <span>{f$(s.lineTotal)}</span>
                    </div>
                  ))
                )}
                {selectionList.length > 0 && (
                  <>
                    <div className="ms-done-total">
                      <span>Selections subtotal</span>
                      <strong>{f$(total)}</strong>
                    </div>
                    <div style={{ fontSize: 11, color: '#7a7060', marginTop: 6, lineHeight: 1.5 }}>
                      Final estimate range will land in your inbox in a few minutes. Remember — we can&apos;t quote what we can&apos;t see, so the final number depends on what we find behind the walls. Our team will walk you through any change orders before any work happens.
                    </div>
                    <button className="ms-done-btn" onClick={sendToAvenstone}>Send to Avenstone →</button>
                  </>
                )}
              </div>
            )}

            <div ref={msgsEndRef} />
          </div>
        </div>

        {/* Cart bar (always visible) */}
        <div className="ms-cart-bar" onClick={() => setShowCart((v) => !v)}>
          <div className="ms-cart-bar-left">
            <span className="ms-cart-count">{selectionList.length}</span>
            <span>{selectionList.length === 0 ? 'No selections yet' : `${selectionList.length} item${selectionList.length === 1 ? '' : 's'} selected`}</span>
          </div>
          <div className="ms-cart-total">{f$(total)}</div>
        </div>

        {/* Cart bottom sheet */}
        {showCart && (
          <div className="ms-cart-sheet">
            <h3>Your Selections</h3>
            {selectionList.length === 0 ? (
              <div className="ms-cart-empty">Nothing selected yet. Pick something above!</div>
            ) : (
              <>
                {selectionList.map((s) => (
                  <div key={s.category} className="ms-cart-item">
                    <div>
                      <div className="ms-cart-item-name">{s.item.brand} {s.item.name}</div>
                      <div className="ms-cart-item-cat">{s.category}</div>
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
            <button
              className="btn btn-ghost"
              style={{ width: '100%', marginTop: 14 }}
              onClick={() => setShowCart(false)}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </>
  );
}
