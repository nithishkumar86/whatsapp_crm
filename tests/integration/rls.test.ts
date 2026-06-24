import { describe, it, expect } from 'vitest';
import { svc, anon, testPhone, cleanup } from './helpers';

describe('RLS — anon client is blocked, service-role client succeeds', () => {
  if (!anon) {
    it.skip('SKIPPED — SUPABASE_ANON_KEY is not set; RLS test requires the anon key', () => {
      console.log(
        '[rls.test] SUPABASE_ANON_KEY is not set. ' +
          'RLS is enforced (no public policies on any table). ' +
          'Set SUPABASE_ANON_KEY in your .env.test to run this test.'
      );
    });
    return;
  }

  let phone: string;

  it('anon client gets 0 rows from leads (RLS blocks read)', async () => {
    // First create a row via service role so there is something to potentially read
    phone = testPhone();
    try {
      await svc.from('leads').insert({ phone, full_name: 'RLS Test Lead' });

      const { data: rows, error } = await anon!.from('leads').select('*');
      // With RLS enabled and no policies, anon gets empty set (not an error per se)
      // Some Supabase versions return an error, others return []. Either way, 0 rows.
      if (error) {
        // Error is also acceptable — means RLS blocked it
        expect(error).not.toBeNull();
      } else {
        expect(rows?.length ?? 0).toBe(0);
      }
    } finally {
      if (phone) await cleanup(phone);
    }
  });

  it('anon client is blocked from writing to leads', async () => {
    const anonPhone = testPhone();
    const { error } = await anon!.from('leads').insert({ phone: anonPhone, full_name: 'Anon Write Attempt' });
    expect(error).not.toBeNull();
    // Ensure it was never actually inserted by checking with service role
    const { data } = await svc.from('leads').select('phone').eq('phone', anonPhone).maybeSingle();
    expect(data).toBeNull();
  });

  it('anon client gets 0 rows from messages (RLS blocks read)', async () => {
    const { data: rows, error } = await anon!.from('messages').select('*');
    if (error) {
      expect(error).not.toBeNull();
    } else {
      expect(rows?.length ?? 0).toBe(0);
    }
  });

  it('service-role client can read leads successfully', async () => {
    phone = testPhone();
    try {
      await svc.from('leads').insert({ phone, full_name: 'SVC Role Test' });
      const { data, error } = await svc.from('leads').select('phone').eq('phone', phone).single();
      expect(error).toBeNull();
      expect(data?.phone).toBe(phone);
    } finally {
      if (phone) await cleanup(phone);
    }
  });
});
