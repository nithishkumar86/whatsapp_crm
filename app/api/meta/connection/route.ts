import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/meta/connection
 *
 * Current WhatsApp Cloud API connection status for the Settings page.
 *
 * SECURITY: never returns the access token (or any part of it). Only the
 * non-sensitive identifiers and lifecycle fields are exposed.
 *
 * Protected by the session middleware.
 */

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const { data, error } = await supabase
    .from('whatsapp_config')
    .select(
      'waba_id, phone_number_id, business_id, display_phone_number, verified_name, is_on_biz_app, platform_type, status, history_sync_status, contact_sync_status, last_error, token_expires_at, connected_at, updated_at',
    )
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    // The table is missing until migration 0007 is applied — report a clean
    // "not connected" state rather than a 500 so the UI still renders.
    return NextResponse.json(
      {
        connected: false,
        status: 'disconnected',
        error: `Failed to read the connection: ${error.message}`,
        env_fallback_active: Boolean(
          process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN,
        ),
      },
      { status: 200 },
    );
  }

  return NextResponse.json(
    {
      connected: data?.status === 'connected',
      status: data?.status ?? 'disconnected',
      waba_id: data?.waba_id ?? null,
      phone_number_id: data?.phone_number_id ?? null,
      business_id: data?.business_id ?? null,
      display_phone_number: data?.display_phone_number ?? null,
      verified_name: data?.verified_name ?? null,
      is_on_biz_app: data?.is_on_biz_app ?? null,
      platform_type: data?.platform_type ?? null,
      history_sync_status: data?.history_sync_status ?? 'not_started',
      contact_sync_status: data?.contact_sync_status ?? 'not_started',
      last_error: data?.last_error ?? null,
      token_expires_at: data?.token_expires_at ?? null,
      connected_at: data?.connected_at ?? null,
      updated_at: data?.updated_at ?? null,
      // True when sends currently fall back to the WHATSAPP_* env vars.
      env_fallback_active:
        data?.status !== 'connected' &&
        Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN),
      // Client needs these to launch the SDK; they are public by design.
      config_ready: Boolean(
        process.env.NEXT_PUBLIC_META_APP_ID && process.env.NEXT_PUBLIC_META_CONFIG_ID,
      ),
    },
    { status: 200 },
  );
}
