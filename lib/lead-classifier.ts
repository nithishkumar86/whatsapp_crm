import { supabase } from './supabase';
import { chatCompletion, type ChatMessage } from './openrouter';
import {
  LEAD_STATUSES,
  LOST_FACTORS,
  type LeadStatus,
  type LostFactor,
} from './lead-constants';

// Re-export the canonical enums so existing server-side imports
// (`from '@/lib/lead-classifier'`) keep working. Client code must import these
// from '@/lib/lead-constants' directly to avoid bundling the server clients.
export { LEAD_STATUSES, LOST_FACTORS };
export type { LeadStatus, LostFactor };

/**
 * AI Lead-Status Classifier — a SEPARATE AI agent from the reply bot in
 * lib/chatbot.ts.
 *
 * It reads a lead's whole conversation and assigns one of exactly five
 * statuses, plus a concise, chat-derived reason explaining WHY it chose that
 * status — for EVERY status, not only Lost.
 *
 * This is NEVER called from the WhatsApp webhook or the agent-send request
 * path — it runs only from the background idle sweeper cron, so it adds zero
 * latency to Meta's retry window. All Supabase access uses the service-role
 * client. The entity is `leads` throughout.
 */

/**
 * Fallback model when agent_config has no model set. Kept in sync with the
 * DEFAULT_MODEL constant used by lib/chatbot.ts.
 */
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-6';

/** Bound the history sent to the model for cost/latency. */
const MAX_MESSAGES = 120;
const MAX_CHARS = 12000;

interface MessageRow {
  direction: 'inbound' | 'outbound' | string;
  content: string | null;
  created_at: string;
}

export interface ClassifyResult {
  lead_status: LeadStatus;
  lead_reason: string | null;
  /** One of LOST_FACTORS when status is 'Lost'; otherwise always null. */
  lead_lost_factor: LostFactor | null;
}

const SYSTEM_PROMPT = `You are a lead-status classifier for a WhatsApp CRM run by a construction firm that builds homes for landowners. You read the ENTIRE conversation between the company and one lead, then decide the lead's current status AND explain why.

Choose EXACTLY ONE status from these five (use this exact spelling and casing):

- New: a welcome/template message was sent and the company is still waiting for the customer's first reply. The customer has not meaningfully replied yet.
- Active: the customer replied and a discussion started, but it has stalled or the customer needs time (e.g. "call me next week", "I'll discuss with my family", "call me next month", "not right now"). Interested but not yet moving forward.
- Progress: the lead is actively moving toward a purchase — a site visit/appointment is scheduled, a site visit is pending, negotiation is happening, or a quotation has been shared.
- Lost: a dead lead — not interested, budget problem, no response over a long time, invalid/wrong number, duplicate lead, or a tire-kicker who was only casually enquiring.
- Successful: the deal has progressed all the way through — appointment -> site visit done -> negotiation -> construction has started / the customer has committed.

RULES FOR "lead_reason":
- ALWAYS provide a reason — for EVERY status, not only Lost.
- It must explain WHY this exact status was chosen, derived ONLY from what actually happened in this chat. Never invent facts that are not in the conversation.
- Keep it accurate, precise and concise — one short sentence, at most ~40-50 tokens (about 30-40 words). No fluff, no padding.
- Examples by status:
  - New: "Welcome template sent; customer has not replied yet."
  - Active: "Replied with interest but asked to be called next week."
  - Progress: "Site visit appointment scheduled for this weekend."
  - Lost: "Said budget is too low and stopped responding."
  - Successful: "Site visit done and construction has started."
- If the conversation is ambiguous, prefer the most conservative status the evidence supports, and say so briefly in the reason.

RULES FOR "lead_lost_factor":
- Set this ONLY when lead_status is "Lost". For New, Active, Progress and Successful it MUST be null.
- When the status is Lost, choose EXACTLY ONE category from this list (use this exact spelling and casing), based ONLY on the chat history:
  - Not Interested: the customer is not interested in proceeding with the project.
  - Budget / Expectation Mismatch: the customer's financial expectations or sharing expectations do not match the company's offer.
  - Competitor Chosen: the customer decided to proceed with another builder or developer.
  - No Response: the customer did not respond despite multiple follow-ups.
  - Invalid Number: the phone number is incorrect, unreachable, or does not belong to the lead.
  - Duplicate Lead: the same lead already exists in the CRM.
  - Ghosted: the customer initially engaged but stopped responding later.
  - Tire Kicker: the customer asked many questions and consumed time but was not serious about moving forward.
  - Land Ownership Issue: legal, ownership, documentation, or family-dispute issues prevent the project from proceeding.
  - Other: any lost reason that does not fit the above categories.
- If status is Lost but the evidence does not clearly fit a specific category, use "Other".

Respond with STRICT JSON ONLY — no markdown, no code fences, no commentary. Exactly this shape:
{"lead_status":"<one of: New, Active, Progress, Lost, Successful>","lead_reason":"<short reason for the chosen status, never empty>","lead_lost_factor":"<one of the 10 categories when Lost, otherwise null>"}`;

