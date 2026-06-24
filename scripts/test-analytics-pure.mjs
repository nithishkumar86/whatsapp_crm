#!/usr/bin/env node
/**
 * Isolated smoke tests for the Lead Analytics pure logic.
 *
 * The aggregation helpers (app/api/dashboard/analytics/route.ts) and the pie
 * geometry helper (components/analytics/PieChart.tsx) are replicated verbatim
 * here so we can verify the pure contract with zero deps and no DB/network.
 *
 * Run with: node scripts/test-analytics-pure.mjs
 */

// ── Canonical constants (copied from lib/lead-classifier.ts) ────────────────

const LEAD_STATUSES = ['New', 'Active', 'Progress', 'Lost', 'Successful'];

const LOST_FACTORS = [
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
];

const NON_LOST_STATUSES = LEAD_STATUSES.filter((s) => s !== 'Lost');

// ── Aggregation helpers (copied from app/api/dashboard/analytics/route.ts) ──

function aggregateLostFactors(rows) {
  const counts = new Map();
  for (const factor of LOST_FACTORS) counts.set(factor, 0);
  for (const row of rows) {
    const raw = (row.lead_lost_factor ?? '').trim();
    const key = counts.has(raw) ? raw : 'Other';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return LOST_FACTORS.map((factor) => ({ factor, count: counts.get(factor) ?? 0 }));
}

function aggregateStatusCounts(rows) {
  const counts = new Map();
  for (const status of NON_LOST_STATUSES) counts.set(status, 0);
  for (const row of rows) {
    const status = (row.lead_status ?? '').trim();
    if (counts.has(status)) counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return NON_LOST_STATUSES.map((status) => ({ status, count: counts.get(status) ?? 0 }));
}

// ── Month helpers (copied from lib/analytics.ts) ────────────────────────────

const MONTH_VALUES = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

function istMonthNumOf(createdAt) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date(createdAt))
    .slice(5, 7);
}

function buildMonthList() {
  return [...MONTH_VALUES];
}

function filterRowsByMonth(rows, month) {
  return rows.filter((row) => row.created_at !== null && istMonthNumOf(row.created_at) === month);
}

// ── Pie geometry (copied from components/analytics/PieChart.tsx) ────────────

const CX = 50;
const CY = 50;
const R = 48;
const LABEL_R = 28;

