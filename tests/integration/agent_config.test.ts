import { describe, it, expect } from 'vitest';
import { svc } from './helpers';

describe('agent_config', () => {
  it('row id=1 exists', async () => {
    const { data, error } = await svc
      .from('agent_config')
      .select('*')
      .eq('id', 1)
      .single();
    expect(error, `select failed: ${error?.message}`).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.id).toBe(1);
  });

  it('update instructions / model / temperature then restore originals', async () => {
    // Read original values
    const { data: original, error: readErr } = await svc
      .from('agent_config')
      .select('instructions, model, temperature')
      .eq('id', 1)
      .single();
    expect(readErr).toBeNull();

    const origInstructions = original!.instructions;
    const origModel = original!.model;
    const origTemperature = original!.temperature;

    // Apply test changes
    const { error: updErr } = await svc
      .from('agent_config')
      .update({
        instructions: 'INTEGRATION TEST INSTRUCTIONS — do not keep',
        model: 'test/model-integration',
        temperature: 0.42,
      })
      .eq('id', 1);
    expect(updErr, `update failed: ${updErr?.message}`).toBeNull();

    // Verify changes took effect
    const { data: changed } = await svc
      .from('agent_config')
      .select('instructions, model, temperature')
      .eq('id', 1)
      .single();
    expect(changed?.instructions).toBe('INTEGRATION TEST INSTRUCTIONS — do not keep');
    expect(changed?.model).toBe('test/model-integration');
    expect(Number(changed?.temperature)).toBeCloseTo(0.42, 2);

    // Restore originals
    const { error: restoreErr } = await svc
      .from('agent_config')
      .update({
        instructions: origInstructions,
        model: origModel,
        temperature: origTemperature,
      })
      .eq('id', 1);
    expect(restoreErr, `restore failed: ${restoreErr?.message}`).toBeNull();

    // Verify restoration
    const { data: restored } = await svc
      .from('agent_config')
      .select('instructions, model, temperature')
      .eq('id', 1)
      .single();
    expect(restored?.instructions).toBe(origInstructions);
    expect(restored?.model).toBe(origModel);
  });
});