/**
 * True when a value is one of the five allowed statuses.
 */
function isLeadStatus(v: unknown): v is LeadStatus {
  return (
    typeof v === 'string' && (LEAD_STATUSES as readonly string[]).includes(v)
  );
}

/**
 * True when a value is one of the ten allowed lost factors.
 */
function isLostFactor(v: unknown): v is LostFactor {
  return (
    typeof v === 'string' && (LOST_FACTORS as readonly string[]).includes(v)
  );
}

/**
 * Robustly parse the model's reply into a validated ClassifyResult.
 * Strips ``` fences, validates the enum, and keeps the concise reason for the
 * chosen status (any of the five). Returns null when the reply cannot be parsed.
 */
export function parseClassifierReply(raw: string): ClassifyResult | null {
  if (!raw) return null;

  // Strip ``` / ```json fences if present.
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // Fall back to the first {...} block if extra prose slipped in.
  if (!text.startsWith('{')) {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) text = m[0];
  }

  let obj: {
    lead_status?: unknown;
    lead_reason?: unknown;
    lead_lost_factor?: unknown;
  };
  try {
    obj = JSON.parse(text) as typeof obj;
  } catch {
    return null;
  }

  if (!isLeadStatus(obj.lead_status)) return null;

  const status = obj.lead_status;
  // A concise reason is expected for EVERY status now.
  const reason =
    typeof obj.lead_reason === 'string' && obj.lead_reason.trim()
      ? obj.lead_reason.trim().slice(0, 500)
      : null;

  // The lost factor is kept ONLY for Lost leads AND only when it is one of the
  // 10 allowed categories — otherwise forced to null. This defends the DB CHECK
  // even if the model emits a factor for a non-Lost status or an invalid value.
  const lostFactor: LostFactor | null =
    status === 'Lost' && isLostFactor(obj.lead_lost_factor)
      ? obj.lead_lost_factor
      : null;

  return { lead_status: status, lead_reason: reason, lead_lost_factor: lostFactor };
}

/**
 * Build the bounded, chronological chat transcript for the model.
 * Keeps the most recent messages within the message/char budget.
 */
function buildTranscript(rows: MessageRow[]): ChatMessage[] {
  // rows are chronological (oldest -> newest). Keep most recent MAX_MESSAGES.
  const recent = rows.slice(-MAX_MESSAGES);

  // Enforce the char budget from the newest end backward.
  const kept: MessageRow[] = [];
  let total = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const c = (recent[i].content ?? '').trim();
    if (!c) continue;
    if (total + c.length > MAX_CHARS && kept.length > 0) break;
    total += c.length;
    kept.unshift(recent[i]);
  }

  return kept.map<ChatMessage>((r) => ({
    role: r.direction === 'inbound' ? 'user' : 'assistant',
    content: r.content as string,
  }));
}

