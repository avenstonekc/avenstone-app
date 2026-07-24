import React, { useState, useEffect } from 'react';
import { runCompute } from '../../../lib/computeFns';

const NAV    = 'var(--navy-900)';
const GOLD   = 'var(--gold-500)';
const BORDER = 'var(--border)';
const CREAM  = 'var(--bg)';

// Groups fields into visual sections by conceptual category
const SECTION_KEYS = {
  shower:  ['shower_type', 'shower_width_in', 'shower_length_in', 'shower_wall_height_in', 'shower_wall_sf', 'shower_floor_sf', 'shower_door_type', 'niche', 'bench'],
  floor:   ['floor_tile_sf', 'floor_type'],
  vanity:  ['vanity_width', 'vanity_top', 'sink_count'],
  plumbing:['toilet_type', 'faucet_replace'],
  paint:   ['paint_walls', 'paint_ceiling', 'paint_trim', 'baseboard_replace'],
};
const SECTION_LABELS = { shower: 'Shower', floor: 'Floor', vanity: 'Vanity', plumbing: 'Plumbing', paint: 'Paint & Trim' };

function isVisible(field, values) {
  if (!field.show_when) return true;
  for (const [key, allowed] of Object.entries(field.show_when)) {
    if (!allowed.includes(values[key])) return false;
  }
  return true;
}

// Resolve vanity_top options dynamically based on current vanity_width
function resolveFixtureOptions(field, values) {
  if (!field.options_template) return field.options ?? [];
  const width = values[field.options_from] ?? '';
  return (field.options ?? []).map(opt => ({
    ...opt,
    resolved_material_name: field.options_template
      .replace('{material}', (opt.material_label ?? '').toLowerCase())
      .replace('{vanity_width}', width),
  }));
}

