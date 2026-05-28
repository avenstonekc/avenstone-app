-- Add 'Draws' to job_files category CHECK constraint
-- Needed for draw packages saved to the Files tab

ALTER TABLE job_files DROP CONSTRAINT job_files_category_check;
ALTER TABLE job_files ADD CONSTRAINT job_files_category_check
  CHECK (category IN ('Photos', 'Documents', 'Receipts', 'Floor Plans', 'Change Orders', 'Communications', 'Draws'));
