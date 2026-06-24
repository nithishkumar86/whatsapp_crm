import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * Toggle AI mode for a lead.
 *
 * POST /api/leads/[phone]/ai-mode  Body: { ai_mode: boolean }
 *   Effect: UPDATE leads SET ai_mode = $1 WHERE phone = $2
 *   Returns: updated lead row.
 *
 * Protected by session middleware.
 */

interface AiModeBody {
  ai_mode?: unknown;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { phone: string } },
): Promise<NextResponse> {
  const phone = decodeURIComponent(params.phone || '').trim();
  if (!phone) {
    return NextResponse.json({ error: 'phone is required' }, { status: 400 });
  }

  let body: AiModeBody;
  try {
    body = (await req.json()) as AiModeBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.ai_mode !== 'boolean') {
    return NextResponse.json(
      { error: 'ai_mode must be a boolean' },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from('leads')
    .update({ ai_mode: body.ai_mode })
    .eq('phone', phone)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Failed to update ai_mode: ${error.message}` },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, lead: data }, { status: 200 });
}