// Parse contractor-style dimension strings into total inches.
// Accepts: 5'6"  5' 6"  5'6  5'  66"  66  5.5'  (bare number = inches)
function parseDimension(input) {
  if (input == null || input === '') return null;
  const s = String(input).trim();
  const ftIn = s.match(/^(\d+(?:\.\d+)?)'\s*(\d+(?:\.\d+)?)"?$/);
  if (ftIn) return Math.round(parseFloat(ftIn[1]) * 12 + parseFloat(ftIn[2]));
  const ftOnly = s.match(/^(\d+(?:\.\d+)?)'$/);
  if (ftOnly) return Math.round(parseFloat(ftOnly[1]) * 12);
  const inOnly = s.match(/^(\d+(?:\.\d+)?)"$/);
  if (inOnly) return Math.round(parseFloat(inOnly[1]));
  const bareNum = s.match(/^(\d+(?:\.\d+)?)$/);
  if (bareNum) return Math.round(parseFloat(bareNum[1]));
  return NaN;
}

// Format total inches back to contractor notation (5'6", 5', 6")
function formatDimension(inches) {
  if (inches == null) return '';
  const ft   = Math.floor(inches / 12);
  const inch = inches % 12;
  if (ft === 0)   return `${inch}"`;
  if (inch === 0) return `${ft}'`;
  return `${ft}'${inch}"`;
}


function FieldInput({ field, value, values, onChange }) {
  const visible = isVisible(field, values);
  if (!visible) return null;

  const label = (
    <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>
      {field.label}
    </label>
  );

  if (field.type === 'boolean') {
    return (
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!value}
            onChange={e => onChange(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: NAV }}
          />
          <span style={{ fontSize: 13, color: NAV, fontWeight: 500 }}>{field.label}</span>
        </label>
      </div>
    );
  }

  if (field.type === 'number') {
    const showSubtract = field.subtract?.length && values[field.subtract[0]] != null;
    const subtractedVal = showSubtract
      ? Math.max(0, Number(value ?? 0) - field.subtract.reduce((acc, k) => acc + Number(values[k] ?? 0), 0))
      : null;
    return (
      <div style={{ marginBottom: 12 }}>
        {label}
        <input
          type="number"
          min={field.min ?? 0}
          max={field.max ?? undefined}
          value={value ?? ''}
          onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="finp"
          style={{ width: '100%', fontSize: 13 }}
        />
        {field.help && (
          <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>{field.help}</div>
        )}
        {subtractedVal != null && (
          <div style={{ fontSize: 11, color: GOLD, marginTop: 3, fontWeight: 600 }}>
            Net (minus shower floor): {subtractedVal.toFixed(0)} sf
          </div>
        )}
      </div>
    );
  }

  // Two numeric boxes (Feet + Inches) — mobile-friendly, no apostrophe typing required.
  // Value stored as total inches (number). Parent binds value/onChange unchanged.
  if (field.type === 'feet_inches') {
    const totalToFt  = (total) => (total == null ? '' : String(Math.floor(total / 12)));
    const totalToIn  = (total) => (total == null ? '' : String(total - Math.floor(total / 12) * 12));

    const seedTotal = value ?? null;  // do NOT fall back to field.default here — parent seeds it
    const [ftVal, setFtVal] = useState(() => totalToFt(seedTotal));
    const [inVal, setInVal] = useState(() => totalToIn(seedTotal));
    const [error, setError] = useState(null);

    // Resync when value changes externally (schema seed from parent useEffect)
    useEffect(() => {
      setFtVal(totalToFt(value ?? null));
      setInVal(totalToIn(value ?? null));
      setError(null);
    }, [value]);

    const handleChange = (nextFt, nextIn) => {
      const ftEmpty = nextFt === '' || nextFt == null;
      const inEmpty = nextIn === '' || nextIn == null;
      if (ftEmpty && inEmpty) {
        setError(null);
        onChange(null);
        return;
      }
      const ft    = ftEmpty ? 0 : parseFloat(nextFt);
      const inch  = inEmpty ? 0 : parseFloat(nextIn);
      if (isNaN(ft) || isNaN(inch)) return; // mid-keystroke, ignore
      const total = ft * 12 + inch;
      const min   = field.min ?? 0;
      const max   = field.max ?? Infinity;
      if (total < min || total > max) {
        setError(`Must be between ${min}" and ${max}"`);
      } else {
        setError(null);
      }
      onChange(total);
    };

    const inputStyle = {
      fontSize: 16,        // CRITICAL: iOS WKWebView auto-zooms below 16px
      minHeight: 36,
      paddingTop: 6,
      paddingBottom: 6,
      paddingLeft: 8,
      paddingRight: 8,
      width: 72,
      textAlign: 'center',
      ...(error ? { borderColor: '#EF4444' } : {}),
    };

    return (
      <div style={{ marginBottom: 12 }}>
        {label}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="number"
            min={0}
            step={1}
            value={ftVal}
            placeholder="0"
            onChange={e => { setFtVal(e.target.value); handleChange(e.target.value, inVal); }}
            className="finp"
            style={inputStyle}
          />
          <span style={{ fontSize: 13, color: '#555', flexShrink: 0 }}>ft</span>
          <input
            type="number"
            min={0}
            max={11.99}
            step={0.5}
            value={inVal}
            placeholder="0"
            onChange={e => { setInVal(e.target.value); handleChange(ftVal, e.target.value); }}
            className="finp"
            style={inputStyle}
          />
          <span style={{ fontSize: 13, color: '#555', flexShrink: 0 }}>in</span>
        </div>
        {error && (
          <div style={{ fontSize: 11, color: '#EF4444', marginTop: 3 }}>{error}</div>
        )}
        {field.help && !error && (
          <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>{field.help}</div>
        )}
      </div>
    );
  }

  // Optional number — blank stored as null
  if (field.type === 'number_optional') {
    return (
      <div style={{ marginBottom: 12 }}>
        {label}
        <input
          type="number"
          min={field.min ?? 0}
          max={field.max ?? undefined}
          value={value ?? ''}
          placeholder="blank = auto"
          onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="finp"
          style={{ width: '100%', fontSize: 13 }}
        />
        {field.help && (
          <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>{field.help}</div>
        )}
      </div>
    );
  }

  if (field.type === 'select') {
    return (
      <div style={{ marginBottom: 12 }}>
        {label}
        <select
          value={value ?? ''}
          onChange={e => onChange(e.target.value || null)}
          className="finp"
          style={{ width: '100%', fontSize: 13 }}
        >
          <option value="">— select —</option>
          {(field.options ?? []).map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === 'fixture_select') {
    const opts = resolveFixtureOptions(field, values);
    return (
      <div style={{ marginBottom: 12 }}>
        {label}
        <select
          value={value ?? ''}
          onChange={e => onChange(e.target.value || null)}
          className="finp"
          style={{ width: '100%', fontSize: 13 }}
        >
          <option value="">— select —</option>
          {opts.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label ?? opt.material_label ?? opt.material_name ?? opt.value}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Computed field: shows auto-computed value with optional inline override input.
  // `value` here is the current override value (values[field.override_key]) or null.
  // `onChange` writes to override_key (handled by the parent render loop).
  if (field.type === 'computed') {
    const computedVal = runCompute(field.compute_fn, values) ?? 0;
    const isOverridden = value != null;
    const displayVal   = isOverridden ? Number(value) : computedVal;
    return (
      <div style={{ marginBottom: 12 }}>
        {label}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: CREAM, borderRadius: 6, border: `1px solid ${BORDER}`, marginBottom: field.overridable ? 4 : 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: isOverridden ? GOLD : NAV }}>
            {displayVal.toFixed(1)} sf
          </span>
          <span style={{ fontSize: 11, color: isOverridden ? GOLD : '#888' }}>
            {isOverridden ? '(override)' : '(auto)'}
          </span>
        </div>
        {field.overridable && (
          <input
            type="number"
            min={0}
            value={value ?? ''}
            placeholder="Override (blank = auto)"
            onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
            className="finp"
            style={{ width: '100%', fontSize: 12 }}
          />
        )}
      </div>
    );
  }

  return null;
}

/**
 * Renders a scope detail form from a schema JSONB.
 * Props:
 *   schema        — { fields: [...] } from scope_detail_schemas
 *   values        — current scope_details object
 *   onChange      — (newValues) => void
 *   roomDefaults  — { floorSf, wallSf } from scan room
 */
export default function ScopeDetailForm({ schema, values, onChange, roomDefaults }) {
  const fields = schema?.fields ?? [];
  if (!fields.length) return null;

  // Seed defaults for any missing field from schema + roomDefaults
  useEffect(() => {
    const seeded = { ...values };
    let changed = false;
    for (const field of fields) {
      if (seeded[field.key] !== undefined) continue;
      if (field.default_from === 'room.floorSf' && roomDefaults?.floorSf != null) {
        seeded[field.key] = roomDefaults.floorSf;
        changed = true;
      } else if (field.default !== undefined) {
        seeded[field.key] = field.default;
        changed = true;
      }
    }
    if (changed) onChange(seeded);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema]);

  const handleChange = (key, val) => onChange({ ...values, [key]: val });

  // Group fields into sections for visual dividers
  const placed = new Set();
  const sections = [];
  for (const [sectionKey, keys] of Object.entries(SECTION_KEYS)) {
    const sectionFields = fields.filter(f => keys.includes(f.key));
    if (!sectionFields.length) continue;
    const visible = sectionFields.some(f => isVisible(f, values));
    if (!visible) continue;
    sections.push({ key: sectionKey, label: SECTION_LABELS[sectionKey], fields: sectionFields });
    sectionFields.forEach(f => placed.add(f.key));
  }
  // Append any fields not in SECTION_KEYS
  const remaining = fields.filter(f => !placed.has(f.key));
  if (remaining.length) sections.push({ key: 'other', label: null, fields: remaining });

  return (
    <div style={{ marginTop: 12 }}>
      {sections.map((section, si) => (
        <div key={section.key}>
          {section.label && (
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#888',
              textTransform: 'uppercase', marginBottom: 8,
              ...(si > 0 ? { borderTop: `1px solid ${BORDER}`, paddingTop: 12, marginTop: 4 } : {}),
            }}>
              {section.label}
            </div>
          )}
          {section.fields.map(field => {
            // Computed fields: value + onChange bind to override_key so the rep
            // edits the override while the display derives from compute_fn.
            const isComputed   = field.type === 'computed';
            const valueKey     = isComputed && field.override_key ? field.override_key : field.key;
            const onChangeKey  = valueKey;
            return (
              <FieldInput
                key={field.key}
                field={field}
                value={values[valueKey]}
                values={values}
                onChange={val => handleChange(onChangeKey, val)}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
