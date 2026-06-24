import { supabase } from './supabase';
import { chatCompletion, type ChatMessage } from './openrouter';

/**
 * Stateless per-lead AI chatbot.
 *
 * For each inbound message we rebuild the session from the database:
 *   1. last 20 messages for this phone
 *   2. agent_config (instructions, model, temperature)
 *   3. property_files context (prefer summary -> extracted_text -> name+url)
 *
 * The system prompt is: instructions, then property context, then the
 * conversation goal (collect name, location preference, visit date
 * and time). When all booking details are present we create an appointment
 * and write `appointment_booked` to lead_events.
 *
 * generateAIReply returns the assistant reply text. The CALLER is
 * responsible for sending it over WhatsApp and saving the outbound message.
 */

const HISTORY_LIMIT = 20;

interface AgentConfigRow {
  instructions: string;
  model: string;
  temperature: number;
}

interface MessageRow {
  direction: 'inbound' | 'outbound';
  content: string | null;
  created_at: string;
}

interface PropertyFileRow {
  file_name: string;
  file_url: string;
  extracted_text: string | null;
  summary: string | null;
}

interface LeadRow {
  full_name: string | null;
  location_preference: string | null;
}

const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-6';

const CONVERSATION_GOAL = `Your goal in this conversation is to qualify the lead and, when the lead is ready, book a site visit appointment. To book a site visit you must collect ALL of the following details:
- the customer's full name
- their preferred location
- a specific visit date
- a specific visit time

Ask for any missing details naturally, one or two at a time. Do not invent details. Once you have all four, confirm the appointment with the customer.`;

/**
 * Machine-read action tags the model can emit. The webhook detects these,
 * performs the real action (send brochure / create appointment), and strips
 * them from the text before the customer sees it.
 */
const ACTION_INSTRUCTIONS = `ACTIONS YOU CAN TRIGGER (follow these formats EXACTLY — they are read by the system and removed before the customer sees your message):

1. SEND THE BROCHURE: If the customer asks for the brochure / property file / PDF / images, add the exact tag [SEND_BROCHURE] at the very end of your reply. The system then sends the brochure file to them automatically. Never paste a link yourself — just add the tag.

2. BOOK THE SITE VISIT: When you have ALL four details (full name, preferred location, visit date, visit time) AND the customer has agreed, end your reply with ONE line in exactly this format:
[BOOK_APPOINTMENT]{"full_name":"<name>","location_preference":"<location>","visit_date":"YYYY-MM-DD","visit_time":"HH:MM","map_link":"<google maps link or exact address the customer shared, else empty string>"}
Use 24-hour time (e.g. 16:30). Convert relative dates like "today"/"tomorrow" into an absolute YYYY-MM-DD using TODAY'S DATE above. For "map_link", copy the EXACT Google Maps URL (or written address) the customer gave for the land — do not invent or alter it; use "" if none was shared. Output this tag only once, at the moment you confirm the booking.

Write your normal reply naturally; just append the tag(s) when needed. Do not mention the tags to the customer.`;

/**
 * Today's date in Asia/Kolkata, for resolving relative dates like "tomorrow".
 */
export function todayInIST(): { iso: string; pretty: string } {
  const now = new Date();
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
  const pretty = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(now);
  return { iso, pretty };
}

/**
 * Detect explicit appointment confirmation markers in conversation text.
 * Used as a lightweight signal alongside structured extraction.
 */
export function hasBookingIntent(text: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  return (
    t.includes('book') ||
    t.includes('site visit') ||
    t.includes('appointment') ||
    t.includes('schedule') ||
    t.includes('visit on') ||
    t.includes('come on')
  );
}

/**
 * Build the property-file context block for the system prompt.
 * Prefers summary, then extracted_text, then file_name + file_url.
 */
