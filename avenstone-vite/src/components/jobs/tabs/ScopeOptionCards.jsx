// SCE Phase 4B — additive image cards for the scope interview.
// Renders tappable option cards for the currently-open choice fields alongside the
// conversational interview (it does NOT replace the chat). Options with an image show
// the card; options without fall back to a text-only card. Tapping sends that option
// as the rep's answer through the existing interview loop.
const humanize = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default function ScopeOptionCards({ openFieldKeys, fields, images, onPick, disabled }) {
  const open = new Set((openFieldKeys || []).map((k) => String(k).toLowerCase()));
  const shown = (fields || []).filter((f) => open.has(f.field_key.toLowerCase()) && (f.options || []).length);
  if (!shown.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {shown.map((f) => (
        <div key={f.field_key}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy-900)', marginBottom: 8 }}>{f.question}</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {f.options.map((opt) => {
              const url = images?.[f.field_key]?.[opt];
              return (
                <button
                  key={opt}
                  type="button"
                  disabled={disabled}
                  onClick={() => onPick(f, opt)}
                  title={humanize(opt)}
                  style={{
                    width: 112, padding: 0, overflow: 'hidden', textAlign: 'center',
                    border: '1px solid var(--border, #E8E4DC)', borderRadius: 8, background: '#fff',
                    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1,
                  }}
                >
                  {url ? (
                    <img src={url} alt={humanize(opt)} loading="lazy"
                      style={{ width: '100%', height: 84, objectFit: 'cover', display: 'block', background: 'var(--bg-alt, #F3F0EA)' }} />
                  ) : (
                    <div style={{ width: '100%', height: 84, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-alt, #F3F0EA)', color: 'var(--text-subtle)', fontSize: 10, letterSpacing: 0.3 }}>
                      {humanize(opt)}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--navy-900)', padding: '6px 4px', lineHeight: 1.3 }}>{humanize(opt)}</div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
