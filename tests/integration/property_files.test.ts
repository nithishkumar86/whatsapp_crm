import { describe, it, expect } from 'vitest';
import { svc, cleanupPropertyFile } from './helpers';

describe('property_files — CRUD', () => {
  it('insert → select → update → delete', async () => {
    let capturedId: string | null = null;

    try {
      // INSERT
      const { data: inserted, error: insErr } = await svc
        .from('property_files')
        .insert({
          file_name: 'test_brochure.pdf',
          file_type: 'application/pdf',
          file_url: 'https://example.com/test_brochure.pdf',
          extracted_text: 'Sample extracted text',
          summary: 'Sample summary',
        })
        .select('id')
        .single();
      expect(insErr, `insert failed: ${insErr?.message}`).toBeNull();
      capturedId = inserted!.id;

      // SELECT
      const { data: row, error: selErr } = await svc
        .from('property_files')
        .select('*')
        .eq('id', capturedId)
        .single();
      expect(selErr).toBeNull();
      expect(row?.file_name).toBe('test_brochure.pdf');
      expect(row?.file_type).toBe('application/pdf');
      expect(row?.summary).toBe('Sample summary');

      // UPDATE
      const { error: updErr } = await svc
        .from('property_files')
        .update({ summary: 'Updated summary' })
        .eq('id', capturedId);
      expect(updErr, `update failed: ${updErr?.message}`).toBeNull();

      const { data: updated } = await svc
        .from('property_files')
        .select('summary')
        .eq('id', capturedId)
        .single();
      expect(updated?.summary).toBe('Updated summary');

      // DELETE
      const { error: delErr } = await svc.from('property_files').delete().eq('id', capturedId);
      expect(delErr).toBeNull();

      const { data: gone } = await svc
        .from('property_files')
        .select('id')
        .eq('id', capturedId)
        .maybeSingle();
      expect(gone).toBeNull();

      capturedId = null; // Deleted successfully — no need for finally cleanup
    } finally {
      if (capturedId) await cleanupPropertyFile(capturedId);
    }
  });
});

describe('property_files — NOT NULL constraints', () => {
  it('file_name=null must FAIL', async () => {
    const { error } = await svc.from('property_files').insert({
      file_name: null as unknown as string,
      file_type: 'application/pdf',
      file_url: 'https://example.com/test.pdf',
    });
    expect(error).not.toBeNull();
  });

  it('file_type=null must FAIL', async () => {
    const { error } = await svc.from('property_files').insert({
      file_name: 'test.pdf',
      file_type: null as unknown as string,
      file_url: 'https://example.com/test.pdf',
    });
    expect(error).not.toBeNull();
  });

  it('file_url=null must FAIL', async () => {
    const { error } = await svc.from('property_files').insert({
      file_name: 'test.pdf',
      file_type: 'application/pdf',
      file_url: null as unknown as string,
    });
    expect(error).not.toBeNull();
  });
});

describe('property_files — nullable positive', () => {
  it('insert WITHOUT extracted_text and summary → both read back as NULL', async () => {
    let capturedId: string | null = null;

    try {
      const { data: inserted, error: insErr } = await svc
        .from('property_files')
        .insert({
          file_name: 'sparse_test.pdf',
          file_type: 'application/pdf',
          file_url: 'https://example.com/sparse_test.pdf',
          // No extracted_text, no summary
        })
        .select('id, extracted_text, summary')
        .single();
      expect(insErr, `insert failed: ${insErr?.message}`).toBeNull();
      capturedId = inserted!.id;

      expect(inserted?.extracted_text).toBeNull();
      expect(inserted?.summary).toBeNull();
    } finally {
      if (capturedId) await cleanupPropertyFile(capturedId);
    }
  });
});
