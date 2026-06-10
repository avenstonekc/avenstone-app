/**
 * BrandPreview — dev-only page for reviewing all brand asset variants.
 * Route: ?pg=brandpreview (add to VALID_PG in App.jsx if desired during review)
 */

// SVG imports
import markNavy   from '../../assets/brand/avenstone-mark-navy.svg';
import markGold   from '../../assets/brand/avenstone-mark-gold.svg';
import markWhite  from '../../assets/brand/avenstone-mark-white.svg';
import markDark   from '../../assets/brand/avenstone-mark-dark.svg';

import compNavy   from '../../assets/brand/avenstone-mark-compact-navy.svg';
import compGold   from '../../assets/brand/avenstone-mark-compact-gold.svg';
import compWhite  from '../../assets/brand/avenstone-mark-compact-white.svg';
import compDark   from '../../assets/brand/avenstone-mark-compact-dark.svg';

import lockNavy   from '../../assets/brand/avenstone-lockup-navy.svg';
import lockGold   from '../../assets/brand/avenstone-lockup-gold.svg';
import lockWhite  from '../../assets/brand/avenstone-lockup-white.svg';
import lockDark   from '../../assets/brand/avenstone-lockup-dark.svg';

const NAVY  = '#0A1F44';
const CREAM = '#F7F5F0';
const WHITE = '#FFFFFF';

const BG_LABEL = { navy: 'Navy bg', cream: 'Cream bg', white: 'White bg' };
const BG_COLOR = { navy: NAVY, cream: CREAM, white: WHITE };

function Cell({ src, size, bg, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{
        background: BG_COLOR[bg], width: size + 16, height: size + 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 8, border: bg === 'white' ? '1px solid #E8E4DC' : 'none',
      }}>
        <img src={src} width={size} height={size} alt={label} style={{ display: 'block' }} />
      </div>
      <span style={{ fontSize: 9, color: '#6B7280', textAlign: 'center', maxWidth: size + 16 }}>{label}</span>
    </div>
  );
}

function Section({ title, rows }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 18, color: NAVY, marginBottom: 16 }}>
        {title}
      </div>
      {rows.map((row, ri) => (
        <div key={ri} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
            {row.label}
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {row.cells.map((c, ci) => <Cell key={ci} {...c} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function BrandPreview() {
  const lockupVariants = [
    { src: lockNavy,  bg: 'navy',  label: 'Lockup -navy'  },
    { src: lockGold,  bg: 'cream', label: 'Lockup -gold'  },
    { src: lockWhite, bg: 'navy',  label: 'Lockup -white' },
    { src: lockDark,  bg: 'white', label: 'Lockup -dark'  },
  ];
  const markVariants = [
    { src: markNavy,  bg: 'navy',  label: 'Mark -navy'  },
    { src: markGold,  bg: 'cream', label: 'Mark -gold'  },
    { src: markWhite, bg: 'navy',  label: 'Mark -white' },
    { src: markDark,  bg: 'white', label: 'Mark -dark'  },
  ];
  const compVariants = [
    { src: compNavy,  bg: 'navy',  label: 'Compact -navy'  },
    { src: compGold,  bg: 'cream', label: 'Compact -gold'  },
    { src: compWhite, bg: 'navy',  label: 'Compact -white' },
    { src: compDark,  bg: 'white', label: 'Compact -dark'  },
  ];

  const sizes = [128, 48, 16];

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100, fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 28, color: NAVY, marginBottom: 4 }}>
        Brand Preview
      </div>
      <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 40 }}>
        All variants × 3 sizes (128 / 48 / 16px) on navy, cream, and white backgrounds.
        DEV ONLY — not linked in production nav.
      </div>

      {/* Lockup */}
      <Section title="Lockup (mark + wordmark + GROUP)" rows={[
        {
          label: 'Large (128px tall)',
          cells: lockupVariants.map(v => ({
            src: v.src, size: 218, bg: v.bg, label: v.label,
          })),
        },
        {
          label: 'Medium (48px tall)',
          cells: lockupVariants.map(v => ({
            src: v.src, size: 82, bg: v.bg, label: v.label,
          })),
        },
        {
          label: '16px tall (minimum readable)',
          cells: lockupVariants.map(v => ({
            src: v.src, size: 27, bg: v.bg, label: v.label,
          })),
        },
      ]} />

      {/* Full mark */}
      <Section title="Mark — full three-nest" rows={sizes.map(sz => ({
        label: `${sz}px`,
        cells: markVariants.map(v => ({ src: v.src, size: sz, bg: v.bg, label: v.label })),
      }))} />

      {/* Compact mark */}
      <Section title="Mark — compact (favicon / sidebar / app icon)" rows={sizes.map(sz => ({
        label: `${sz}px`,
        cells: compVariants.map(v => ({ src: v.src, size: sz, bg: v.bg, label: v.label })),
      }))} />

      {/* PNG exports preview */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 18, color: NAVY, marginBottom: 16 }}>
          Generated raster exports
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {[
            { src: '/apple-touch-icon.png', size: 60, label: 'apple-touch-icon.png\n180×180' },
            { src: '/icon-192.png',          size: 60, label: 'icon-192.png\n192×192' },
            { src: '/icon-512.png',          size: 60, label: 'icon-512.png\n512×512' },
          ].map(p => (
            <div key={p.src} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <img src={p.src} width={p.size} height={p.size} alt={p.label} style={{ borderRadius: 12, display: 'block' }} />
              <span style={{ fontSize: 9, color: '#9CA3AF', textAlign: 'center', whiteSpace: 'pre' }}>{p.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 11, color: '#9CA3AF', borderTop: '1px solid #E8E4DC', paddingTop: 16, lineHeight: 1.8 }}>
        <strong>Geometry notes:</strong><br/>
        • Three nests with ~13-unit apex spacing and ~11–13-unit wall spacing. Not exact parallel-offset — visually balanced.<br/>
        • Inner A: house frame with 37px center-floor notch (8px feet each side). Crossbar at wall midpoint (y=66/100).<br/>
        • Compact: two nests, 3.5px stroke, notch preserved. Survives 16px render.<br/>
        • Wordmark uses DM Serif Display via font-family reference — requires Inkscape/Figma font-to-paths for fully embedded production SVGs.
      </div>
    </div>
  );
}