function polar(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function computeSlices(data) {
  const total = data.reduce((sum, d) => sum + Math.max(0, d.value), 0);
  if (total <= 0) {
    return data.map((d) => ({ ...d, fraction: 0, pct: 0, path: '', labelX: CX, labelY: CY }));
  }
  const nonZero = data.filter((d) => d.value > 0);
  const isFullCircle = nonZero.length === 1;
  let cumulative = 0;
  return data.map((d) => {
    const value = Math.max(0, d.value);
    const fraction = value / total;
    const pct = Math.round(fraction * 100);
    if (value <= 0) {
      return { ...d, fraction: 0, pct: 0, path: '', labelX: CX, labelY: CY };
    }
    const startAngle = cumulative * 360;
    cumulative += fraction;
    const endAngle = cumulative * 360;
    const midAngle = (startAngle + endAngle) / 2;
    let path;
    if (isFullCircle) {
      const [tx, ty] = polar(CX, CY, R, 0);
      const [bx, by] = polar(CX, CY, R, 180);
      path = `M ${tx} ${ty} A ${R} ${R} 0 1 1 ${bx} ${by} A ${R} ${R} 0 1 1 ${tx} ${ty} Z`;
    } else {
      const [x1, y1] = polar(CX, CY, R, startAngle);
      const [x2, y2] = polar(CX, CY, R, endAngle);
      const largeArc = endAngle - startAngle > 180 ? 1 : 0;
      path = `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    }
    const [labelX, labelY] = polar(CX, CY, LABEL_R, midAngle);
    return { ...d, fraction, pct, path, labelX, labelY };
  });
}

// ── Tiny test harness ───────────────────────────────────────────────────────

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error(`  ✗ FAIL: ${name}`);
  }
}

// ── 1. Lost-factor aggregation ──────────────────────────────────────────────

{
  const rows = [
    { lead_lost_factor: 'Tire Kicker' },
    { lead_lost_factor: 'Tire Kicker' },
    { lead_lost_factor: 'No Response' },
    { lead_lost_factor: null }, // null on a Lost lead → Other
    { lead_lost_factor: '' }, // blank → Other
    { lead_lost_factor: 'Made Up Reason' }, // unknown → Other
  ];
  const out = aggregateLostFactors(rows);

  check('lost: returns all 10 categories', out.length === 10);
  check(
    'lost: in fixed LOST_FACTORS order',
    out.every((o, i) => o.factor === LOST_FACTORS[i]),
  );
  const get = (f) => out.find((o) => o.factor === f).count;
  check('lost: Tire Kicker tallied = 2', get('Tire Kicker') === 2);
  check('lost: No Response tallied = 1', get('No Response') === 1);
  check('lost: null + blank + unknown all fold into Other = 3', get('Other') === 3);
  check('lost: untouched category stays 0', get('Competitor Chosen') === 0);
  const totalCounted = out.reduce((s, o) => s + o.count, 0);
  check('lost: every row counted exactly once', totalCounted === rows.length);
}

{
  // Empty input → all 10 at zero.
  const out = aggregateLostFactors([]);
  check('lost: empty input yields 10 zero-count entries',
    out.length === 10 && out.every((o) => o.count === 0));
}

// ── 2. Status aggregation ────────────────────────────────────────────────────

{
  const rows = [
    { lead_status: 'New' },
    { lead_status: 'New' },
    { lead_status: 'Active' },
    { lead_status: 'Progress' },
    { lead_status: 'Successful' },
    { lead_status: 'Lost' }, // excluded
    { lead_status: 'Lost' }, // excluded
    { lead_status: null }, // ignored
    { lead_status: 'Bogus' }, // ignored
  ];
  const out = aggregateStatusCounts(rows);
  const get = (s) => out.find((o) => o.status === s).count;

  check('status: returns 4 non-Lost statuses', out.length === 4);
  check('status: excludes Lost', !out.some((o) => o.status === 'Lost'));
  check(
    'status: order is New, Active, Progress, Successful',
    out.map((o) => o.status).join(',') === 'New,Active,Progress,Successful',
  );
  check('status: New tallied = 2', get('New') === 2);
  check('status: Active tallied = 1', get('Active') === 1);
  check('status: Progress tallied = 1', get('Progress') === 1);
  check('status: Successful tallied = 1', get('Successful') === 1);
}

{
  // Missing statuses seed to 0.
  const out = aggregateStatusCounts([{ lead_status: 'New' }]);
  const get = (s) => out.find((o) => o.status === s).count;
  check('status: missing statuses default to 0',
    get('Active') === 0 && get('Progress') === 0 && get('Successful') === 0);
}

// ── 3. Geometry ──────────────────────────────────────────────────────────────

{
  const data = [
    { label: 'A', value: 3, color: '#000' },
    { label: 'B', value: 1, color: '#111' },
    { label: 'C', value: 4, color: '#222' },
    { label: 'D', value: 2, color: '#333' },
  ];
  const slices = computeSlices(data);
  const sumDeg = slices.reduce((s, sl) => s + sl.fraction * 360, 0);
  check('geom: slice angles sum to 360°', Math.abs(sumDeg - 360) < 1e-9);
  const sumFrac = slices.reduce((s, sl) => s + sl.fraction, 0);
  check('geom: fractions sum to 1', Math.abs(sumFrac - 1) < 1e-9);
  check('geom: every non-zero slice has a path', slices.every((s) => s.path.length > 0));
  check('geom: pct adds up to ~100', Math.abs(slices.reduce((s, sl) => s + sl.pct, 0) - 100) <= 2);
}

{
  // Single non-zero category → full circle (two-arc path), others empty.
  const data = [
    { label: 'A', value: 0, color: '#000' },
    { label: 'B', value: 7, color: '#111' },
    { label: 'C', value: 0, color: '#222' },
  ];
  const slices = computeSlices(data);
  const b = slices.find((s) => s.label === 'B');
  check('geom: single category fraction = 1', Math.abs(b.fraction - 1) < 1e-9);
  check('geom: single category is full circle (two A arcs)',
    (b.path.match(/A /g) || []).length === 2);
  check('geom: zero entries produce no path',
    slices.filter((s) => s.label !== 'B').every((s) => s.path === ''));
}

{
  // Empty / all-zero data → no slices drawn.
  const empty = computeSlices([]);
  check('geom: empty data → no slices', empty.length === 0);

  const allZero = computeSlices([
    { label: 'A', value: 0, color: '#000' },
    { label: 'B', value: 0, color: '#111' },
  ]);
  check('geom: all-zero data → no paths', allZero.every((s) => s.path === ''));
}

// ── 4. istMonthNumOf — IST boundary handling (month-of-year, year-ignored) ──

{
  // 2026-06-30T20:00:00Z == 2026-07-01 01:30 IST → rolls into July → "07".
  check(
    'istMonthNumOf: UTC late-night rolls into next IST month',
    istMonthNumOf('2026-06-30T20:00:00Z') === '07',
  );
  // 2026-06-30T17:00:00Z == 2026-06-30 22:30 IST → stays June → "06".
  check(
    'istMonthNumOf: UTC evening stays in same IST month',
    istMonthNumOf('2026-06-30T17:00:00Z') === '06',
  );
  // Year is ignored: June of two different years both bucket as "06".
  check(
    'istMonthNumOf: year-independent (2025 vs 2026 June → both 06)',
    istMonthNumOf('2025-06-10T06:00:00Z') === '06' && istMonthNumOf('2026-06-10T06:00:00Z') === '06',
  );
}

// ── 5. filterRowsByMonth (month-of-year only) ───────────────────────────────

{
  const rows = [
    { lead_status: 'New', lead_lost_factor: null, created_at: '2026-06-15T10:00:00Z' }, // June IST
    { lead_status: 'Lost', lead_lost_factor: 'Ghosted', created_at: '2026-07-02T05:00:00Z' }, // July IST
    { lead_status: 'Active', lead_lost_factor: null, created_at: '2026-06-30T20:00:00Z' }, // July IST (rolls over)
    { lead_status: 'Progress', lead_lost_factor: null, created_at: '2025-06-01T10:00:00Z' }, // June IST, prior YEAR
    { lead_status: 'New', lead_lost_factor: null, created_at: null }, // excluded (null)
  ];
  const june = filterRowsByMonth(rows, '06');
  const july = filterRowsByMonth(rows, '07');

  check('filter: June keeps both June-IST rows across years', june.length === 2);
  check('filter: June includes the prior-year June lead', june.some((r) => r.lead_status === 'Progress'));
  check('filter: July keeps both July-IST rows (incl. rolled-over)', july.length === 2);
  check(
    'filter: null created_at excluded from every month',
    !june.some((r) => r.created_at === null) && !july.some((r) => r.created_at === null),
  );
  check('filter: other months excluded', filterRowsByMonth(rows, '05').length === 0);
}

// ── 6. buildMonthList — always 12 month-of-year values, no year ─────────────

{
  const list = buildMonthList();

  check('buildMonthList: exactly 12 months', list.length === 12);
  check('buildMonthList: January first ("01")', list[0] === '01');
  check('buildMonthList: December last ("12")', list[11] === '12');
  check('buildMonthList: ascending order', list.every((m, i) => i === 0 || list[i - 1] < m));
  check('buildMonthList: no year present (all 2 chars)', list.every((m) => m.length === 2));
  check('buildMonthList: no duplicates', new Set(list).size === list.length);
  check(
    'buildMonthList: full "01".."12" set',
    list.join(',') === '01,02,03,04,05,06,07,08,09,10,11,12',
  );
}

// ── Summary ──────────────────────────────────────────────────────────────────

const total = pass + fail;
console.log(`\ntest-analytics-pure.mjs: ${pass}/${total} pass`);
if (fail > 0) process.exit(1);
