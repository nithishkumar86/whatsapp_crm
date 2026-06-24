import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * Fetch full chat history for one phone, oldest → newest.
 *
 * GET /api/messages/[phone]
 *
 * Protected by session middleware.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: { phone: string } },
): Promise<NextResponse> {
  const phone = decodeURIComponent(params.phone || '').trim();
  if (!phone) {
    return NextResponse.json({ error: 'phone is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('messages')
    .select(
      'id, phone, wa_message_id, direction, content, message_type, sent_by, media_url, template_name, status, error_message, created_at',
    )
    .eq('phone', phone)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: `Failed to fetch messages: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ phone, messages: data ?? [] }, { status: 200 });
}
