-- 0005_reminder_run_log.sql
--
-- Turn the two /cron pages from a "today/tomorrow target list" into a PERMANENT
-- CRON RUN-LOG. A row may appear in the log only once the cron has actually
-- processed that appointment (success OR failure). To support that, record the
-- run timestamp + result of each reminder attempt directly on the appointment.
--
-- Daily reminder (Cron 2) and hourly reminder (Cron 3) each get their own
-- run_at + result columns. `result` is constrained to 'sent' | 'failed' (or NULL
-- when the cron has not yet processed that appointment).

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reminder_1day_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_1day_result text,
  ADD COLUMN IF NOT EXISTS reminder_1hr_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_1hr_result text;

ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_reminder_1day_result_check;
ALTER TABLE appointments
  ADD CONSTRAINT appointments_reminder_1day_result_check
  CHECK (reminder_1day_result IN ('sent', 'failed') OR reminder_1day_result IS NULL);

ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_reminder_1hr_result_check;
ALTER TABLE appointments
  ADD CONSTRAINT appointments_reminder_1hr_result_check
  CHECK (reminder_1hr_result IN ('sent', 'failed') OR reminder_1hr_result IS NULL);

-- Backfill so already-sent reminders still appear in the log.
UPDATE appointments
  SET reminder_1day_run_at = now(), reminder_1day_result = 'sent'
  WHERE reminder_1day_sent = true;

UPDATE appointments
  SET reminder_1hr_run_at = now(), reminder_1hr_result = 'sent'
  WHERE reminder_1hr_sent = true;
