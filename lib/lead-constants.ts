/**
 * Canonical lead enums — pure constants with ZERO imports.
 *
 * These live in their own module (separate from lib/lead-classifier.ts) so they
 * can be imported by CLIENT components without dragging in the server-only
 * Supabase service-role client or the OpenRouter/OpenAI client, both of which
 * throw at module load in the browser (missing server env vars).
 *
 * lib/lead-classifier.ts re-exports these, so existing server-side imports
 * (`from '@/lib/lead-classifier'`) keep working unchanged.
 */

/** The only five permitted lead_status values, stored Title case. */
export const LEAD_STATUSES = [
  'New',
  'Active',
  'Progress',
  'Lost',
  'Successful',
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

/**
 * The only ten permitted lead_lost_factor values. Populated by the classifier
 * ONLY when lead_status is 'Lost' — NULL for every other status. Used as a
 * clean enum for the lost-reason pie chart. Exact strings; do not edit casing.
 */
export const LOST_FACTORS = [
  'Not Interested',
  'Budget / Expectation Mismatch',
  'Competitor Chosen',
  'No Response',
  'Invalid Number',
  'Duplicate Lead',
  'Ghosted',
  'Tire Kicker',
  'Land Ownership Issue',
  'Other',
] as const;

export type LostFactor = (typeof LOST_FACTORS)[number];
