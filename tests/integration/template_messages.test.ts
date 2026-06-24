import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { svc, testPhone, cleanup } from './helpers';

describe('template_messages — RPC record_template_sent', () => {
  let phone: string;

  beforeEach(async () => {
    phone = testPhone();
    await svc.from('leads').insert({ phone, full_name: 'Template Test Lead' });
  });

  afterEach(async () => {
    await cleanup(phone);
  });

  it('two calls → total_template_sent=2, template_sent=true', async () => {
    // First call
    const { error: err1 } = await svc.rpc('record_template_sent', {
      p_phone: phone,
      p_template: 'welcome_lead',
    });
    expect(err1, `first RPC call failed: ${err1?.message}`).toBeNull();

    // Second call (different template name)
    const { error: err2 } = await svc.rpc('record_template_sent', {
      p_phone: phone,
      p_template: 'reengagement',
    });
    expect(err2, `second RPC call failed: ${err2?.message}`).toBeNull();

    // Verify final state
    const { data, error: selErr } = await svc
      .from('template_messages')
      .select('*')
      .eq('phone', phone)
      .single();
    expect(selErr).toBeNull();
    expect(data?.template_sent).toBe(true);
    expect(data?.total_template_sent).toBe(2);
    // Last template name should be the most recently sent one
    expect(data?.template_name).toBe('reengagement');
    expect(data?.last_sent_at).not.toBeNull();
  });
});

describe('template_messages — FK constraint', () => {
  it('RPC with phone not in leads must FAIL', async () => {
    const orphanPhone = testPhone();
    const { error } = await svc.rpc('record_template_sent', {
      p_phone: orphanPhone,
      p_template: 'welcome_lead',
    });
    expect(error).not.toBeNull();
  });
});

describe('template_messages — updated_at trigger', () => {
  let phone: string;

  beforeEach(async () => {
    phone = testPhone();
    await svc.from('leads').insert({ phone });

    // Seed the template_messages row
    const { error } = await svc.rpc('record_template_sent', {
      p_phone: phone,
      p_template: 'welcome_lead',
    });
    expect(error).toBeNull();
  });

  afterEach(async () => {
    await cleanup(phone);
  });

  it('updated_at advances after UPDATE', async () => {
    const { data: before } = await svc
      .from('template_messages')
      .select('updated_at')
      .eq('phone', phone)
      .single();
    const originalUpdatedAt = new Date(before!.updated_at).getTime();

    // Wait ~1100ms
    await new Promise((r) => setTimeout(r, 1100));

    // Update a field to trigger the updated_at trigger
    const { error: updErr } = await svc
      .from('template_messages')
      .update({ template_name: 'updated_template' })
      .eq('phone', phone);
    expect(updErr).toBeNull();

    const { data: after } = await svc
      .from('template_messages')
      .select('updated_at')
      .eq('phone', phone)
      .single();
    const newUpdatedAt = new Date(after!.updated_at).getTime();

    expect(newUpdatedAt).toBeGreaterThan(originalUpdatedAt);
  });
});