export function buildPropertyContext(files: PropertyFileRow[]): string {
  if (!files || files.length === 0) return '';

  const blocks = files.map((f) => {
    // Prefer the summary (used for long docs, already <= DOC_CHAR_LIMIT).
    if (f.summary && f.summary.trim()) {
      return `- ${f.file_name}:\n${f.summary.trim().slice(0, DOC_CHAR_LIMIT)}`;
    }
    // Short docs are used verbatim; bound to DOC_CHAR_LIMIT as a safety net.
    if (f.extracted_text && f.extracted_text.trim()) {
      const text = f.extracted_text.trim().slice(0, DOC_CHAR_LIMIT);
      return `- ${f.file_name}:\n${text}`;
    }
    return `- ${f.file_name} (reference): ${f.file_url}`;
  });

  return `PROPERTY INFORMATION (use this to answer questions accurately):\n${blocks.join('\n')}`;
}

/**
 * Assemble the full system prompt: instructions, property context, goal.
 */
export function buildSystemPrompt(
  instructions: string,
  propertyContext: string,
  extras?: { dateLine?: string; actions?: string },
): string {
  const parts: string[] = [];
  parts.push(
    instructions && instructions.trim()
      ? instructions.trim()
      : 'You are a helpful WhatsApp assistant for BRIQ Foundation.',
  );
  if (extras?.dateLine) parts.push(extras.dateLine);
  if (propertyContext) parts.push(propertyContext);
  parts.push(CONVERSATION_GOAL);
  if (extras?.actions) parts.push(extras.actions);
  return parts.join('\n\n');
}

/**
 * Parse the model's raw reply for action tags. Returns the cleaned customer-
 * facing text plus the detected actions. Tags are stripped from the text.
 */
/**
 * True when the AI's own reply text announces it is sharing the brochure —
 * used as a deterministic fallback when the model forgets the [SEND_BROCHURE] tag.
 */
