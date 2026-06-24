-- Drop the budget column from appointments.
-- This is a construction landowners service — budget is not collected, so the
-- column is removed from the schema and from the AI booking flow / calendar UI.
-- location_preference remains the only booking-time snapshot field.
ALTER TABLE appointments DROP COLUMN IF EXISTS budget;
