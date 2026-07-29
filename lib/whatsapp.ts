/**
 * WhatsApp Cloud API send functions (Meta Graph API).
 *
 * Server-side only. The access token must never be exposed to the browser.
 * WhatsApp does NOT store message history, so callers are responsible for
 * persisting every send into the `messages` table.
 *
 * CREDENTIALS
 * -----------
 * Credentials are resolved at call time by getWhatsAppCredentials():
 *
 *   1. The `whatsapp_config` row (id = 1) written by Embedded Signup —
 *      the access token is decrypted from AES-256-GCM (see lib/crypto.ts).
 *   2. Falls back to the WHATSAPP_* env vars when no number has been
 *      connected yet, so an existing deployment keeps working unchanged.
 *
 * Results are cached briefly so the inline AI reply in the webhook does not
 * pay a database round-trip per send. Call invalidateCredentialsCache() after
 * connecting or disconnecting a number.
 */

import { supabase } from '@/lib/supabase';
import { decryptToken } from '@/lib/crypto';

export interface WhatsAppCredentials {
  phoneNumberId: string;
  accessToken: string;
  apiVersion: string;
  /** Where the credentials came from — useful for diagnostics. */
  source: 'database' | 'env';
}

/** Default Graph API version for sending when nothing is configured. */
const DEFAULT_API_VERSION = 'v19.0';

/** Default Graph API version for the newer Embedded Signup / onboarding calls. */
const DEFAULT_SIGNUP_API_VERSION = 'v23.0';

/** How long a resolved credential set stays cached (ms). */
const CACHE_TTL_MS = 30_000;

let cache: { value: WhatsAppCredentials; expiresAt: number } | null = null;

/**
 * Drop the cached credentials so the next send re-reads the database.
 * Called after Embedded Signup connects (or a webhook disconnects) a number.
 */
export function invalidateCredentialsCache(): void {
  cache = null;
}

/**
 * Graph API version used for SENDING messages.
 *
 * WHATSAPP_API_VERSION deliberately wins here so that adding the newer
 * NEXT_PUBLIC_GRAPH_API_VERSION (for Embedded Signup) cannot silently change
 * the version an already-working deployment sends on.
 */
export function getApiVersion(): string {
  return (
    process.env.WHATSAPP_API_VERSION ||
    process.env.NEXT_PUBLIC_GRAPH_API_VERSION ||
    DEFAULT_API_VERSION
  );
}

/**
 * Graph API version used for Embedded Signup / onboarding calls, which need a
 * recent version (coexistence, smb_app_data). Independent of the send version.
 */
export function getSignupApiVersion(): string {
  return (
    process.env.NEXT_PUBLIC_GRAPH_API_VERSION ||
    process.env.WHATSAPP_API_VERSION ||
    DEFAULT_SIGNUP_API_VERSION
  );
}

/** Credentials from environment variables (pre-Embedded-Signup setup). */
function credentialsFromEnv(): WhatsAppCredentials | null {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) return null;

  return {
    phoneNumberId,
    accessToken,
    apiVersion: getApiVersion(),
    source: 'env',
  };
}

/**
 * Resolve the live WhatsApp credentials — database first, env fallback.
 *
 * Any failure reading or decrypting the stored row falls back to the env
 * vars rather than throwing, so a partially-configured connection can never
 * take down sending that already worked.
 */
export async function getWhatsAppCredentials(): Promise<WhatsAppCredentials> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;

  let resolved: WhatsAppCredentials | null = null;

  try {
    const { data } = await supabase
      .from('whatsapp_config')
      .select(
        'phone_number_id, access_token_ciphertext, token_iv, token_auth_tag, status',
      )
      .eq('id', 1)
      .maybeSingle();

    if (
      data?.status === 'connected' &&
      data.phone_number_id &&
      data.access_token_ciphertext &&
      data.token_iv &&
      data.token_auth_tag
    ) {
      resolved = {
        phoneNumberId: data.phone_number_id,
        accessToken: decryptToken({
          ciphertext: data.access_token_ciphertext,
          iv: data.token_iv,
          authTag: data.token_auth_tag,
        }),
        apiVersion: getApiVersion(),
        source: 'database',
      };
    }
  } catch (err) {
    // Table missing (migration not applied), decryption failure, or a
    // transient DB error — fall through to the env vars.
    // eslint-disable-next-line no-console
    console.error(
      '[whatsapp] could not read stored credentials, falling back to env:',
      err instanceof Error ? err.message : 'unknown error',
    );
  }

  if (!resolved) resolved = credentialsFromEnv();

  if (!resolved) {
    throw new Error(
      'No WhatsApp credentials available. Connect a number at /main/settings, ' +
        'or set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN.',
    );
  }

  cache = { value: resolved, expiresAt: now + CACHE_TTL_MS };
  return resolved;
}

function graphUrl(phoneNumberId: string, apiVersion: string): string {
  return `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
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
  const { phoneNumberId, accessToken, apiVersion } = await getWhatsAppCredentials();

  const res = await fetch(graphUrl(phoneNumberId, apiVersion), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
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
