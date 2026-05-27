/**
 * PROOF_ARC — proof gate configuration.
 *
 * JS object (not a DB table in v1) encoding which artifacts require photos,
 * minimum count, bypass roles, and snooze limits.
 *
 * Values here drive:
 *   - COTab.jsx  — co_condition gate (submit) + co_fix gate (approve)
 *   - Future: schedule_item soft advisory, job before-photos, delivery photos
 */

export const PROOF_CONFIG = {
  change_order: {
    co_condition: {
      min: 1,
      bypassRoles: ['owner', 'project_manager'],
      reasonRequired: true,
    },
    co_fix: {
      min: 1,
      bypassRoles: ['owner', 'project_manager'],
      reasonRequired: true,
    },
  },
  schedule_item: {
    soft: true,            // banner only, no save block — today's behaviour
    types: ['sub_start', 'site_visit', 'inspection'],
  },
  job_before: {
    enabled: false,        // tenant default for Avenstone; controlled by jobs.before_photos_required
    snoozeLimit: 3,
    escalationRoles: ['owner', 'project_manager'],
  },
  material_delivery: {
    requested: false,      // soft prompt only; not a hard gate
  },
};
