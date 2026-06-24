import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { svc, testPhone, cleanup } from './helpers';

describe('lead_events — CRUD', () => {
  let phone: string;

  beforeEach(async () => {
    phone = testPhone();
    await svc.from('leads').insert({ phone, full_name: 'Event Test Lead' });
  });

  afterEach(async () => {
    await cleanup(phone);
  });

  it('insert → select → update → delete', async () => {
    // INSERT
    const { data: inserted, error: insErr } = await svc
      .from('lead_events')
      .insert({
        phone,
        event_type: 'lead_created',
        event_description: 'Test event description',
      })
      .select('id')
      .single();
    expect(insErr, `insert failed: ${insErr?.message}`).toBeNull();
    const eventId = inserted!.id;

    // SELECT
    const { data: row, error: selErr } = await svc
      .from('lead_events')
      .select('*')
      .eq('id', eventId)
      .single();
    expect(selErr).toBeNull();
    expect(row?.event_type).toBe('lead_created');
    expect(row?.event_description).toBe('Test event description');
    expect(row?.phone).toBe(phone);

    // UPDATE (event_description)
    const { error: updErr } = await svc
      .from('lead_events')
      .update({ event_description: 'Updated description' })
      .eq('id', eventId);
    expect(updErr, `update failed: ${updErr?.message}`).toBeNull();

    const { data: updated } = await svc
      .from('lead_events')
      .select('event_description')
      .eq('id', eventId)
      .single();
    expect(updated?.event_description).toBe('Updated description');

    // DELETE
    const { error: delErr } = await svc.from('lead_events').delete().eq('id', eventId);
    expect(delErr).toBeNull();

    const { data: gone } = await svc
      .from('lead_events')
      .select('id')
      .eq('id', eventId)
      .maybeSingle();
    expect(gone).toBeNull();
  });
});

describe('lead_events — FK orphan', () => {
  it('insert with phone not in leads must FAIL', async () => {
    const orphanPhone = testPhone();
    const { error } = await svc
      .from('lead_events')
      .insert({ phone: orphanPhone, event_type: 'lead_created' });
    expect(error).not.toBeNull();
  });
});

describe('lead_events — event_type NOT NULL', () => {
  let phone: string;

  beforeEach(async () => {
    phone = testPhone();
    await svc.from('leads').insert({ phone });
  });

  afterEach(async () => {
    await cleanup(phone);
  });

  it('event_type=null must FAIL', async () => {
    const { error } = await svc
      .from('lead_events')
      .insert({ phone, event_type: null as unknown as string });
    expect(error).not.toBeNull();
  });
});
