-- =====================================================================
-- lead_lost_factor — structured "why was this lead lost" category
--
-- A SECOND classifier field, distinct from the free-text `lead_reason`.
-- It is populated by the AI lead-status classifier ONLY when a lead is
-- classified 'Lost', and must be exactly one of 10 fixed categories so the
-- data is clean enough to drive a lost-reason pie chart later.
--
-- For every non-Lost status (New, Active, Progress, Successful) this column
-- must be NULL. The CHECK below enforces both invariants:
--   * the value is NULL, OR
--   * the status is 'Lost' AND the value is one of the 10 allowed strings.
-- This mirrors the original Lost-only constraint pattern from
-- 0003_lead_status_classifier.sql.
-- =====================================================================

ALTER TABLE leads ADD COLUMN lead_lost_factor TEXT;

ALTER TABLE leads
  ADD CONSTRAINT leads_lost_factor_check
  CHECK (
    lead_lost_factor IS NULL
    OR (
      lead_status = 'Lost'
      AND lead_lost_factor IN (
        'Not Interested',
        'Budget / Expectation Mismatch',
        'Competitor Chosen',
        'No Response',
        'Invalid Number',
        'Duplicate Lead',
        'Ghosted',
        'Tire Kicker',
        'Land Ownership Issue',
        'Other'
      )
    )
  );