/**
 * Classify one lead by phone and persist the result.
 *
 * Steps:
 *   1. Read current lead_status (to detect Lost/Successful transitions).
 *   2. Fetch full chat history (chronological, non-empty), bounded for cost.
 *   3. Fetch agent_config.model (fallback DEFAULT_MODEL).
 *   4. Call OpenRouter at temperature 0 with the strict classifier prompt.
 *   5. Parse + validate; on invalid output, keep the current status.
 *   6. UPDATE leads (lead_status, lead_reason, last_classified_at).
 *   7. On transition INTO Lost/Successful, append a lead_events row.
 */
export async function classifyLead(phone: string): Promise<ClassifyResult> {
  if (!phone) throw new Error('classifyLead: phone is required');

  // 1. Current status, to detect transitions.
  const { data: leadRow, error: leadErr } = await supabase
    .from('leads')
    .select('lead_status')
    .eq('phone', phone)
    .single();

  if (leadErr) {
    throw new Error(`classifyLead: failed to fetch lead — ${leadErr.message}`);
  }

  const currentStatus: LeadStatus = isLeadStatus(leadRow?.lead_status)
    ? leadRow.lead_status
    : 'New';

  // 2. Full chat history, chronological.
  const { data: rawMessages, error: msgErr } = await supabase
    .from('messages')
    .select('direction, content, created_at')
    .eq('phone', phone)
    .order('created_at', { ascending: true })
    .limit(500);

  if (msgErr) {
    throw new Error(`classifyLead: failed to fetch messages — ${msgErr.message}`);
  }

  const history = ((rawMessages as MessageRow[]) || []).filter(
    (r) => r.content && r.content.trim(),
  );
  const transcript = buildTranscript(history);

  // No usable conversation yet — keep the current status, mark as classified.
  if (transcript.length === 0) {
    const result: ClassifyResult = {
      lead_status: currentStatus,
      lead_reason: null,
      lead_lost_factor: null,
    };
    await persist(phone, result, currentStatus);
    return result;
  }

  // 3. Model from agent_config (free-text, dashboard-editable).
  const { data: cfg } = await supabase
    .from('agent_config')
    .select('model')
    .eq('id', 1)
    .maybeSingle();
  const model = (cfg?.model as string) || DEFAULT_MODEL;

  // 4. Call OpenRouter at temperature 0.
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...transcript,
    {
      role: 'user',
      content:
        'Classify this lead now. Respond with STRICT JSON only as instructed.',
    },
  ];

  const raw = await chatCompletion({ model, messages, temperature: 0 });

  // 5. Parse + validate; keep current status on invalid output.
  const parsed = parseClassifierReply(raw);
  const result: ClassifyResult = parsed ?? {
    lead_status: currentStatus,
    lead_reason: null,
    lead_lost_factor: null,
  };

  // 6 + 7. Persist and emit transition events.
  await persist(phone, result, currentStatus);
  return result;
}

/**
 * Write the classification to the lead row and append a lead_events row when
 * the lead transitions INTO Lost or Successful. The reason is now stored for
 * every status (lead_reason), so it is persisted as-is.
 */
async function persist(
  phone: string,
  result: ClassifyResult,
  previousStatus: LeadStatus,
): Promise<void> {
  const { error: updErr } = await supabase
    .from('leads')
    .update({
      lead_status: result.lead_status,
      lead_reason: result.lead_reason,
      lead_lost_factor: result.lead_lost_factor,
      last_classified_at: new Date().toISOString(),
    })
    .eq('phone', phone);

  if (updErr) {
    throw new Error(`classifyLead: failed to update lead — ${updErr.message}`);
  }

  // Emit a business event only on a genuine transition INTO Lost/Successful.
  if (result.lead_status !== previousStatus) {
    if (result.lead_status === 'Lost') {
      await supabase.from('lead_events').insert({
        phone,
        event_type: 'lead_lost',
        event_description: result.lead_reason
          ? `Lead lost — ${result.lead_reason}`
          : 'Lead lost',
      });
    } else if (result.lead_status === 'Successful') {
      await supabase.from('lead_events').insert({
        phone,
        event_type: 'lead_converted',
        event_description: result.lead_reason
          ? `Lead marked Successful — ${result.lead_reason}`
          : 'Lead marked Successful by classifier',
      });
    }
  }
}
