import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { svc, testPhone, cleanup } from './helpers';

describe('messages — CRUD', () => {
  let phone: string;

  beforeEach(async () => {
    phone = testPhone();
    await svc.from('leads').insert({ phone, full_name: 'Msg Test Lead' });
  });

  afterEach(async () => {
    await cleanup(phone);
  });

  it('insert → select → update → delete', async () => {
    // INSERT
    const { data: inserted, error: insErr } = await svc
      .from('messages')
      .insert({ phone, direction: 'inbound', content: 'Hello' })
      .select('id')
      .single();
    expect(insErr, `insert failed: ${insErr?.message}`).toBeNull();
    const msgId = inserted!.id;

    // SELECT
    const { data: row, error: selErr } = await svc
      .from('messages')
      .select('*')
      .eq('id', msgId)
      .single();
    expect(selErr).toBeNull();
    expect(row?.content).toBe('Hello');
    expect(row?.direction).toBe('inbound');

    // UPDATE (status field)
    const { error: updErr } = await svc
      .from('messages')
      .update({ status: 'delivered' })
      .eq('id', msgId);
    expect(updErr, `update failed: ${updErr?.message}`).toBeNull();

    const { data: updated } = await svc
      .from('messages')
      .select('status')
      .eq('id', msgId)
      .single();
    expect(updated?.status).toBe('delivered');

    // DELETE
    const { error: delErr } = await svc.from('messages').delete().eq('id', msgId);
    expect(delErr).toBeNull();

    const { data: gone } = await svc.from('messages').select('id').eq('id', msgId).maybeSingle();
    expect(gone).toBeNull();
  });
});

describe('messages — FK orphan', () => {
  it('insert with phone not in leads must FAIL', async () => {
    const orphanPhone = testPhone();
    const { error } = await svc
      .from('messages')
      .insert({ phone: orphanPhone, direction: 'inbound', content: 'Orphan' });
    expect(error).not.toBeNull();
  });
});

describe('messages — direction NOT NULL', () => {
  let phone: string;

  beforeEach(async () => {
    phone = testPhone();
    await svc.from('leads').insert({ phone });
  });

  afterEach(async () => {
    await cleanup(phone);
  });

  it('direction=null must FAIL', async () => {
    const { error } = await svc
      .from('messages')
      .insert({ phone, direction: null as unknown as string, content: 'No direction' });
    expect(error).not.toBeNull();
  });
});

describe('messages — wa_message_id UNIQUE', () => {
  let phone: string;

  beforeEach(async () => {
    phone = testPhone();
    await svc.from('leads').insert({ phone });
  });

  afterEach(async () => {
    await cleanup(phone);
  });

  it('duplicate wa_message_id must FAIL', async () => {
    const waId = `test-wa-${Date.now()}`;

    const { error: first } = await svc
      .from('messages')
      .insert({ phone, direction: 'inbound', wa_message_id: waId });
    expect(first).toBeNull();

    const { error: second } = await svc
      .from('messages')
      .insert({ phone, direction: 'outbound', wa_message_id: waId });
    expect(second).not.toBeNull();
  });
});

describe('messages — threading', () => {
  let phone1: string;
  let phone2: string;

  beforeEach(async () => {
    phone1 = testPhone();
    phone2 = testPhone();
    await svc.from('leads').insert([{ phone: phone1 }, { phone: phone2 }]);
  });

  afterEach(async () => {
    await cleanup(phone1);
    await cleanup(phone2);
  });

  it('messages filtered by phone return only that lead rows', async () => {
    await svc.from('messages').insert([
      { phone: phone1, direction: 'inbound', content: 'Msg from lead 1' },
      { phone: phone2, direction: 'outbound', content: 'Msg from lead 2' },
    ]);

    const { data: rows } = await svc
      .from('messages')
      .select('phone, content')
      .eq('phone', phone1);

    expect(rows).not.toBeNull();
    expect(rows!.length).toBeGreaterThanOrEqual(1);
    for (const row of rows!) {
      expect(row.phone).toBe(phone1);
    }
  });
});
