-- engagement_bids.line_items already exists as nullable jsonb; add default and normalize nulls.
ALTER TABLE engagement_bids
  ALTER COLUMN line_items SET DEFAULT '[]'::jsonb;

UPDATE engagement_bids
  SET line_items = '[]'::jsonb
  WHERE line_items IS NULL;

COMMENT ON COLUMN engagement_bids.line_items IS
  'Array of bid line items: [{ description, quantity, unit, unit_price, line_total, notes? }]. Empty array means lump-sum bid (total_amount is the bid).';

NOTIFY pgrst, 'reload schema';
