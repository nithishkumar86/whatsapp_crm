'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Script from 'next/script';

/**
 * Settings → WhatsApp Connection.
 *
 * Runs Meta's WhatsApp Embedded Signup in COEXISTENCE mode so the same
 * business number keeps working in the WhatsApp Business App while also
 * powering this CRM through the Cloud API.
 *
 * The SDK code below follows Meta's published Embedded Signup implementation
 * guide verbatim (SDK tag, FB.init, the `message` session listener,
 * fbLoginCallback, and launchWhatsAppSignup). Only two adaptations were
 * required:
 *   - React uses onClick instead of an inline onclick attribute.
 *   - extras.featureType = 'whatsapp_business_app_onboarding' is added, which
 *     is what switches the flow into coexistence (per Meta's coexistence doc;
 *     the old 'coexistence' value is deprecated).
 *
 * Embedded Signup returns its result over TWO separate channels that can
 * arrive in either order — the `message` event (asset ids) and the FB.login
 * callback (authorization code). Both are collected before the backend is
 * called, because the code is single-use and short-lived.
 */

const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID;
const CONFIG_ID = process.env.NEXT_PUBLIC_META_CONFIG_ID;
const GRAPH_API_VERSION = process.env.NEXT_PUBLIC_GRAPH_API_VERSION || 'v23.0';

// Meta's completion event for the WhatsApp Business App (coexistence) flow.
const FINISH_EVENT = 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING';

/**
 * Strict origin check for the Embedded Signup postMessage channel.
 *
 * Meta's published sample uses `event.origin.endsWith('facebook.com')`, which
 * also matches hostile look-alikes such as https://evilfacebook.com — any page
 * holding a reference to this window could then post a forged
 * WA_EMBEDDED_SIGNUP payload and steer onboarding at an attacker-chosen
 * waba_id. This anchors on the dot and requires HTTPS, while still allowing
 * every legitimate Meta subdomain (www / web / business.facebook.com).
 */
function isFacebookOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return host === 'facebook.com' || host.endsWith('.facebook.com');
}

interface Connection {
  connected: boolean;
  status: string;
  waba_id: string | null;
  phone_number_id: string | null;
  display_phone_number: string | null;
  verified_name: string | null;
  is_on_biz_app: boolean | null;
  platform_type: string | null;
  history_sync_status: string;
  contact_sync_status: string;
  last_error: string | null;
  token_expires_at: string | null;
  connected_at: string | null;
  env_fallback_active?: boolean;
  config_ready?: boolean;
}

declare global {
  interface Window {
    FB?: {
      init: (params: Record<string, unknown>) => void;
      login: (cb: (response: unknown) => void, params: Record<string, unknown>) => void;
    };
    fbAsyncInit?: () => void;
  }
}

