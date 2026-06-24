import { LOST_FACTORS, LEAD_STATUSES } from './lead-constants';

/**
 * Pure aggregation helpers for the Lead Analytics pie charts.
 *
 * Kept out of the API route file because Next.js App Router route modules may
 * only export a fixed set of names (GET, POST, dynamic, …) — exporting helpers
 * there is a build error. These are import-only, DB/network-free, and unit-
 * tested via scripts/test-analytics-pure.mjs.
 */

/** The four non-Lost statuses, in canonical order, used for the Overall chart. */
const NON_LOST_STATUSES = LEAD_STATUSES.filter((s) => s !== 'Lost');

export interface LostFactorRow {
  lead_lost_factor: string | null;
}

export interface StatusRow {
  lead_status: string | null;
}

/**
 * A single `leads` row carrying everything the analytics charts need, including
 * the timestamp used to bucket leads by their Asia/Kolkata creation month.
 */
export interface LeadAnalyticsRow {
  lead_status: string | null;
  lead_lost_factor: string | null;
  created_at: string | null;
}

/**
 * The twelve calendar-month values ("01"…"12") that populate the selectbox.
 * Year-independent on purpose: the analytics filter buckets leads by their
 * month of the year only, never by a specific year.
 */
export const MONTH_VALUES: string[] = Array.from({ length: 12 }, (_, i) =>
  String(i + 1).padStart(2, '0'),
);

/**
 * Returns the Asia/Kolkata month-of-year ("01"…"12") for an ISO timestamp.
 *
 * en-CA formats as YYYY-MM-DD; the month is chars 5–7. Formatting in the
 * Asia/Kolkata timezone means a UTC timestamp late at night can roll into the
 * next IST month — handled here so buckets match what the team sees locally.
 * Year is intentionally discarded: a lead created in June 2025 and one created
 * in June 2026 both bucket as "06".
 */
export function istMonthNumOf(createdAt: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date(createdAt))
    .slice(5, 7);
}

/**
 * The month list that populates the selectbox: always all twelve months,
 * "01"…"12", in calendar order (January first, December last).
 */
export function buildMonthList(): string[] {
  return [...MONTH_VALUES];
}

/**
 * Keeps only rows whose IST creation month-of-year equals `month` ("01"…"12"),
 * regardless of the year. Rows with a null created_at are excluded.
 */
export function filterRowsByMonth(
  rows: LeadAnalyticsRow[],
  month: string,
): LeadAnalyticsRow[] {
  return rows.filter(
    (row) => row.created_at !== null && istMonthNumOf(row.created_at) === month,
  );
}

/**
 * Tally lead_lost_factor across Lost leads only.
 *
 * Seeds a Map with all 10 LOST_FACTORS at 0 so every category is always
 * present. Any null/empty/unknown factor on a Lost lead folds into 'Other'.
 * Output is returned in LOST_FACTORS order.
 */
export function aggregateLostFactors(
  rows: LostFactorRow[],
): { factor: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const factor of LOST_FACTORS) counts.set(factor, 0);

  for (const row of rows) {
    const raw = (row.lead_lost_factor ?? '').trim();
    const key = counts.has(raw) ? raw : 'Other';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return LOST_FACTORS.map((factor) => ({
    factor,
    count: counts.get(factor) ?? 0,
  }));
}

/**
 * Tally lead_status across all leads for the four NON-Lost statuses.
 *
 * Seeds a Map with New/Active/Progress/Successful at 0; Lost rows are ignored.
 * Output is returned in canonical (non-Lost) order.
 */
export function aggregateStatusCounts(
  rows: StatusRow[],
): { status: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const status of NON_LOST_STATUSES) counts.set(status, 0);

  for (const row of rows) {
    const status = (row.lead_status ?? '').trim();
    if (counts.has(status)) {
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
  }

  return NON_LOST_STATUSES.map((status) => ({
    status,
    count: counts.get(status) ?? 0,
  }));
}
