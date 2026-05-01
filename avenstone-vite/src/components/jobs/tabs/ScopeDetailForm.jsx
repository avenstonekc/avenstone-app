import { useState, useEffect } from 'react';

const NAV    = '#0A1F44';
const GOLD   = '#C9A84C';
const BORDER = '#E8E4DC';
const CREAM  = '#F7F5F0';

// Groups fields into visual sections by conceptual category
const SECTION_KEYS = {
  shower:  ['shower_type', 'shower_wall_sf', 'shower_floor_sf', 'shower_door_type', 'niche', 'bench'],
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
  // template: "Vanity top - {material} {vanity_width}in"
  const width = values[field.options_from] ?? '';
  return (field.options ?? []).map(opt => ({
    ...opt,
    resolved_material_name: field.options_template
      .replace('{material}', (opt.material_label ?? '').toLowerCase())
      .replace('{vanity_width}', width),
  }));
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
            <FieldInput
              key={field.key}
              field={field}
              value={values[field.key]}
              values={values}
              onChange={val => handleChange(field.key, val)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
