import { f$, isMob, estimatorBadge } from '../../../lib/utils';

const NAV    = 'var(--navy-900)';
const GOLD   = 'var(--gold-500)';
const BORDER = 'var(--border)';

const SECTIONS = [
  { key: 'labor',      label: 'Labor' },
  { key: 'materials',  label: 'Materials' },
  { key: 'allowances', label: 'Allowances' },
  { key: 'general',    label: 'General' },
];

function classify(line) {
  if (line.category === 'labor')         return 'labor';
  if (/allowance/i.test(line.description)) return 'allowances';
  if (line.category === 'materials')     return 'materials';
  return 'general';
}

function fRate(unit_price, unit) {
  if (unit_price == null) return 'TBD';
  return ['EA', 'LS', 'room', 'load', 'sq'].includes(unit)
    ? f$(unit_price)
    : `${f$(unit_price)}/${unit}`;
}

function BadgePill({ source_label, vetted }) {
  const b = estimatorBadge(source_label, vetted);
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 9999,
      whiteSpace: 'nowrap', background: b.bg, color: b.color, flexShrink: 0,
    }}>
      {b.icon} {b.text}
    </span>
  );
}

function LineRow({ line, mob }) {
  const rateStr = fRate(line.unit_price, line.unit);
  const amtStr  = line.amount != null ? f$(line.amount) : 'TBD';

  if (mob) {
    return (
      <div style={{ padding: '8px 12px', borderTop: `1px solid ${BORDER}`, background: 'var(--card-bg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 13, color: NAV, flex: 1, lineHeight: 1.4 }}>{line.description}</span>
          <BadgePill source_label={line.source_label} vetted={line.vetted} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {line.quantity} {line.unit} · {rateStr}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: NAV }}>{amtStr}</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '2fr 90px 120px 90px 110px',
      padding: '7px 12px', borderTop: `1px solid ${BORDER}`,
      gap: 8, alignItems: 'center', background: 'var(--card-bg)',
    }}>
      <span style={{ fontSize: 13, color: NAV }}>{line.description}</span>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>
        {line.quantity} {line.unit}
      </span>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>{rateStr}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: NAV, textAlign: 'right' }}>{amtStr}</span>
      <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <BadgePill source_label={line.source_label} vetted={line.vetted} />
      </span>
    </div>
  );
}

export default function StructuredEstimate({ lines, loading, error }) {
  const mob = isMob();

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-subtle)', fontSize: 13 }}>
        Loading estimate…
      </div>
    );
  }
  if (error) {
    return (
      <div style={{
        background: 'var(--red-bg)', border: '1px solid var(--red-border)',
        color: 'var(--red-text)', padding: '10px 14px', borderRadius: 8, fontSize: 13,
      }}>
        {error}
      </div>
    );
  }
  if (!lines?.length) {
    return (
      <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-subtle)', fontSize: 13 }}>
        No estimate lines.
      </div>
    );
  }

  const groups = { labor: [], materials: [], allowances: [], general: [] };
  for (const line of lines) groups[classify(line)].push(line);

  const secTotal = sec => sec.reduce((s, l) => l.amount != null ? s + Number(l.amount) : s, 0);
  const grand    = Object.values(groups).reduce((s, sec) => s + secTotal(sec), 0);

  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
      <div style={{
        background: NAV, padding: '8px 12px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Estimate Breakdown
        </span>
        {!mob && (
          <div style={{
            display: 'grid', gridTemplateColumns: '90px 120px 90px 110px',
            gap: 8, fontSize: 10, fontWeight: 600, color: GOLD, opacity: 0.65,
          }}>
            <span style={{ textAlign: 'right' }}>Qty</span>
            <span style={{ textAlign: 'right' }}>Rate</span>
            <span style={{ textAlign: 'right' }}>Amount</span>
            <span style={{ textAlign: 'right' }}>Source</span>
          </div>
        )}
      </div>

      {SECTIONS.map(({ key, label }) => {
        const sec = groups[key];
        if (!sec.length) return null;
        return (
          <div key={key}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'var(--bg-alt)', padding: '5px 12px', borderTop: `1px solid ${BORDER}`,
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                {label}
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, color: NAV }}>{f$(secTotal(sec))}</span>
            </div>
            {sec.map((line, i) => <LineRow key={i} line={line} mob={mob} />)}
          </div>
        );
      })}

      <div style={{
        background: NAV, padding: '10px 12px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
          Subtotal (cost)
        </span>
        <span style={{ fontSize: 16, fontWeight: 800, color: GOLD }}>{f$(grand)}</span>
      </div>
    </div>
  );
}
