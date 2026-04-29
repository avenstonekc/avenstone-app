-- Backfill dirty trade strings from pre-taxonomy era
-- consultation_measurements: 'painting'/'interior painting' → 'Paint', 'Cabinets' → 'Cabinets / vanities'
-- estimate_line_items: 'Finish' was a phase label written into the wrong column → NULL

UPDATE consultation_measurements SET trade = 'Paint'
  WHERE trade IN ('painting', 'interior painting');

UPDATE consultation_measurements SET trade = 'Cabinets / vanities'
  WHERE trade = 'Cabinets';

UPDATE estimate_line_items SET trade = NULL
  WHERE trade = 'Finish';
