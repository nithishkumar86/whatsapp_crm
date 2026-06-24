import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * Appointments collection.
 *
 * GET  /api/appointments?from=YYYY-MM-DD&to=YYYY-MM-DD — list, optional range.
 * POST /api/appointments — create a manual booking.
 *   - Writes appointment_booked to lead_events.
 *   - booked_by defaults to 'agent' (this is the agent/manual route).
 *   - location_preference is stored as a snapshot at booking time.
 *
 * Protected by session middleware.
 */

export async function GET(req: NextRequest): Promise<NextResponse> {
  const params = req.nextUrl.searchParams;
  const from = params.get('from');
  const to = params.get('to');

  let query = supabase
    .from('appointments')
    .select(
      'id, phone, full_name, visit_date, visit_time, location_preference, map_link, notes, booked_by, status, reminder_1day_sent, reminder_1hr_sent, created_at',
    )
    .order('visit_date', { ascending: true })
    .order('visit_time', { ascending: true });

  if (from) query = query.gte('visit_date', from);
  if (to) query = query.lte('visit_date', to);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: `Failed to fetch appointments: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json(data ?? [], { status: 200 });
}

interface CreateBody {
  phone?: string;
  full_name?: string;
  visit_date?: string;
  visit_time?: string;
  location_preference?: string;
  map_link?: string;
  notes?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const visitDate = typeof body.visit_date === 'string' ? body.visit_date.trim() : '';
  const visitTime = typeof body.visit_time === 'string' ? body.visit_time.trim() : '';

  if (!phone) {
    return NextResponse.json({ error: 'phone is required' }, { status: 400 });
  }
  if (!visitDate) {
    return NextResponse.json({ error: 'visit_date is required' }, { status: 400 });
  }
  if (!visitTime) {
    return NextResponse.json({ error: 'visit_time is required' }, { status: 400 });
  }

  // Ensure the lead exists (FK on appointments.phone).
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('phone')
    .eq('phone', phone)
    .maybeSingle();

  if (leadErr) {
    return NextResponse.json(
      { error: `Failed to look up lead: ${leadErr.message}` },
      { status: 500 },
    );
  }
  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  // Insert appointment. location_preference is a snapshot — stored exactly as
  // provided at booking time and never mutated by lead updates.
  const { data: appt, error: insertErr } = await supabase
    .from('appointments')
    .insert({
      phone,
      full_name: body.full_name ?? null,
      visit_date: visitDate,
      visit_time: visitTime,
      location_preference: body.location_preference ?? null,
      map_link: body.map_link ?? null,
      notes: body.notes ?? null,
      booked_by: 'agent',
      status: 'scheduled',
    })
    .select()
    .single();

  if (insertErr) {
    return NextResponse.json(
      { error: `Failed to create appointment: ${insertErr.message}` },
      { status: 500 },
    );
  }

  // Write appointment_booked to lead_events.
  await supabase.from('lead_events').insert({
    phone,
    event_type: 'appointment_booked',
    event_description: `Site visit booked for ${visitDate} ${visitTime} (by agent)`,
  });

  return NextResponse.json({ success: true, appointment: appt }, { status: 200 });
}