export default function SettingsTab() {
  const [conn, setConn] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(
    null,
  );

  // The two Embedded Signup results, collected independently.
  const sessionRef = useRef<{ waba_id?: string; business_id?: string } | null>(null);
  const codeRef = useRef<string | null>(null);
  const submittedRef = useRef(false);
  const flowTerminatedRef = useRef(false);

  const loadConnection = useCallback(async () => {
    try {
      const res = await fetch('/api/meta/connection', { cache: 'no-store' });
      const data = (await res.json()) as Connection;
      setConn(data);
    } catch {
      setMessage({ kind: 'err', text: 'Could not load the connection status.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConnection();
  }, [loadConnection]);

  /**
   * Send the collected code + asset ids to the server. Runs only once both
   * channels have reported, and only once per signup attempt.
   */
  const submitIfReady = useCallback(async () => {
    if (submittedRef.current) return;
    const code = codeRef.current;
    const session = sessionRef.current;
    if (!code || !session?.waba_id) return;

    submittedRef.current = true;
    setBusy(true);
    setMessage({ kind: 'info', text: 'Finishing the connection…' });

    try {
      const res = await fetch('/api/meta/embedded-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          waba_id: session.waba_id,
          business_id: session.business_id,
        }),
      });
      const data = (await res.json()) as { error?: string; sync_warnings?: string[] };

      if (!res.ok) {
        setMessage({ kind: 'err', text: data.error || 'Connection failed.' });
      } else if (data.sync_warnings?.length) {
        setMessage({
          kind: 'ok',
          text: `Connected. History sync reported: ${data.sync_warnings.join(' | ')}`,
        });
      } else {
        setMessage({ kind: 'ok', text: 'WhatsApp connected successfully.' });
      }
      await loadConnection();
    } catch (err) {
      setMessage({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Connection failed.',
      });
    } finally {
      setBusy(false);
      codeRef.current = null;
      sessionRef.current = null;
    }
  }, [loadConnection]);

  // --- Meta: "Session logging message event listener" ---------------------
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!isFacebookOrigin(event.origin)) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'WA_EMBEDDED_SIGNUP') {
          if (data.event === FINISH_EVENT) {
            sessionRef.current = {
              waba_id: data.data?.waba_id,
              business_id: data.data?.business_id,
            };
            void submitIfReady();
          } else if (data.event === 'ERROR') {
            flowTerminatedRef.current = true;
            codeRef.current = null;
            sessionRef.current = null;
            submittedRef.current = false;
            setBusy(false);
            setMessage({
              kind: 'err',
              text:
                typeof data.data?.error_message === 'string'
                  ? `Signup error: ${data.data.error_message}`
                  : 'Meta could not complete WhatsApp Embedded Signup. Please try again.',
            });
          } else if (data.event === 'CANCEL') {
            flowTerminatedRef.current = true;
            codeRef.current = null;
            sessionRef.current = null;
            submittedRef.current = false;
            const step = data.data?.current_step;
            setMessage({
              kind: 'err',
              text: data.data?.error_message
                ? `Signup error: ${data.data.error_message}`
                : `Signup cancelled${step ? ` at step: ${step}` : ''}.`,
            });
            setBusy(false);
          }
        }
      } catch {
        // Non-JSON message from facebook.com — ignore.
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [submitIfReady]);

  // --- Meta: "Response callback" ------------------------------------------
  const fbLoginCallback = useCallback(
    (response: unknown) => {
      // ERROR and CANCEL session events contain the more useful explanation.
      // Do not let the later SDK callback overwrite that message.
      if (flowTerminatedRef.current) return;

      const authResponse = (response as { authResponse?: { code?: string } })?.authResponse;
      if (authResponse?.code) {
        codeRef.current = authResponse.code;
        void submitIfReady();
      } else {
        setBusy(false);
        setMessage({ kind: 'err', text: 'Signup was closed before it finished.' });
      }
    },
    [submitIfReady],
  );

  // --- Meta: "Launch method and callback registration" ---------------------
  const launchWhatsAppSignup = useCallback(() => {
    if (!window.FB) {
      setMessage({ kind: 'err', text: 'Facebook SDK has not loaded yet. Try again shortly.' });
      return;
    }
    if (!CONFIG_ID) {
      setMessage({ kind: 'err', text: 'NEXT_PUBLIC_META_CONFIG_ID is not configured.' });
      return;
    }

    submittedRef.current = false;
    flowTerminatedRef.current = false;
    codeRef.current = null;
    sessionRef.current = null;
    setMessage(null);
    setBusy(true);

    window.FB.login(fbLoginCallback, {
      config_id: CONFIG_ID,
      response_type: 'code',
      override_default_response_type: true,
      extras: {
        setup: {},
        featureType: 'whatsapp_business_app_onboarding',
        sessionInfoVersion: '3',
      },
    });
  }, [fbLoginCallback]);

  const ready = Boolean(APP_ID && CONFIG_ID);

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      {/* --- Meta: SDK loading --- */}
      <Script
        id="facebook-jssdk"
        strategy="afterInteractive"
        src="https://connect.facebook.net/en_US/sdk.js"
        crossOrigin="anonymous"
        onLoad={() => {
          // Meta: SDK initialization
          if (window.FB && APP_ID) {
            window.FB.init({
              appId: APP_ID,
              autoLogAppEvents: true,
              xfbml: true,
              version: GRAPH_API_VERSION,
            });
          }
        }}
      />

      <header className="mb-5">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">
          WhatsApp Connection
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Connect your WhatsApp Business number to the Cloud API. Coexistence keeps the number
          working in the WhatsApp Business App on your phone at the same time.
        </p>
      </header>

      {message && (
        <div
          className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
            message.kind === 'ok'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200'
              : message.kind === 'err'
                ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200'
                : 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Connection status */}
      <section className="mb-5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-5">
        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading status…</p>
        ) : conn?.connected ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Connected
              </span>
              {conn.is_on_biz_app && (
                <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  Coexistence active
                </span>
              )}
            </div>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Row label="Number" value={conn.display_phone_number} />
              <Row label="Name" value={conn.verified_name} />
              <Row label="Phone number ID" value={conn.phone_number_id} mono />
              <Row label="WABA ID" value={conn.waba_id} mono />
              <Row label="Platform" value={conn.platform_type} />
              <Row label="Contact sync" value={conn.contact_sync_status} />
              <Row label="History sync" value={conn.history_sync_status} />
              <Row
                label="Connected at"
                value={
                  conn.connected_at ? new Date(conn.connected_at).toLocaleString() : null
                }
              />
            </dl>
            {conn.last_error && (
              <p className="mt-3 break-words text-xs text-amber-700 dark:text-amber-400">
                Last warning: {conn.last_error}
              </p>
            )}
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              <span className="h-2 w-2 rounded-full bg-gray-400" />
              Not connected
            </span>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
              {conn?.env_fallback_active
                ? 'Sending currently uses the WHATSAPP_* environment variables. Connect a number to manage it from here instead.'
                : 'No WhatsApp number is connected yet.'}
            </p>
          </>
        )}
      </section>

      {/* Connect */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-5">
        <h2 className="mb-1 text-base font-semibold text-gray-900 dark:text-gray-100">
          {conn?.connected ? 'Reconnect' : 'Connect WhatsApp'}
        </h2>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Opens Meta&apos;s Embedded Signup in a popup. Sign in with the Facebook account that
          owns the business, then pick the WhatsApp Business Account and number.
        </p>

        {!ready && (
          <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            Set NEXT_PUBLIC_META_APP_ID and NEXT_PUBLIC_META_CONFIG_ID in the environment, then
            restart the server.
          </p>
        )}

        {/* Meta: Launch button (their styling, React onClick) */}
        <button
          onClick={launchWhatsAppSignup}
          disabled={!ready || busy}
          style={{
            backgroundColor: '#1877f2',
            border: 0,
            borderRadius: '4px',
            color: '#fff',
            cursor: !ready || busy ? 'not-allowed' : 'pointer',
            fontFamily: 'Helvetica, Arial, sans-serif',
            fontSize: '16px',
            fontWeight: 'bold',
            height: '40px',
            padding: '0 24px',
            opacity: !ready || busy ? 0.6 : 1,
            maxWidth: '100%',
          }}
        >
          {busy ? 'Connecting…' : 'Login with Facebook'}
        </button>

        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          Requires the WhatsApp Business app v2.24.17 or newer on the phone, and this site
          served over HTTPS on a domain registered in the Meta app.
        </p>
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd
        className={`break-all text-gray-900 dark:text-gray-100 ${mono ? 'font-mono text-xs' : ''}`}
      >
        {value || '—'}
      </dd>
    </div>
  );
}
