-- =====================================================================
-- AI Lead-Status Classifier
--
-- Constrains leads.lead_status to exactly 5 Title-case values, adds a
-- lead_lost_reason that may ONLY be set when status is 'Lost', and a
-- last_classified_at timestamp used by the 5-minute-idle sweeper cron.
--
-- The original lead_status default was lowercase 'new' and was never set
-- by app logic, so existing rows are first normalized to 'New'.
-- =====================================================================

-- 1. Normalize any existing/invalid values to the new vocabulary.
UPDATE leads
SET lead_status = 'New'
WHERE lead_status IS NULL
   OR lead_status NOT IN ('New', 'Active', 'Progress', 'Lost', 'Successful');

-- 2. New default for fresh leads.
ALTER TABLE leads ALTER COLUMN lead_status SET DEFAULT 'New';

-- 3. Constrain to exactly the 5 allowed values.
ALTER TABLE leads
  ADD CONSTRAINT leads_lead_status_check
  CHECK (lead_status IN ('New', 'Active', 'Progress', 'Lost', 'Successful'));

-- 4. The reason a lead was lost — free text, derived from the chat.
ALTER TABLE leads ADD COLUMN lead_lost_reason TEXT;

-- 5. Enforce: a reason can ONLY exist when the lead is Lost.
ALTER TABLE leads
  ADD CONSTRAINT leads_lost_reason_check
  CHECK (lead_status = 'Lost' OR lead_lost_reason IS NULL);

-- 6. When the classifier last ran for this lead (idle-sweep bookkeeping).
ALTER TABLE leads ADD COLUMN last_classified_at TIMESTAMPTZ;
