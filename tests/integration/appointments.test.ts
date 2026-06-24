import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { svc, testPhone, cleanup } from './helpers';

describe('appointments — CRUD', () => {
  let phone: string;

  beforeEach(async () => {
    phone = testPhone();
    await svc.from('leads').insert({ phone, full_name: 'Appt Test Lead' });
  });

  afterEach(async () => {
    await cleanup(phone);
  });

  it('insert → select → update → delete', async () => {
    // INSERT
    const { data: inserted, error: insErr } = await svc
      .from('appointments')
      .insert({
        phone,
        visit_date: '2025-12-01',
        visit_time: '10:00:00',
        full_name: 'Appt Test Lead',
        location_preference: 'Chennai North',
      })
      .select('id')
      .single();
    expect(insErr, `insert failed: ${insErr?.message}`).toBeNull();
    const apptId = inserted!.id;

    // SELECT
    const { data: row, error: selErr } = await svc
      .from('appointments')
      .select('*')
      .eq('id', apptId)
      .single();
    expect(selErr).toBeNull();
    expect(row?.visit_date).toBe('2025-12-01');
    expect(row?.visit_time).toBe('10:00:00');
    expect(row?.status).toBe('scheduled');

    // UPDATE
    const { error: updErr } = await svc
      .from('appointments')
      .update({ status: 'completed' })
      .eq('id', apptId);
    expect(updErr, `update failed: ${updErr?.message}`).toBeNull();

    const { data: updated } = await svc
      .from('appointments')
      .select('status')
      .eq('id', apptId)
      .single();
    expect(updated?.status).toBe('completed');

    // DELETE
    const { error: delErr } = await svc.from('appointments').delete().eq('id', apptId);
    expect(delErr).toBeNull();

    const { data: gone } = await svc.from('appointments').select('id').eq('id', apptId).maybeSingle();
    expect(gone).toBeNull();
  });
});

describe('appointments — FK orphan', () => {
  it('insert with phone not in leads must FAIL', async () => {
    const orphanPhone = testPhone();
    const { error } = await svc.from('appointments').insert({
      phone: orphanPhone,
      visit_date: '2025-12-01',
      visit_time: '10:00:00',
    });
    expect(error).not.toBeNull();
  });
});

describe('appointments — visit_date NOT NULL', () => {
  let phone: string;

  beforeEach(async () => {
    phone = testPhone();
    await svc.from('leads').insert({ phone });
  });

  afterEach(async () => {
    await cleanup(phone);
  });

  it('visit_date=null must FAIL', async () => {
    const { error } = await svc.from('appointments').insert({
      phone,
      visit_date: null as unknown as string,
      visit_time: '10:00:00',
    });
    expect(error).not.toBeNull();
  });
});

describe('appointments — visit_time NOT NULL', () => {
  let phone: string;

  beforeEach(async () => {
    phone = testPhone();
    await svc.from('leads').insert({ phone });
  });

  afterEach(async () => {
    await cleanup(phone);
  });

  it('visit_time=null must FAIL', async () => {
    const { error } = await svc.from('appointments').insert({
      phone,
      visit_date: '2025-12-01',
      visit_time: null as unknown as string,
    });
    expect(error).not.toBeNull();
  });
});

describe('appointments — reminder_result CHECK', () => {
  let phone: string;
  let apptId: string;

  beforeEach(async () => {
    phone = testPhone();
    await svc.from('leads').insert({ phone });
    const { data } = await svc
      .from('appointments')
      .insert({ phone, visit_date: '2025-12-02', visit_time: '09:00:00' })
      .select('id')
      .single();
    apptId = data!.id;
  });

  afterEach(async () => {
    await cleanup(phone);
  });

  it("reminder_1hr_result='maybe' must FAIL", async () => {
    const { error } = await svc
      .from('appointments')
      .update({ reminder_1hr_result: 'maybe' })
      .eq('id', apptId);
    expect(error).not.toBeNull();
  });

  it("reminder_1hr_result='sent' must PASS", async () => {
    const { error } = await svc
      .from('appointments')
      .update({ reminder_1hr_result: 'sent' })
      .eq('id', apptId);
    expect(error, `expected no error but got: ${error?.message}`).toBeNull();
  });

  it("reminder_1hr_result='failed' must PASS", async () => {
    const { error } = await svc
      .from('appointments')
      .update({ reminder_1hr_result: 'failed' })
      .eq('id', apptId);
    expect(error, `expected no error but got: ${error?.message}`).toBeNull();
  });

  it('reminder_1hr_result=null must PASS', async () => {
    // First set to something, then clear it
    await svc.from('appointments').update({ reminder_1hr_result: 'sent' }).eq('id', apptId);
    const { error } = await svc
      .from('appointments')
      .update({ reminder_1hr_result: null })
      .eq('id', apptId);
    expect(error, `expected no error but got: ${error?.message}`).toBeNull();
  });

  it("reminder_1day_result='maybe' must FAIL", async () => {
    const { error } = await svc
      .from('appointments')
      .update({ reminder_1day_result: 'maybe' })
      .eq('id', apptId);
    expect(error).not.toBeNull();
  });

  it("reminder_1day_result='sent' must PASS", async () => {
    const { error } = await svc
      .from('appointments')
      .update({ reminder_1day_result: 'sent' })
      .eq('id', apptId);
    expect(error, `expected no error but got: ${error?.message}`).toBeNull();
  });
});
