import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Always read live from the DB — never statically prerender this route.
export const dynamic = 'force-dynamic';

/**
 * Agent config (single row, id = 1).
 *
 * GET  /api/agent/config — fetch current config.
 * POST /api/agent/config — update instructions / model / temperature.
 *
 * Protected by session middleware.
 */

const CONFIG_ID = 1;

export async function GET(): Promise<NextResponse> {
  const { data, error } = await supabase
    .from('agent_config')
    .select('id, instructions, model, temperature, updated_at')
    .eq('id', CONFIG_ID)
    .single();

  if (error) {
    return NextResponse.json(
      { error: `Failed to fetch agent config: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json(data, { status: 200 });
}

interface ConfigBody {
  instructions?: unknown;
  model?: unknown;
  temperature?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: ConfigBody;
  try {
    body = (await req.json()) as ConfigBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const update: Record<string, unknown> = { id: CONFIG_ID, updated_at: new Date().toISOString() };

  if (body.instructions !== undefined) {
    if (typeof body.instructions !== 'string') {
      return NextResponse.json(
        { error: 'instructions must be a string' },
        { status: 400 },
      );
    }
    update.instructions = body.instructions;
  }

  if (body.model !== undefined) {
    if (typeof body.model !== 'string' || !body.model.trim()) {
      return NextResponse.json(
        { error: 'model must be a non-empty string' },
        { status: 400 },
      );
    }
    update.model = body.model.trim();
  }

  if (body.temperature !== undefined) {
    const temp = Number(body.temperature);
    if (!Number.isFinite(temp) || temp < 0 || temp > 1) {
      return NextResponse.json(
        { error: 'temperature must be a number between 0 and 1' },
        { status: 400 },
      );
    }
    update.temperature = temp;
  }

  // Upsert keeps the single id=1 row invariant.
  const { data, error } = await supabase
    .from('agent_config')
    .upsert(update, { onConflict: 'id' })
    .select('id, instructions, model, temperature, updated_at')
    .single();

  if (error) {
    return NextResponse.json(
      { error: `Failed to update agent config: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, config: data }, { status: 200 });
}