// Deterministic brochure-intent fallbacks (model-independent).
export function replyAnnouncesBrochure(text: string): boolean {
  if (!text) return false;
  return /(here\s+(is|'?s)\s+(our|the|your)\s+brochure|brochure\s+for\s+your\s+reference|shar(?:e|ing)\s+(?:our|the|you\s+the)?\s*brochure|attach(?:ed|ing)?[^.]*brochure|please\s+find[^.]*brochure)/i.test(
    text,
  );
}

/**
 * True when the CUSTOMER's message is explicitly asking for the brochure /
 * property file / catalogue / PDF. Used by the webhook as a second
 * deterministic trigger so a clear request always delivers the file.
 */
export function customerWantsBrochure(text: string): boolean {
  if (!text) return false;
  return /(brochure|broucher|broacher|catalog(?:ue)?|property\s+(?:file|document|pdf)|\bpdf\b)/i.test(
    text,
  );
}

export function parseActions(raw: string): {
  reply: string;
  sendBrochure: boolean;
  booking: AppointmentDetails | null;
} {
  let text = raw || '';
  let sendBrochure = false;
  let booking: AppointmentDetails | null = null;

  if (/\[SEND_BROCHURE\]/i.test(text)) {
    sendBrochure = true;
    text = text.replace(/\[SEND_BROCHURE\]/gi, '');
  }

  // Fallback: Gemini sometimes announces the brochure in prose but forgets the
  // [SEND_BROCHURE] tag (the file then never goes out). If the reply clearly
  // says it is sharing/attaching the brochure, trigger the send anyway so the
  // customer actually receives the file.
  if (!sendBrochure && replyAnnouncesBrochure(text)) {
    sendBrochure = true;
  }

  const bookMatch = text.match(/\[BOOK_APPOINTMENT\]\s*(\{[\s\S]*?\})/i);
  if (bookMatch) {
    try {
      const obj = JSON.parse(bookMatch[1]) as Partial<AppointmentDetails>;
      if (isBookingComplete(obj)) booking = obj;
    } catch {
      /* malformed JSON — ignore, no booking */
    }
    text = text.replace(bookMatch[0], '');
  }

  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return { reply: text, sendBrochure, booking };
}

export interface BrochureFile {
  file_url: string;
  file_type: string;
  file_name: string;
}

/**
 * Pick the brochure to send: the media-category property file. Prefers one
 * whose name mentions "brochure", else the most recently uploaded media file.
 */
export async function getBrochureFile(): Promise<BrochureFile | null> {
  const { data, error } = await supabase
    .from('property_files')
    .select('file_name, file_url, file_type, uploaded_at')
    .eq('category', 'media')
    .order('uploaded_at', { ascending: false });

  if (error || !data || data.length === 0) return null;

  const preferred =
    data.find((f) => /brochure/i.test(f.file_name as string)) ?? data[0];
  return {
    file_url: preferred.file_url as string,
    file_type: preferred.file_type as string,
    file_name: preferred.file_name as string,
  };
}

/**
 * Map DB message rows (chronological) into OpenAI-format chat messages.
 */
export function toChatMessages(rows: MessageRow[]): ChatMessage[] {
  return rows
    .filter((r) => r.content && r.content.trim())
    .map<ChatMessage>((r) => ({
      role: r.direction === 'inbound' ? 'user' : 'assistant',
      content: r.content as string,
    }));
}

export interface GenerateAIReplyResult {
  reply: string;
  model: string;
  /** True when the model asked to send the brochure file. */
  sendBrochure: boolean;
  /** Complete booking details when the model confirmed an appointment. */
  booking: AppointmentDetails | null;
}

/**
 * Generate an AI reply for the given phone number.
 * Returns the reply text and the model used.
 */
export async function generateAIReply(
  phone: string,
): Promise<GenerateAIReplyResult> {
  if (!phone) throw new Error('generateAIReply: phone is required');

  // 1. Last 20 messages (fetch newest-first, then reverse to chronological).
  const { data: rawMessages, error: msgErr } = await supabase
    .from('messages')
    .select('direction, content, created_at')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);

  if (msgErr) {
    throw new Error(`generateAIReply: failed to fetch messages — ${msgErr.message}`);
  }

  const history: MessageRow[] = ((rawMessages as MessageRow[]) || []).reverse();

  // 2. agent_config (single row, id = 1).
  const { data: configRow, error: cfgErr } = await supabase
    .from('agent_config')
    .select('instructions, model, temperature')
    .eq('id', 1)
    .single();

  if (cfgErr) {
    throw new Error(`generateAIReply: failed to fetch agent_config — ${cfgErr.message}`);
  }

  const config = configRow as AgentConfigRow;
  const model = config?.model || DEFAULT_MODEL;
  const temperature =
    typeof config?.temperature === 'number' ? config.temperature : 0.7;

  // 3. property_files context — ONLY parsed documents (category='document').
  //    Media files (images/brochures) are for sending to customers, not for
  //    the AI context, so they are excluded here.
  const { data: fileRows, error: fileErr } = await supabase
    .from('property_files')
    .select('file_name, file_url, extracted_text, summary')
    .eq('category', 'document');

  if (fileErr) {
    throw new Error(`generateAIReply: failed to fetch property_files — ${fileErr.message}`);
  }

  const propertyContext = buildPropertyContext((fileRows as PropertyFileRow[]) || []);

  // 4. Build the system prompt with today's date (for relative dates) and the
  //    machine-read action tags (brochure send + appointment booking).
  const { iso, pretty } = todayInIST();
  const dateLine = `TODAY'S DATE: ${pretty} (${iso}), timezone Asia/Kolkata.`;
  const systemPrompt = buildSystemPrompt(config?.instructions || '', propertyContext, {
    dateLine,
    actions: ACTION_INSTRUCTIONS,
  });

  // 5. Compose messages: system + chronological history.
  const chatMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...toChatMessages(history),
  ];

  // 6. Call OpenRouter, then parse out any action tags.
  const raw = await chatCompletion({
    model,
    messages: chatMessages,
    temperature,
  });

  const { reply, sendBrochure, booking } = parseActions(raw);
  return { reply, model, sendBrochure, booking };
}

