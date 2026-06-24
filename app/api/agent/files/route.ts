import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { extractText, type PropertyFileType } from '@/lib/file-extract';
import { summarizeToLimit, DOC_CHAR_LIMIT } from '@/lib/chatbot';

/**
 * Property file upload — two categories:
 *   'document' — pdf/doc only. Parsed (text extracted) and injected into the
 *     AI agent context to answer customer queries.
 *   'media'    — images/brochures. Sent directly to customers over WhatsApp;
 *     NOT parsed.
 *
 * GET    /api/agent/files?category=document|media — list (defaults to all).
 * POST   /api/agent/files  (multipart, field `category`) — upload to Supabase
 *   Storage bucket 'property-files', insert row, return immediately. For
 *   documents, text extraction runs AFTER the response in the background so the
 *   upload feels fast — extracted_text is filled in once it finishes.
 * DELETE /api/agent/files?id=…  — remove the storage object + the DB row.
 *
 * File type is validated by extension AND MIME (per category) before any
 * storage write.
 *
 * Protected by session middleware.
 */

const BUCKET = 'property-files';

type Category = 'document' | 'media';

interface ExtSpec {
  type: PropertyFileType;
  mimes: string[];
}

// Documents: parsed for the AI context.
const DOCUMENT_EXT: Record<string, ExtSpec> = {
  pdf: { type: 'pdf', mimes: ['application/pdf'] },
  doc: { type: 'doc', mimes: ['application/msword'] },
  docx: {
    type: 'doc',
    mimes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  },
};

// Media: images + pdf brochures, sent to customers over WhatsApp.
const MEDIA_EXT: Record<string, ExtSpec> = {
  png: { type: 'image', mimes: ['image/png'] },
  jpg: { type: 'image', mimes: ['image/jpeg'] },
  jpeg: { type: 'image', mimes: ['image/jpeg'] },
  webp: { type: 'image', mimes: ['image/webp'] },
  gif: { type: 'image', mimes: ['image/gif'] },
  pdf: { type: 'pdf', mimes: ['application/pdf'] },
};

function allowedFor(category: Category): Record<string, ExtSpec> {
  return category === 'media' ? MEDIA_EXT : DOCUMENT_EXT;
}

function parseCategory(value: unknown): Category {
  return value === 'media' ? 'media' : 'document';
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const categoryParam = req.nextUrl.searchParams.get('category');
  let query = supabase
    .from('property_files')
    .select('id, file_name, file_type, file_url, summary, category, uploaded_at')
    .order('uploaded_at', { ascending: false });

  if (categoryParam === 'document' || categoryParam === 'media') {
    query = query.eq('category', categoryParam);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: `Failed to fetch property files: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json(data ?? [], { status: 200 });
}

function extOf(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx < 0) return '';
  return name.slice(idx + 1).toLowerCase();
}

/**
 * Derive the in-bucket storage path from a public file_url.
 * Public URLs look like .../storage/v1/object/public/property-files/<path>.
 */
function storagePathFromUrl(url: string): string | null {
  const marker = `/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  return decodeURIComponent(url.slice(idx + marker.length));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: 'Expected multipart/form-data' },
      { status: 400 },
    );
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  const category = parseCategory(form.get('category'));
  const allowList = allowedFor(category);

  const originalName = file.name || 'upload';
  const ext = extOf(originalName);
  const allow = allowList[ext];

  // Validate extension first (per category).
  if (!allow) {
    const label = category === 'media' ? 'Property Files (media)' : 'Property Documents';
    return NextResponse.json(
      {
        error: `Unsupported file '.${ext}' for ${label}. Allowed: ${Object.keys(
          allowList,
        ).join(', ')}`,
      },
      { status: 400 },
    );
  }

  // Validate MIME against the extension's allowed set (defense in depth).
  const mime = file.type || '';
  if (mime && !allow.mimes.includes(mime)) {
    return NextResponse.json(
      {
        error: `MIME type '${mime}' does not match extension '.${ext}'`,
      },
      { status: 400 },
    );
  }

  const fileType = allow.type;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length === 0) {
    return NextResponse.json({ error: 'file is empty' }, { status: 400 });
  }

  // Build a collision-resistant storage path.
  const safeBase = originalName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 100);
  const storagePath = `${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}_${safeBase}`;

  // Upload to Supabase Storage.
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: mime || 'application/octet-stream',
      upsert: false,
    });

  if (uploadErr) {
    return NextResponse.json(
      { error: `Storage upload failed: ${uploadErr.message}` },
      { status: 500 },
    );
  }

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  const fileUrl = pub.publicUrl;

  // Insert the row WITHOUT waiting for text extraction so the upload returns
  // fast. For documents we extract + update the row afterwards (below).
  const { data: row, error: insertErr } = await supabase
    .from('property_files')
    .insert({
      file_name: originalName,
      file_type: fileType,
      file_url: fileUrl,
      category,
      extracted_text: null,
    })
    .select('id, file_name, file_type, file_url, summary, category, uploaded_at')
    .single();

  if (insertErr) {
    return NextResponse.json(
      { error: `Failed to save file record: ${insertErr.message}` },
      { status: 500 },
    );
  }

  // Fire-and-forget text extraction (this is an always-on Node server, so the
  // event loop keeps running after the response is sent). Non-fatal on error.
  // ONLY documents are parsed — media files are sent to customers, not read.
  if (category === 'document' && (fileType === 'pdf' || fileType === 'doc')) {
    const rowId = row.id as string;
    void (async () => {
      try {
        const text = await extractText(buffer, fileType);
        if (text) {
          const update: Record<string, unknown> = { extracted_text: text };
          // If the doc is longer than DOC_CHAR_LIMIT (5000) chars, summarize it
          // down to exactly fit within that limit and store as `summary` (the
          // agent prefers summary over raw text). Shorter docs are kept as-is.
          if (text.trim().length > DOC_CHAR_LIMIT) {
            update.summary = await summarizeToLimit(text, DOC_CHAR_LIMIT);
          } else {
            update.summary = null;
          }
          await supabase
            .from('property_files')
            .update(update)
            .eq('id', rowId);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'extraction failed';
        // eslint-disable-next-line no-console
        console.error('[agent/files] background text extraction failed:', msg);
      }
    })();
  }

  return NextResponse.json({ success: true, file: row }, { status: 200 });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  // Look up the row to find the stored object path.
  const { data: row, error: fetchErr } = await supabase
    .from('property_files')
    .select('id, file_url')
    .eq('id', id)
    .single();

  if (fetchErr || !row) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  // Remove the storage object (best-effort — don't block row deletion on it).
  const path = storagePathFromUrl(row.file_url as string);
  if (path) {
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove([path]);
    if (rmErr) {
      // eslint-disable-next-line no-console
      console.error('[agent/files] storage remove failed:', rmErr.message);
    }
  }

  const { error: delErr } = await supabase
    .from('property_files')
    .delete()
    .eq('id', id);

  if (delErr) {
    return NextResponse.json(
      { error: `Failed to delete file record: ${delErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
