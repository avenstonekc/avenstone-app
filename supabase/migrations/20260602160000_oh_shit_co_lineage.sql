-- Bidirectional lineage: change_orders.oh_shit_moment_id → oh_shit_moments
--                         oh_shit_moments.converted_to_co_id → change_orders
-- Both nullable — most COs are not from oh-shit moments; most moments are never converted.
-- change_orders.id is TEXT so the back-reference must also be TEXT.

ALTER TABLE change_orders
  ADD COLUMN oh_shit_moment_id UUID REFERENCES oh_shit_moments(id);

ALTER TABLE oh_shit_moments
  ADD COLUMN converted_to_co_id TEXT REFERENCES change_orders(id);

CREATE INDEX idx_change_orders_oh_shit_moment_id ON change_orders(oh_shit_moment_id);
CREATE INDEX idx_oh_shit_moments_converted_to_co_id ON oh_shit_moments(converted_to_co_id);

NOTIFY pgrst, 'reload schema';
