import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * Single appointment.
 *
 * PATCH  /api/appointments/[id] — update status / visit_date / visit_time.
 * DELETE /api/appointments/[id] — SOFT-cancel only: set status='cancelled'.
 *   The row is never hard-deleted, so reminder history and the calendar
 *   keep past data.
 *
 * Protected by session middleware.
 */

const VALID_STATUSES = new Set([
  'scheduled',
  'confirmed',
  'cancelled',
  'completed',
]);

interface PatchBody {
  status?: unknown;
  visit_date?: unknown;
  visit_time?: unknown;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const id = (params.id || '').trim();
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !VALID_STATUSES.has(body.status)) {
      return NextResponse.json(
        {
          error: `status must be one of: ${Array.from(VALID_STATUSES).join(', ')}`,
        },
        { status: 400 },
      );
    }
    update.status = body.status;
  }

  if (body.visit_date !== undefined) {
    if (typeof body.visit_date !== 'string' || !body.visit_date.trim()) {
      return NextResponse.json(
        { error: 'visit_date must be a non-empty string' },
        { status: 400 },
      );
    }
    update.visit_date = body.visit_date.trim();
  }

  if (body.visit_time !== undefined) {
    if (typeof body.visit_time !== 'string' || !body.visit_time.trim()) {
      return NextResponse.json(
        { error: 'visit_time must be a non-empty string' },
        { status: 400 },
      );
    }
    update.visit_time = body.visit_time.trim();
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: 'No updatable fields provided (status, visit_date, visit_time)' },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from('appointments')
    .update(update)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Failed to update appointment: ${error.message}` },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, appointment: data }, { status: 200 });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const id = (params.id || '').trim();
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  // SOFT-cancel only — never hard delete.
  const { data, error } = await supabase
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Failed to cancel appointment: ${error.message}` },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  }

  return NextResponse.json(
    { success: true, cancelled: true, appointment: data },
    { status: 200 },
  );
}
