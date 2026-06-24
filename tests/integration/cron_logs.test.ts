import { describe, it, expect } from 'vitest';
import { svc, cleanupCronLog } from './helpers';

describe('cron_logs — CRUD', () => {
  it('insert → select → update → delete', async () => {
    let capturedId: string | null = null;

    try {
      // INSERT
      const { data: inserted, error: insErr } = await svc
        .from('cron_logs')
        .insert({
          cron_name: 'test_cron_integration',
          status: 'success',
          messages_sent: 3,
          error_message: null,
        })
        .select('id')
        .single();
      expect(insErr, `insert failed: ${insErr?.message}`).toBeNull();
      capturedId = inserted!.id;

      // SELECT
      const { data: row, error: selErr } = await svc
        .from('cron_logs')
        .select('*')
        .eq('id', capturedId)
        .single();
      expect(selErr).toBeNull();
      expect(row?.cron_name).toBe('test_cron_integration');
      expect(row?.status).toBe('success');
      expect(row?.messages_sent).toBe(3);

      // UPDATE
      const { error: updErr } = await svc
        .from('cron_logs')
        .update({ status: 'failure', error_message: 'Test error' })
        .eq('id', capturedId);
      expect(updErr, `update failed: ${updErr?.message}`).toBeNull();

      const { data: updated } = await svc
        .from('cron_logs')
        .select('status, error_message')
        .eq('id', capturedId)
        .single();
      expect(updated?.status).toBe('failure');
      expect(updated?.error_message).toBe('Test error');

      // DELETE
      const { error: delErr } = await svc.from('cron_logs').delete().eq('id', capturedId);
      expect(delErr).toBeNull();

      const { data: gone } = await svc
        .from('cron_logs')
        .select('id')
        .eq('id', capturedId)
        .maybeSingle();
      expect(gone).toBeNull();

      capturedId = null; // Successfully deleted
    } finally {
      if (capturedId) await cleanupCronLog(capturedId);
    }
  });
});

describe('cron_logs — NOT NULL constraints', () => {
  it('cron_name=null must FAIL', async () => {
    const { error } = await svc.from('cron_logs').insert({
      cron_name: null as unknown as string,
      status: 'success',
    });
    expect(error).not.toBeNull();
  });

  it('status=null must FAIL', async () => {
    const { error } = await svc.from('cron_logs').insert({
      cron_name: 'test_cron',
      status: null as unknown as string,
    });
    expect(error).not.toBeNull();
  });
});
