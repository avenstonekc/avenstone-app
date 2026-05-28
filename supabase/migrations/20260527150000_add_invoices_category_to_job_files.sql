-- Add 'Invoices' to job_files category CHECK constraint

ALTER TABLE job_files DROP CONSTRAINT job_files_category_check;
ALTER TABLE job_files ADD CONSTRAINT job_files_category_check
  CHECK (category IN ('Photos', 'Documents', 'Invoices', 'Receipts', 'Floor Plans', 'Change Orders', 'Communications', 'Draws'));
