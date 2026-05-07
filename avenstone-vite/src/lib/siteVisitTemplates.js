// EXECUTION_ARC Phase 8 — site visit checklist templates.
// JS config — fast PM iteration. AI-seeded + jurisdiction-aware templates are future.

export const SITE_VISIT_TEMPLATES = {
  plumbing_rough_in: {
    name: 'Plumbing Rough-In',
    items: [
      'Supply lines run per plans',
      'DWV stack properly vented',
      'Cleanouts accessible',
      'Pipe sizing meets code',
      'Hangers and supports installed',
      'Pressure test passed',
      'Tub/shower drains located correctly',
      'Water heater connections roughed',
    ],
  },
  framing: {
    name: 'Framing',
    items: [
      'Walls plumb and square',
      'Headers properly sized',
      'Joist hangers nailed per spec',
      'Stud spacing per plans',
      'Blocking installed where required',
      'Sheathing properly fastened',
      'Wall openings (windows/doors) framed correctly',
      'Stair stringers cut and installed',
    ],
  },
  electrical_rough_in: {
    name: 'Electrical Rough-In',
    items: [
      'Boxes installed at correct heights',
      'Romex secured per code',
      'Service panel location and clearance',
      'GFCI requirements identified',
      'Smoke/CO detector locations roughed',
      'Bathroom fan circuits separate',
      'Wire sizing matches breakers',
      'Bonding and grounding correct',
    ],
  },
  drywall: {
    name: 'Drywall',
    items: [
      'All seams taped and mudded',
      'No nail pops or screw misses',
      'Outlets and switches cut clean',
      'Corner bead straight and secure',
      'Sanding smooth (no fuzz, no swirls)',
      'Inside corners properly mudded',
      'Ceiling joints tight',
      'Ready for primer',
    ],
  },
  finals: {
    name: 'Final Walkthrough',
    items: [
      'All doors operate smoothly',
      'All windows operate and lock',
      'All outlets and switches functional',
      'GFCI outlets test correctly',
      'All faucets and drains functional',
      'HVAC heating and cooling tested',
      'Caulking complete throughout',
      'Paint touch-ups complete',
      'Floors clean of debris/scuffs',
      'Punch list items resolved',
    ],
  },
};

export function getTemplateOptions() {
  return Object.entries(SITE_VISIT_TEMPLATES).map(([key, t]) => ({ key, name: t.name }));
}

export function getTemplateItems(templateKey) {
  return SITE_VISIT_TEMPLATES[templateKey]?.items ?? [];
}
