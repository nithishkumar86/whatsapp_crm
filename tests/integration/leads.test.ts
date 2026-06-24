import { describe, it, expect, afterEach } from 'vitest';
import { svc, testPhone, cleanup } from './helpers';

describe('leads — CRUD', () => {
  let phone: string;

  afterEach(async () => {
    if (phone) await cleanup(phone);
  });

  it('insert → select → update → delete', async () => {
    phone = testPhone();

    // INSERT
    const { error: insErr } = await svc
      .from('leads')
      .insert({ phone, full_name: 'Test Lead', lead_status: 'New' });
    expect(insErr, `insert failed: ${insErr?.message}`).toBeNull();

    // SELECT
    const { data: rows, error: selErr } = await svc
      .from('leads')
      .select('*')
      .eq('phone', phone)
      .single();
    expect(selErr, `select failed: ${selErr?.message}`).toBeNull();
    expect(rows?.full_name).toBe('Test Lead');
    expect(rows?.lead_status).toBe('New');

    // UPDATE
    const { error: updErr } = await svc
      .from('leads')
      .update({ full_name: 'Updated Lead' })
      .eq('phone', phone);
    expect(updErr, `update failed: ${updErr?.message}`).toBeNull();

    // VERIFY UPDATE
    const { data: updated } = await svc
      .from('leads')
      .select('full_name')
      .eq('phone', phone)
      .single();
    expect(updated?.full_name).toBe('Updated Lead');

    // DELETE (cleanup handled by afterEach, but verify delete works)
    const { error: delErr } = await svc.from('leads').delete().eq('phone', phone);
    expect(delErr, `delete failed: ${delErr?.message}`).toBeNull();

    // Confirm gone
    const { data: gone } = await svc.from('leads').select('phone').eq('phone', phone).maybeSingle();
    expect(gone).toBeNull();

    // Set to null so afterEach won't double-delete
    phone = '';
  });
});

describe('leads — null phone constraint', () => {
  it('insert with phone=null must FAIL', async () => {
    // Supabase JS does not allow null PK via typed insert; we test via raw approach.
    // phone is NOT NULL (PK), so providing null should error.
    const { error } = await svc.from('leads').insert({ phone: null as unknown as string, full_name: 'Null Phone' });
    expect(error).not.toBeNull();
  });
});

describe('leads — lead_status CHECK constraint', () => {
  let phone: string;

  afterEach(async () => {
    if (phone) await cleanup(phone);
  });

  it('lead_status=Bogus must FAIL', async () => {
    phone = testPhone();
    const { error } = await svc
      .from('leads')
      .insert({ phone, lead_status: 'Bogus' });
    expect(error).not.toBeNull();
    phone = ''; // no row created, nothing to clean
  });
});

describe('leads — lead_lost_factor CHECK constraint', () => {
  let phone: string;

  afterEach(async () => {
    if (phone) await cleanup(phone);
  });

  it('status≠Lost + non-null lead_lost_factor must FAIL', async () => {
    phone = testPhone();
    const { error } = await svc.from('leads').insert({
      phone,
      lead_status: 'Active',
      lead_lost_factor: 'No Response',
    });
    expect(error).not.toBeNull();
    phone = '';
  });

  it('status=Lost + valid lead_lost_factor must PASS', async () => {
    phone = testPhone();
    const { error } = await svc.from('leads').insert({
      phone,
      lead_status: 'Lost',
      lead_lost_factor: 'No Response',
    });
    expect(error, `expected no error but got: ${error?.message}`).toBeNull();
  });
});

describe('leads — status transitions', () => {
  let phone: string;

  afterEach(async () => {
    if (phone) await cleanup(phone);
  });

  it('New → Active → Progress → Successful all succeed', async () => {
    phone = testPhone();

    const { error: insErr } = await svc.from('leads').insert({ phone, lead_status: 'New' });
    expect(insErr).toBeNull();

    for (const status of ['Active', 'Progress', 'Successful'] as const) {
      const { error } = await svc.from('leads').update({ lead_status: status }).eq('phone', phone);
      expect(error, `transition to ${status} failed: ${error?.message}`).toBeNull();

      const { data } = await svc.from('leads').select('lead_status').eq('phone', phone).single();
      expect(data?.lead_status).toBe(status);
    }
  });
});

describe('leads — ai_mode default', () => {
  let phone: string;

  afterEach(async () => {
    if (phone) await cleanup(phone);
  });

  it('insert WITHOUT ai_mode → reads back ai_mode=true', async () => {
    phone = testPhone();
    const { error } = await svc.from('leads').insert({ phone });
    expect(error).toBeNull();

    const { data } = await svc.from('leads').select('ai_mode').eq('phone', phone).single();
    expect(data?.ai_mode).toBe(true);
  });
});

describe('leads — updated_at trigger', () => {
  let phone: string;

  afterEach(async () => {
    if (phone) await cleanup(phone);
  });

  it('updated_at advances after UPDATE', async () => {
    phone = testPhone();
    const { error: insErr } = await svc.from('leads').insert({ phone, full_name: 'Trigger Test' });
    expect(insErr).toBeNull();

    const { data: before } = await svc
      .from('leads')
      .select('updated_at')
      .eq('phone', phone)
      .single();
    const originalUpdatedAt = new Date(before!.updated_at).getTime();

    // Wait ~1100ms for clock to advance
    await new Promise((r) => setTimeout(r, 1100));

    const { error: updErr } = await svc
      .from('leads')
      .update({ full_name: 'Trigger Test Updated' })
      .eq('phone', phone);
    expect(updErr).toBeNull();

    const { data: after } = await svc
      .from('leads')
      .select('updated_at')
      .eq('phone', phone)
      .single();
    const newUpdatedAt = new Date(after!.updated_at).getTime();

    expect(newUpdatedAt).toBeGreaterThan(originalUpdatedAt);
  });
});
