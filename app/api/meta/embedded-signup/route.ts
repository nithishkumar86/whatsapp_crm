import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { encryptToken } from '@/lib/crypto';
import { getSignupApiVersion, invalidateCredentialsCache } from '@/lib/whatsapp';

/**
 * POST /api/meta/embedded-signup
 *
 * Completes WhatsApp Embedded Signup in COEXISTENCE mode — the business
 * number keeps working in the WhatsApp Business App while also running on
 * the Cloud API that powers this CRM.
 *
 * The browser sends only the short-lived, single-use authorization code plus
 * the WABA id from the WA_EMBEDDED_SIGNUP session event. The phone number id
 * is DISCOVERED server-side — never trusted from the client.
 *
 * Steps:
 *   1. Exchange the code for a Business Integration System User token.
 *   2. Subscribe this app to the customer's WABA.
 *   3. Discover the phone number id on that WABA.
 *   4. Verify coexistence (is_on_biz_app + platform_type=CLOUD_API).
 *   5. Encrypt the token and upsert whatsapp_config (id = 1).
 *   6. Kick off the one-time contact + history sync (24-hour window).
 *
 * Protected by the session middleware (any /api/* outside PUBLIC_API_PREFIXES).
 * SECURITY: never log the code, the token, or META_APP_SECRET.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const GRAPH = 'https://graph.facebook.com';

interface SignupBody {
  code?: unknown;
  waba_id?: unknown;
  business_id?: unknown;
}

/** Meta asset ids are numeric strings. */
function isValidAssetId(value: unknown): value is string {
  return typeof value === 'string' && /^\d{1,25}$/.test(value);
}

interface PhoneNumberRecord {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
  is_on_biz_app?: boolean;
  platform_type?: string;
}

