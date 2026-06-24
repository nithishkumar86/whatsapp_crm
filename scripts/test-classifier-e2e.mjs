#!/usr/bin/env node
/**
 * END-TO-END classifier test — REAL model, REAL shipped prompt.
 *
 * This is the test that actually matters for the business: it runs the
 * EXACT SYSTEM_PROMPT shipped in lib/lead-classifier.ts against the LIVE
 * OpenRouter model configured in agent_config, over realistic WhatsApp
 * conversations, and asserts the AI fills all three columns correctly:
 *
 *   - lead_status        — exactly one of the five
 *   - lead_reason        — concise, chat-derived, non-empty, <= ~50 tokens
 *   - lead_lost_factor   — one of the 10 categories ONLY when Lost, else null
 *
 * To avoid prompt drift, the SYSTEM_PROMPT is extracted from the real source
 * file at runtime — NOT copied here. The parse/validate logic mirrors
 * parseClassifierReply (proven equivalent by test-classifier-pure.mjs).
 *
 * It calls OpenRouter directly via fetch (no SDK / Supabase import, so no ESM
 * cycle). It does NOT touch the database and sends ZERO WhatsApp messages.
 *
 * Run with:  node scripts/test-classifier-e2e.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Minimal .env.local loader (no dependency on dotenv) ─────────────────────
function loadEnv() {
  const raw = readFileSync(join(ROOT, '.env.local'), 'utf8');
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
  return env;
}

const env = loadEnv();
const API_KEY = env.OPENROUTER_API_KEY;
const BASE_URL = env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
// Match production: the model configured in agent_config (id=1).
const MODEL = process.env.TEST_MODEL || 'google/gemini-3.1-flash-lite';

if (!API_KEY) {
  console.error('OPENROUTER_API_KEY missing from .env.local — cannot run e2e test.');
  process.exit(1);
}

// ── Extract the REAL SYSTEM_PROMPT from lib/lead-classifier.ts ───────────────
function extractSystemPrompt() {
  const src = readFileSync(join(ROOT, 'lib', 'lead-classifier.ts'), 'utf8');
  const m = src.match(/const SYSTEM_PROMPT = `([\s\S]*?)`;/);
  if (!m) throw new Error('Could not locate SYSTEM_PROMPT in lib/lead-classifier.ts');
  return m[1];
}
const SYSTEM_PROMPT = extractSystemPrompt();

// ── Enums + parser (mirrors lib/lead-classifier.ts) ─────────────────────────
const LEAD_STATUSES = ['New', 'Active', 'Progress', 'Lost', 'Successful'];
const LOST_FACTORS = [
  'Not Interested', 'Budget / Expectation Mismatch', 'Competitor Chosen',
  'No Response', 'Invalid Number', 'Duplicate Lead', 'Ghosted',
  'Tire Kicker', 'Land Ownership Issue', 'Other',
];
const isLeadStatus = (v) => typeof v === 'string' && LEAD_STATUSES.includes(v);
const isLostFactor = (v) => typeof v === 'string' && LOST_FACTORS.includes(v);

function parseClassifierReply(raw) {
  if (!raw) return null;
  let text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!text.startsWith('{')) {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) text = m[0];
  }
  let obj;
  try { obj = JSON.parse(text); } catch { return null; }
  if (!isLeadStatus(obj.lead_status)) return null;
  const status = obj.lead_status;
  const reason =
    typeof obj.lead_reason === 'string' && obj.lead_reason.trim()
      ? obj.lead_reason.trim().slice(0, 500) : null;
  const lostFactor =
    status === 'Lost' && isLostFactor(obj.lead_lost_factor) ? obj.lead_lost_factor : null;
  return { lead_status: status, lead_reason: reason, lead_lost_factor: lostFactor };
}

// ── OpenRouter call (same message shape as classifyLead) ────────────────────
async function classify(transcript) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...transcript,
    { role: 'user', content: 'Classify this lead now. Respond with STRICT JSON only as instructed.' },
  ];
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'X-Title': 'WhatsApp CRM e2e test',
    },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0 }),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter HTTP ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content;
  if (!reply) throw new Error('Empty reply from OpenRouter');
  return { raw: reply, parsed: parseClassifierReply(reply) };
}

// Helper to script a chat. `c` = customer (inbound/user), `b` = business (outbound/assistant).
const c = (content) => ({ role: 'user', content });
const b = (content) => ({ role: 'assistant', content });

// ── Realistic scenarios — one per status, plus two distinct Lost factors ────
const SCENARIOS = [
  {
    name: 'NEW — only welcome sent, no real reply',
    chat: [
      b('Hi! Thanks for your interest in Digital Tamizha. We build quality homes for landowners. May I know your name and the location of your plot?'),
    ],
    expectStatus: 'New',
    expectFactorNull: true,
  },
  {
    name: 'ACTIVE — interested but asked to be contacted later',
    chat: [
      b('Hi! We build homes for landowners. Are you planning to construct on your plot?'),
      c('Yes I have a plot in Avadi but I am busy this month. Please call me next month.'),
      b('Sure, no problem. We will reach out next month. Have a great day!'),
    ],
    expectStatus: 'Active',
    expectFactorNull: true,
  },
  {
    name: 'PROGRESS — site visit appointment scheduled',
    chat: [
      b('Hi! We build homes for landowners. Are you planning to construct on your plot?'),
      c('Yes, I want to build a 2BHK on my land in Tambaram. Can someone visit?'),
      b('Absolutely. Our engineer can visit your site. Does this Saturday 11 AM work?'),
      c('Saturday 11 AM is perfect. My plot is near Tambaram railway station.'),
      b('Done! Site visit confirmed for Saturday 11 AM. See you then.'),
    ],
    expectStatus: 'Progress',
    expectFactorNull: true,
  },
  {
    name: 'LOST — Competitor Chosen',
    chat: [
      b('Hi! Are you planning to construct on your plot?'),
      c('I was, but I have already signed with another builder last week. Sorry.'),
      b('Understood, thank you for letting us know. All the best with your project!'),
    ],
    expectStatus: 'Lost',
    expectFactor: 'Competitor Chosen',
  },
  {
    name: 'LOST — Budget / Expectation Mismatch',
    chat: [
      b('Thanks for sharing your requirement. For a 2BHK of 1000 sqft our cost is approximately 22 lakhs.'),
      c('That is way over my budget. I only have around 10 lakhs, this is too expensive for me.'),
      b('I understand. Do let us know if your budget changes in future.'),
      c('Ok but for now I cannot afford this. Please do not follow up.'),
    ],
    expectStatus: 'Lost',
    expectFactor: 'Budget / Expectation Mismatch',
  },
  {
    name: 'SUCCESSFUL — construction started',
    chat: [
      b('Great news — your agreement is signed and the advance is received.'),
      c('Yes, very happy. When does work begin?'),
      b('Our team broke ground today and foundation work has started on your plot.'),
      c('Excellent! I saw the workers at the site. Thank you so much.'),
    ],
    expectStatus: 'Successful',
    expectFactorNull: true,
  },
];

// ── Run ─────────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
function assert(label, ok, detail) {
  if (ok) { console.log(`  PASS  ${label}`); passed++; }
  else { console.error(`  FAIL  ${label}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); failed++; }
}

const tokenish = (s) => (s ? s.trim().split(/\s+/).length : 0); // rough word≈token proxy

console.log(`\nEnd-to-end classifier test — model=${MODEL}, temperature=0`);
console.log('Using the REAL SYSTEM_PROMPT extracted from lib/lead-classifier.ts\n');

for (const sc of SCENARIOS) {
  console.log(`── ${sc.name}`);
  let out;
  try {
    out = await classify(sc.chat);
  } catch (e) {
    assert(`${sc.name} — model call`, false, String(e.message));
    continue;
  }

  const r = out.parsed;
  console.log(`     model said: ${out.raw.replace(/\s+/g, ' ').slice(0, 200)}`);

  assert(`${sc.name} — parses to valid JSON`, r !== null, out.raw);
  if (!r) continue;

  assert(`${sc.name} — status = ${sc.expectStatus}`, r.lead_status === sc.expectStatus, r.lead_status);
  assert(`${sc.name} — reason present`, !!r.lead_reason, r.lead_reason);
  assert(`${sc.name} — reason concise (<= 50 words)`, tokenish(r.lead_reason) <= 50, tokenish(r.lead_reason));

  if (sc.expectFactorNull) {
    assert(`${sc.name} — lead_lost_factor is null (non-Lost)`, r.lead_lost_factor === null, r.lead_lost_factor);
  } else {
    assert(`${sc.name} — lead_lost_factor is a valid category`, isLostFactor(r.lead_lost_factor), r.lead_lost_factor);
    if (sc.expectFactor) {
      assert(`${sc.name} — factor = "${sc.expectFactor}"`, r.lead_lost_factor === sc.expectFactor, r.lead_lost_factor);
    }
  }
  console.log('');
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