/**
 * Maximum characters of property-document text the agent should hold per file.
 * Documents at or below this length are used verbatim; longer ones are
 * summarized down to fit within it.
 */
export const DOC_CHAR_LIMIT = 5000;

/**
 * Summarize a long property document into a dense, factual digest that fits
 * within `limit` characters. Preserves the concrete facts a sales agent needs
 * (prices, sizes, locations, amenities, contacts, project names, FAQ answers).
 * Falls back to a hard truncation if the LLM call fails, so the caller always
 * gets usable text.
 */
export async function summarizeToLimit(
  text: string,
  limit: number = DOC_CHAR_LIMIT,
): Promise<string> {
  const clean = (text || '').trim();
  if (clean.length <= limit) return clean;

  // Use the configured agent model (free-text, dashboard-editable).
  const { data: cfg } = await supabase
    .from('agent_config')
    .select('model')
    .eq('id', 1)
    .maybeSingle();
  const model = (cfg?.model as string) || DEFAULT_MODEL;

  const prompt = `You are condensing a real estate property document so a WhatsApp sales agent can answer customer questions from it. Rewrite the document below into a dense, factual summary of AT MOST ${limit} characters. Keep ALL concrete facts: project names, prices/budgets, plot/flat sizes, locations, amenities, legal/JV terms, contact numbers, website, and every FAQ with its answer. Use short lines or bullet points. Do not add opinions, greetings, or commentary — only the facts.

DOCUMENT:
${clean}`;

  try {
    const raw = await chatCompletion({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    });
    const summary = (raw || '').trim();
    // Guarantee the hard cap regardless of what the model returned.
    return (summary || clean).slice(0, limit);
  } catch {
    // LLM unavailable — fall back to a plain truncation so context is never empty.
    return clean.slice(0, limit);
  }
}

export interface AppointmentDetails {
  full_name: string;
  location_preference: string;
  visit_date: string; // YYYY-MM-DD
  visit_time: string; // HH:MM
  map_link?: string; // Google Maps URL / address the customer shared (optional)
}

/**
 * Returns true only when every REQUIRED booking field is present and non-empty.
 * map_link is optional — a booking is still valid without it.
 */
export function isBookingComplete(
  details: Partial<AppointmentDetails> | null | undefined,
): details is AppointmentDetails {
  if (!details) return false;
  return Boolean(
    details.full_name &&
      details.location_preference &&
      details.visit_date &&
      details.visit_time,
  );
}

/**
 * Persist a booked appointment and write the appointment_booked event.
 * location_preference is stored as a snapshot at booking time.
 */
export async function bookAppointment(
  phone: string,
  details: AppointmentDetails,
  bookedBy: 'ai' | 'agent' = 'ai',
): Promise<void> {
  if (!isBookingComplete(details)) {
    throw new Error('bookAppointment: incomplete booking details');
  }

  const mapLink = details.map_link && details.map_link.trim() ? details.map_link.trim() : null;
  const { error: insertErr } = await supabase.from('appointments').insert({
    phone,
    full_name: details.full_name,
    visit_date: details.visit_date,
    visit_time: details.visit_time,
    location_preference: details.location_preference,
    map_link: mapLink,
    booked_by: bookedBy,
  });

  if (insertErr) {
    throw new Error(`bookAppointment: insert failed — ${insertErr.message}`);
  }

  const { error: eventErr } = await supabase.from('lead_events').insert({
    phone,
    event_type: 'appointment_booked',
    event_description: `Site visit booked for ${details.visit_date} ${details.visit_time}`,
  });

  if (eventErr) {
    throw new Error(`bookAppointment: lead_event write failed — ${eventErr.message}`);
  }
}

// Re-export the lead shape for callers that snapshot lead fields at booking.
export type { LeadRow };
