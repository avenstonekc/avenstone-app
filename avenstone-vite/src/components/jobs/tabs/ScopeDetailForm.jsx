import React, { useState, useEffect } from 'react';

const NAV    = '#0A1F44';
const GOLD   = '#C9A84C';
const BORDER = '#E8E4DC';
const CREAM  = '#F7F5F0';

// Groups fields into visual sections by conceptual category
const SECTION_KEYS = {
  shower:  ['shower_type', 'shower_width_in', 'shower_length_in', 'shower_wall_height_in', 'shower_wall_sf_override', 'shower_floor_sf_override', 'shower_door_type', 'niche', 'bench'],
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

// Compute shower wall sf and floor sf from dimension inputs (stored as total inches).
// Mirrors resolveShowerSf in takeoff.js so the UI preview matches the draft.
function computeShowerSfLocal(values) {
  const type = values.shower_type || 'shower_only';
  if (type === 'tub_only') return null;

  const w = Number(values.shower_width_in)       || 0;
  const l = Number(values.shower_length_in)      || 0;
  const h = Number(values.shower_wall_height_in) || 96;
  if (!w || !l) return null;

  let computedWall;
  if (type === 'tub_plus_shower') {
    computedWall = (2 * (w + l) / 12) * (h / 12);
  } else {
    computedWall = (2 * (w + l) / 12) * (h / 12);
  }
  computedWall = Math.round(computedWall * 10) / 10;
  const computedFloor = Math.round((w / 12) * (l / 12) * 10) / 10;

  const wallOverride  = values.shower_wall_sf_override  != null ? Number(values.shower_wall_sf_override)  : null;
  const floorOverride = values.shower_floor_sf_override != null ? Number(values.shower_floor_sf_override) : null;

  return {
    wall:           wallOverride  ?? computedWall,
    floor:          floorOverride ?? computedFloor,
    wallOverridden:  wallOverride  != null,
    floorOverridden: floorOverride != null,
    computedWall,
    computedFloor,
  };
}

// Read-only computed tile area display shown after dimension inputs.
function ShowerSfDisplay({ values }) {
  const sf = computeShowerSfLocal(values);
  if (!sf) return null;
  return (
    <div style={{ marginBottom: 12, padding: '8px 10px', background: CREAM, borderRadius: 6, border: `1px solid ${BORDER}` }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Computed tile areas
      </div>
      <div style={{ display: 'flex', gap: 20 }}>
        <div>
          <span style={{ fontSize: 12, color: '#666' }}>Wall tile: </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: sf.wallOverridden ? GOLD : NAV }}>
            {sf.wall.toFixed(1)} sf
          </span>
          <span style={{ fontSize: 11, color: sf.wallOverridden ? GOLD : '#888', marginLeft: 4 }}>
            {sf.wallOverridden ? '(override)' : '(auto)'}
          </span>
        </div>
        <div>
          <span style={{ fontSize: 12, color: '#666' }}>Floor tile: </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: sf.floorOverridden ? GOLD : NAV }}>
            {sf.floor.toFixed(1)} sf
          </span>
          <span style={{ fontSize: 11, color: sf.floorOverridden ? GOLD : '#888', marginLeft: 4 }}>
            {sf.floorOverridden ? '(override)' : '(auto)'}
          </span>
        </div>
      </div>
    </div>
  );
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

  // Single text input accepting contractor-style dimension strings (5'6", 66", 5.5', 66)
  // Value stored as total inches. Formats back to feet-and-inches on blur.
  if (field.type === 'feet_inches') {
    const [rawText, setRawText] = useState(() => formatDimension(value ?? field.default ?? null));
    const [error, setError]     = useState(null);

    // Keep display in sync when value changes externally (e.g. schema seed)
    useEffect(() => {
      const formatted = formatDimension(value ?? field.default ?? null);
      setRawText(formatted);
      setError(null);
    }, [value]);

    const handleBlur = () => {
      const parsed = parseDimension(rawText);
      if (rawText === '' || rawText == null) {
        setError(null);
        onChange(null);
        return;
      }
      if (isNaN(parsed)) {
        setError('Format: 5\'6" or 66"');
        return;
      }
      const min = field.min ?? 0;
      const max = field.max ?? Infinity;
      if (parsed < min || parsed > max) {
        const minFt = Math.floor(min / 12), minIn = min % 12;
        const maxFt = Math.floor(max / 12), maxIn = max % 12;
        const fmtMin = minIn ? `${minFt}'${minIn}"` : `${minFt}'`;
        const fmtMax = maxIn ? `${maxFt}'${maxIn}"` : `${maxFt}'`;
        setError(`Must be between ${fmtMin} and ${fmtMax}`);
        return;
      }
      setError(null);
      setRawText(formatDimension(parsed));
      onChange(parsed);
    };

    const parsedPreview = parseDimension(rawText);
    const showPreview   = rawText && !isNaN(parsedPreview) && !error;

    return (
      <div style={{ marginBottom: 12 }}>
        {label}
        <input
          type="text"
          value={rawText}
          onChange={e => { setRawText(e.target.value); setError(null); }}
          onBlur={handleBlur}
          className="finp"
          placeholder={`e.g. 5'6" or 66"`}
          style={{ width: '100%', fontSize: 13, ...(error ? { borderColor: '#EF4444' } : {}) }}
        />
        {error && (
          <div style={{ fontSize: 11, color: '#EF4444', marginTop: 3 }}>{error}</div>
        )}
        {showPreview && (
          <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>= {parsedPreview}"</div>
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
          {section.fields.map(field => (
            <React.Fragment key={field.key}>
              <FieldInput
                field={field}
                value={values[field.key]}
                values={values}
                onChange={val => handleChange(field.key, val)}
              />
              {section.key === 'shower' && field.key === 'shower_wall_height_in' && (
                <ShowerSfDisplay values={values} />
              )}
            </React.Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}
