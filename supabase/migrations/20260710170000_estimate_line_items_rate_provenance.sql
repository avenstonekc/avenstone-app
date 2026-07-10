-- ESTIMATOR S9 — persist per-line gap provenance through commit.
--
-- A committed estimate line that came from an answered gap should carry HOW its rate
-- was set: 'rep_accepted_anchor' | 'rep_override' | 'rep_entered'. source_label already
-- carries WHAT kind of line it is ('user_entered', 'labor_rate', …) and is read by the
-- estimator badges — overloading it would break those readers. So provenance gets its
-- own nullable column: null on lines that never went through the gap flow.
ALTER TABLE estimate_line_items
  ADD COLUMN IF NOT EXISTS rate_provenance TEXT;
