#!/usr/bin/env node
/**
 * Isolated smoke tests for the parseClassifierReply logic.
 *
 * The function is inlined here (copied verbatim from lib/lead-classifier.ts)
 * so we don't need to pull in Supabase env vars.  This lets us verify the
 * pure parsing/validation contract with zero external dependencies.
 *
 * Contract (current): the classifier returns a concise `lead_reason` for
 * EVERY status (not only Lost). Missing/blank/non-string reasons become null.
 *
 * Run with: node scripts/test-classifier-pure.mjs
 */

// ── Inline the constants and function from lib/lead-classifier.ts ───────────

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

function isLeadStatus(v) {
  return typeof v === 'string' && LEAD_STATUSES.includes(v);
}

function isLostFactor(v) {
  return typeof v === 'string' && LOST_FACTORS.includes(v);
}

/**
 * Verbatim copy of parseClassifierReply from lib/lead-classifier.ts
 * (TypeScript type annotations removed for plain-JS execution).
 */
function parseClassifierReply(raw) {
  if (!raw) return null;

  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  if (!text.startsWith('{')) {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) text = m[0];
  }

  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }

  if (!isLeadStatus(obj.lead_status)) return null;

  const status = obj.lead_status;
  const reason =
    typeof obj.lead_reason === 'string' && obj.lead_reason.trim()
      ? obj.lead_reason.trim().slice(0, 500)
      : null;

  const lostFactor =
    status === 'Lost' && isLostFactor(obj.lead_lost_factor)
      ? obj.lead_lost_factor
      : null;

  return { lead_status: status, lead_reason: reason, lead_lost_factor: lostFactor };
}

// ── Test harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label, condition, detail) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
    failed++;
  }
}

// ── Happy-path: all five statuses carry a reason ─────────────────────────────
for (const s of LEAD_STATUSES) {
  const raw = `{"lead_status":"${s}","lead_reason":"chat-derived reason for ${s}"}`;
  const r = parseClassifierReply(raw);
  assert(`status=${s} parses OK`, r !== null && r.lead_status === s, r);
  assert(`${s} keeps its reason`, r?.lead_reason === `chat-derived reason for ${s}`, r);
}

// ── Fence stripping ───────────────────────────────────────────────────────────
const withFence = '```json\n{"lead_status":"Active","lead_reason":"asked for callback"}\n```';
const rf = parseClassifierReply(withFence);
assert('strips ```json fences', rf?.lead_status === 'Active', rf);
assert('fenced Active keeps reason', rf?.lead_reason === 'asked for callback', rf);

// ── Plain ``` fence ───────────────────────────────────────────────────────────
const withPlainFence = '```\n{"lead_status":"Progress","lead_reason":"site visit booked"}\n```';
const rpf = parseClassifierReply(withPlainFence);
assert('strips plain ``` fences', rpf?.lead_status === 'Progress', rpf);

// ── Prose prefix fallback ─────────────────────────────────────────────────────
const withProse = 'Sure! Here is the result:\n{"lead_status":"Progress","lead_reason":"quotation shared"}\nEnd.';
const rp = parseClassifierReply(withProse);
assert('extracts JSON from prose', rp?.lead_status === 'Progress', rp);

// ── Invalid status → returns null ────────────────────────────────────────────
assert('invalid status -> null',
  parseClassifierReply('{"lead_status":"Unknown","lead_reason":"x"}') === null);

// ── Empty string → returns null ───────────────────────────────────────────────
assert('empty string -> null', parseClassifierReply('') === null);

// ── Malformed JSON → returns null ────────────────────────────────────────────
assert('malformed JSON -> null', parseClassifierReply('{bad json}') === null);

// ── Security: status injection — invalid enum still rejected ─────────────────
const statusInject = '{"lead_status":"Admin","lead_reason":"x"}';
assert('injected invalid status -> null', parseClassifierReply(statusInject) === null);

// ── Reason capped at 500 chars (any status) ──────────────────────────────────
const longReason = 'x'.repeat(600);
const longRaw = `{"lead_status":"Lost","lead_reason":"${longReason}"}`;
const rl = parseClassifierReply(longRaw);
assert('reason capped at 500 chars', rl !== null && rl.lead_reason !== null && rl.lead_reason.length === 500,
  `actual length=${rl?.lead_reason?.length}`);

// ── Missing reason → null ─────────────────────────────────────────────────────
const missingReason = '{"lead_status":"New","lead_reason":null}';
const rm = parseClassifierReply(missingReason);
assert('null reason -> null', rm?.lead_reason === null, rm);

// ── Empty / whitespace / non-string reason → null ────────────────────────────
assert('empty string reason -> null',
  parseClassifierReply('{"lead_status":"Active","lead_reason":""}')?.lead_reason === null);
assert('whitespace reason -> null',
  parseClassifierReply('{"lead_status":"Active","lead_reason":"   "}')?.lead_reason === null);
assert('numeric reason -> null',
  parseClassifierReply('{"lead_status":"Active","lead_reason":42}')?.lead_reason === null);

// ── Reason is trimmed ─────────────────────────────────────────────────────────
const padded = '{"lead_status":"Successful","lead_reason":"  construction started  "}';
assert('reason is trimmed', parseClassifierReply(padded)?.lead_reason === 'construction started');

// ── lead_lost_factor ─────────────────────────────────────────────────────────

// No factor field present -> null for every status.
for (const s of LEAD_STATUSES) {
  const r = parseClassifierReply(`{"lead_status":"${s}","lead_reason":"r"}`);
  assert(`${s} with no factor -> null`, r?.lead_lost_factor === null, r);
}

// Lost + each valid factor -> kept verbatim.
for (const f of LOST_FACTORS) {
  const raw = `{"lead_status":"Lost","lead_reason":"r","lead_lost_factor":"${f}"}`;
  const r = parseClassifierReply(raw);
  assert(`Lost + "${f}" kept`, r?.lead_lost_factor === f, r);
}

// Lost + garbage factor -> forced null (defends DB CHECK).
assert('Lost + invalid factor -> null',
  parseClassifierReply('{"lead_status":"Lost","lead_reason":"r","lead_lost_factor":"Made Up"}')?.lead_lost_factor === null);

// Non-Lost + a valid factor present -> forced null.
for (const s of ['New', 'Active', 'Progress', 'Successful']) {
  const raw = `{"lead_status":"${s}","lead_reason":"r","lead_lost_factor":"Not Interested"}`;
  assert(`${s} + factor present -> forced null`,
    parseClassifierReply(raw)?.lead_lost_factor === null);
}

// Lost + non-string factor -> null.
assert('Lost + numeric factor -> null',
  parseClassifierReply('{"lead_status":"Lost","lead_reason":"r","lead_lost_factor":42}')?.lead_lost_factor === null);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