/** Read a Graph error message without leaking the request that caused it. */
async function graphError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body?.error?.message || `${fallback} (status ${res.status})`;
  } catch {
    return `${fallback} (status ${res.status})`;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const version = getSignupApiVersion();

  if (!appId || !appSecret) {
    return NextResponse.json(
      { error: 'Server is missing NEXT_PUBLIC_META_APP_ID / META_APP_SECRET.' },
      { status: 500 },
    );
  }
  let body: SignupBody;
  try {
    body = (await req.json()) as SignupBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { code, waba_id: wabaId, business_id: businessId } = body;

  if (typeof code !== 'string' || !code.trim()) {
    return NextResponse.json({ error: 'code is required' }, { status: 400 });
  }
  if (!isValidAssetId(wabaId)) {
    return NextResponse.json({ error: 'waba_id must be a numeric id' }, { status: 400 });
  }
  if (businessId !== undefined && businessId !== null && !isValidAssetId(businessId)) {
    return NextResponse.json({ error: 'business_id must be a numeric id' }, { status: 400 });
  }

  try {
    // -------------------------------------------------------------------
    // 1. Exchange the authorization code (single use, short-lived ~30s)
    //    for a Business Integration System User token.
    // -------------------------------------------------------------------
    const tokenUrl = new URL(`${GRAPH}/${version}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id', appId);
    tokenUrl.searchParams.set('client_secret', appSecret);
    tokenUrl.searchParams.set('code', code);

    const tokenRes = await fetch(tokenUrl.toString(), { cache: 'no-store' });
    if (!tokenRes.ok) {
      return NextResponse.json(
        { error: await graphError(tokenRes, 'Failed to exchange the authorization code') },
        { status: 400 },
      );
    }

    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      token_type?: string;
      expires_in?: number;
    };

    const accessToken = tokenJson.access_token;
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Meta did not return an access token.' },
        { status: 502 },
      );
    }

    const tokenExpiresAt =
      typeof tokenJson.expires_in === 'number' && tokenJson.expires_in > 0
        ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString()
        : null;

    const authHeader = { Authorization: `Bearer ${accessToken}` };

    // -------------------------------------------------------------------
    // 2. Subscribe this app to the customer's WABA so webhooks flow in.
    // -------------------------------------------------------------------
    const subRes = await fetch(`${GRAPH}/${version}/${wabaId}/subscribed_apps`, {
      method: 'POST',
      headers: authHeader,
      cache: 'no-store',
    });
    if (!subRes.ok) {
      return NextResponse.json(
        { error: await graphError(subRes, 'Failed to subscribe the app to the WABA') },
        { status: 502 },
      );
    }

    // -------------------------------------------------------------------
    // 3. Discover the phone number id. The coexistence session event only
    //    returns waba_id, and a client-supplied id must never be trusted.
    // -------------------------------------------------------------------
    const numbersUrl =
      `${GRAPH}/${version}/${wabaId}/phone_numbers` +
      '?fields=id,display_phone_number,verified_name,is_on_biz_app,platform_type';

    const numbersRes = await fetch(numbersUrl, { headers: authHeader, cache: 'no-store' });
    if (!numbersRes.ok) {
      return NextResponse.json(
        { error: await graphError(numbersRes, 'Failed to list phone numbers on the WABA') },
        { status: 502 },
      );
    }

    const numbersJson = (await numbersRes.json()) as { data?: PhoneNumberRecord[] };
    const numbers = numbersJson.data ?? [];

    // This project supports coexistence only. Never fall back to a regular
    // Cloud API number because it would not remain active in the WhatsApp
    // Business App.
    const chosen = numbers.find(
      (n) => n.is_on_biz_app === true && n.platform_type === 'CLOUD_API',
    );

    if (!chosen?.id) {
      return NextResponse.json(
        {
          error:
            'No coexistence-enabled phone number was found. The number must have ' +
            'is_on_biz_app=true and platform_type=CLOUD_API.',
        },
        { status: 400 },
      );
    }

    const phoneNumberId = chosen.id;

    // -------------------------------------------------------------------
    // 4. Verify coexistence status on the chosen number.
    // -------------------------------------------------------------------
    const verifyRes = await fetch(
      `${GRAPH}/${version}/${phoneNumberId}?fields=is_on_biz_app,platform_type`,
      { headers: authHeader, cache: 'no-store' },
    );
    if (!verifyRes.ok) {
      return NextResponse.json(
        {
          error: await graphError(
            verifyRes,
            'Failed to verify WhatsApp Business App coexistence',
          ),
        },
        { status: 502 },
      );
    }

    const verifyJson = (await verifyRes.json()) as {
      is_on_biz_app?: boolean;
      platform_type?: string;
    };
    if (
      verifyJson.is_on_biz_app !== true ||
      verifyJson.platform_type !== 'CLOUD_API'
    ) {
      return NextResponse.json(
        {
          error:
            'Meta did not confirm coexistence for this number. Expected ' +
            'is_on_biz_app=true and platform_type=CLOUD_API.',
        },
        { status: 400 },
      );
    }

    const isOnBizApp = true;
    const platformType = 'CLOUD_API';

    // NOTE: coexistence does NOT use POST /{phone_number_id}/register —
    // the number stays owned by the WhatsApp Business App.

    // -------------------------------------------------------------------
    // 5. Encrypt the token and persist the connection.
    // -------------------------------------------------------------------
    const encrypted = encryptToken(accessToken);

    const { error: upsertError } = await supabase.from('whatsapp_config').upsert(
      {
        id: 1,
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
        business_id: isValidAssetId(businessId) ? businessId : null,
        display_phone_number: chosen.display_phone_number ?? null,
        verified_name: chosen.verified_name ?? null,
        access_token_ciphertext: encrypted.ciphertext,
        token_iv: encrypted.iv,
        token_auth_tag: encrypted.authTag,
        token_type: tokenJson.token_type ?? 'bearer',
        token_expires_at: tokenExpiresAt,
        is_on_biz_app: isOnBizApp,
        platform_type: platformType,
        status: 'connected',
        history_sync_status: 'requested',
        contact_sync_status: 'requested',
        last_error: null,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );

    if (upsertError) {
      // Log the database detail server-side; return a static message so raw
      // Postgres errors are never surfaced to the browser.
      // eslint-disable-next-line no-console
      console.error('[embedded-signup] failed to persist connection:', upsertError.message);
      return NextResponse.json(
        { error: 'Failed to save the connection. Please try again.' },
        { status: 500 },
      );
    }

    // New credentials are live immediately — drop the cached env/DB creds.
    invalidateCredentialsCache();

    // -------------------------------------------------------------------
    // 6. Kick off the ONE-TIME contact + history sync. Meta allows this only
    //    within 24 hours of onboarding, so it runs now even though the
    //    browsing UI for the imported history is a later phase.
    //    A sync failure must never fail the connection itself.
    // -------------------------------------------------------------------
    const syncErrors: string[] = [];

    for (const syncType of ['smb_app_state_sync', 'history'] as const) {
      try {
        const syncRes = await fetch(`${GRAPH}/${version}/${phoneNumberId}/smb_app_data`, {
          method: 'POST',
          headers: { ...authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messaging_product: 'whatsapp', sync_type: syncType }),
          cache: 'no-store',
        });
        if (!syncRes.ok) {
          syncErrors.push(`${syncType}: ${await graphError(syncRes, 'sync request failed')}`);
        }
      } catch (err) {
        syncErrors.push(
          `${syncType}: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
      }
    }

    if (syncErrors.length > 0) {
      await supabase
        .from('whatsapp_config')
        .update({
          last_error: syncErrors.join(' | ').slice(0, 500),
          history_sync_status: 'not_started',
          contact_sync_status: 'not_started',
        })
        .eq('id', 1);
    }

    return NextResponse.json(
      {
        success: true,
        connected: true,
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
        display_phone_number: chosen.display_phone_number ?? null,
        verified_name: chosen.verified_name ?? null,
        is_on_biz_app: isOnBizApp,
        platform_type: platformType,
        sync_warnings: syncErrors.length > 0 ? syncErrors : undefined,
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    // eslint-disable-next-line no-console
    console.error('[embedded-signup] failed:', message);

    await supabase
      .from('whatsapp_config')
      .update({ status: 'error', last_error: message.slice(0, 500) })
      .eq('id', 1);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
