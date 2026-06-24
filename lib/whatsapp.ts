/**
 * WhatsApp Cloud API send functions (Meta Graph API).
 *
 * Server-side only — reads WHATSAPP_* env vars. The access token must
 * never be exposed to the browser. WhatsApp does NOT store message
 * history, so callers are responsible for persisting every send into the
 * `messages` table.
 */

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v19.0';

function graphUrl(): string {
  if (!PHONE_NUMBER_ID) {
    throw new Error('Missing env var: WHATSAPP_PHONE_NUMBER_ID');
  }
  return `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;
}

export interface WhatsAppSendResult {
  /** WhatsApp's own message ID (wamid...) when the send succeeds. */
  wa_message_id: string | null;
  /** Raw JSON response from the Graph API. */
  raw: unknown;
}

/**
 * Low-level POST to the Graph API messages endpoint.
 * Throws on non-2xx so callers can record the failure.
 */
async function postMessage(payload: Record<string, unknown>): Promise<WhatsAppSendResult> {
  if (!ACCESS_TOKEN) {
    throw new Error('Missing env var: WHATSAPP_ACCESS_TOKEN');
  }

  const res = await fetch(graphUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const errMsg =
      (data as { error?: { message?: string } })?.error?.message ||
      `WhatsApp API request failed with status ${res.status}`;
    throw new Error(errMsg);
  }

  const waId =
    (data as { messages?: Array<{ id?: string }> })?.messages?.[0]?.id ?? null;

  return { wa_message_id: waId, raw: data };
}

/**
 * Send a plain text message.
 */
export async function sendText(
  to: string,
  body: string,
): Promise<WhatsAppSendResult> {
  if (!to) throw new Error('sendText: "to" phone number is required');
  if (!body) throw new Error('sendText: message body is required');

  return postMessage({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body },
  });
}

/**
 * Send a pre-approved template message.
 * `components` is the optional Meta template components array (for variables).
 */
export async function sendTemplate(
  to: string,
  templateName: string,
  languageCode = 'en',
  components?: unknown[],
): Promise<WhatsAppSendResult> {
  if (!to) throw new Error('sendTemplate: "to" phone number is required');
  if (!templateName) throw new Error('sendTemplate: templateName is required');

  const template: Record<string, unknown> = {
    name: templateName,
    language: { code: languageCode },
  };

  if (components && components.length > 0) {
    template.components = components;
  }

  return postMessage({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template,
  });
}

export type MediaType = 'image' | 'document' | 'video' | 'audio';

/**
 * Send a media message (image/document/video/audio) by hosted URL.
 * V1 actively supports image and document; the others are available for
 * forward compatibility.
 */
export async function sendMedia(
  to: string,
  mediaType: MediaType,
  mediaUrl: string,
  caption?: string,
  filename?: string,
): Promise<WhatsAppSendResult> {
  if (!to) throw new Error('sendMedia: "to" phone number is required');
  if (!mediaUrl) throw new Error('sendMedia: mediaUrl is required');

  const mediaObject: Record<string, unknown> = { link: mediaUrl };

  // Caption is supported on image, video, and document.
  if (caption && mediaType !== 'audio') {
    mediaObject.caption = caption;
  }
  // Filename is only meaningful for documents.
  if (filename && mediaType === 'document') {
    mediaObject.filename = filename;
  }

  return postMessage({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: mediaType,
    [mediaType]: mediaObject,
  });
}
