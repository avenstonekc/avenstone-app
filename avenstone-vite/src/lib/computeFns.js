// Named compute functions used by the scope_detail_schemas 'computed' field type.
// Shared between takeoff.js (server-side resolution) and ScopeDetailForm (live preview).
// Each function receives the full current values object and returns a number.

export const COMPUTE_FNS = {
  shower_wall_sf_from_dims(values) {
    const w = Number(values.shower_width_in)       || 0;
    const l = Number(values.shower_length_in)      || 0;
    const h = Number(values.shower_wall_height_in) || 96;
    if (!w || !l) return 0;
    const type = values.shower_type || 'shower_only';
    const wallSf = type === 'tub_only'
      ? ((2 * w + l) / 12) * (h / 12)         // 3-wall tub surround
      : (2 * (w + l) / 12) * (h / 12);        // 4-wall shower stall
    return Math.round(wallSf * 10) / 10;
  },

  shower_floor_sf_from_dims(values) {
    const w = Number(values.shower_width_in)  || 0;
    const l = Number(values.shower_length_in) || 0;
    if (!w || !l) return 0;
    return Math.round((w / 12) * (l / 12) * 10) / 10;
  },
};

export function runCompute(fnName, values) {
  const fn = COMPUTE_FNS[fnName];
  return fn ? fn(values) : null;
}
