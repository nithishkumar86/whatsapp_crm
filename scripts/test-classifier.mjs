#!/usr/bin/env node
/**
 * Smoke tests for parseClassifierReply (pure function, no network).
 * Imports the real implementation from lib/lead-classifier.ts.
 *
 * Contract (current): a concise `lead_reason` is returned for EVERY status;
 * missing/blank/non-string reasons become null.
 *
 * Run with: node --import tsx/esm scripts/test-classifier.mjs
 */

// Use dynamic import so tsx can transpile the .ts file
const { parseClassifierReply, LEAD_STATUSES, LOST_FACTORS } = await import('../lib/lead-classifier.ts');

let passed = 0;
let failed = 0;

function assert(label, condition, detail) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

// Happy-path: all five statuses carry a reason
for (const s of LEAD_STATUSES) {
  const raw = `{"lead_status":"${s}","lead_reason":"reason for ${s}"}`;
  const r = parseClassifierReply(raw);
  assert(`status=${s} parses OK`, r !== null && r.lead_status === s, JSON.stringify(r));
  assert(`${s} keeps its reason`, r?.lead_reason === `reason for ${s}`, JSON.stringify(r));
}

// Fence stripping
const withFence = '```json\n{"lead_status":"Active","lead_reason":"asked for callback"}\n```';
const rf = parseClassifierReply(withFence);
assert('strips ```json fences', rf?.lead_status === 'Active', JSON.stringify(rf));

// Prose prefix fallback
const withProse = 'Sure! Here is the result:\n{"lead_status":"Progress","lead_reason":"site visit booked"}\nEnd.';
const rp = parseClassifierReply(withProse);
assert('extracts JSON from prose', rp?.lead_status === 'Progress', JSON.stringify(rp));

// Invalid status -> returns null
const badStatus = '{"lead_status":"Unknown","lead_reason":"x"}';
assert('invalid status -> null', parseClassifierReply(badStatus) === null);

// Empty string -> returns null
assert('empty string -> null', parseClassifierReply('') === null);

// Malformed JSON -> returns null
assert('malformed JSON -> null', parseClassifierReply('{bad json}') === null);

// Reason capped at 500 chars (any status)
const longReason = 'x'.repeat(600);
const longRaw = `{"lead_status":"Lost","lead_reason":"${longReason}"}`;
const rl = parseClassifierReply(longRaw);
assert('reason capped at 500 chars', rl?.lead_reason !== null && rl.lead_reason.length === 500, `len=${rl?.lead_reason?.length}`);

// Missing / blank / non-string reason -> null
assert('null reason -> null', parseClassifierReply('{"lead_status":"New","lead_reason":null}')?.lead_reason === null);
assert('empty string reason -> null', parseClassifierReply('{"lead_status":"Active","lead_reason":""}')?.lead_reason === null);
assert('numeric reason -> null', parseClassifierReply('{"lead_status":"Active","lead_reason":42}')?.lead_reason === null);

// ── lead_lost_factor ─────────────────────────────────────────────────────────

// Every status with NO factor field present -> factor is null.
for (const s of LEAD_STATUSES) {
  const r = parseClassifierReply(`{"lead_status":"${s}","lead_reason":"r"}`);
  assert(`${s} with no factor -> null`, r?.lead_lost_factor === null, JSON.stringify(r));
}

// Lost + each valid factor -> kept verbatim.
for (const f of LOST_FACTORS) {
  const raw = `{"lead_status":"Lost","lead_reason":"r","lead_lost_factor":"${f}"}`;
  const r = parseClassifierReply(raw);
  assert(`Lost + "${f}" kept`, r?.lead_lost_factor === f, JSON.stringify(r));
}

// Lost + garbage factor -> forced null (defends DB CHECK).
assert('Lost + invalid factor -> null',
  parseClassifierReply('{"lead_status":"Lost","lead_reason":"r","lead_lost_factor":"Made Up"}')?.lead_lost_factor === null);

// Non-Lost + a valid factor present -> forced null (only Lost may carry one).
for (const s of ['New', 'Active', 'Progress', 'Successful']) {
  const raw = `{"lead_status":"${s}","lead_reason":"r","lead_lost_factor":"Not Interested"}`;
  const r = parseClassifierReply(raw);
  assert(`${s} + factor present -> forced null`, r?.lead_lost_factor === null, JSON.stringify(r));
}

// Lost + non-string factor -> null.
assert('Lost + numeric factor -> null',
  parseClassifierReply('{"lead_status":"Lost","lead_reason":"r","lead_lost_factor":42}')?.lead_lost_factor === null);

// Summary
console.log('');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
