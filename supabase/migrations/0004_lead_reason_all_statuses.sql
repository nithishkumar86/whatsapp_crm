-- =====================================================================
-- lead_reason for every status
--
-- Previously `lead_lost_reason` could ONLY be set when lead_status = 'Lost'.
-- Now the AI classifier writes a concise, chat-derived reason for EVERY
-- status (New, Active, Progress, Lost, Successful) explaining why it chose
-- that status. So we:
--   1. Drop the Lost-only CHECK constraint.
--   2. Rename the column lead_lost_reason -> lead_reason.
--
-- No data is lost — existing Lost reasons carry over under the new name and
-- will be backfilled for the other statuses on the next classifier sweep.
-- =====================================================================

-- 1. Remove the constraint that forced the reason to be NULL unless Lost.
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_lost_reason_check;

-- 2. Rename the column to its status-agnostic name.
ALTER TABLE leads RENAME COLUMN lead_lost_reason TO lead_reason;
