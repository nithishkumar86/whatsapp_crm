import mammoth from 'mammoth';

/**
 * Text extraction for uploaded property files.
 *
 * - PDF  -> pdf-parse
 * - DOC/DOCX -> mammoth
 * - image/video -> no text (returns null)
 *
 * Server-side only. Callers pass the raw file Buffer plus a normalized
 * file_type ('pdf' | 'doc' | 'image' | 'video').
 */

export type PropertyFileType = 'pdf' | 'doc' | 'image' | 'video';

/**
 * Extract text from a PDF buffer.
 * pdf-parse is required lazily so importing this module does not pull in
 * its debug-mode file read at load time.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  if (!buffer || buffer.length === 0) {
    throw new Error('extractPdfText: empty buffer');
  }
  // Lazy require avoids pdf-parse's top-level test-file behavior.
  const pdfParse = (await import('pdf-parse')).default;
  const result = await pdfParse(buffer);
  return (result.text || '').trim();
}

/**
 * Extract text from a DOC/DOCX buffer via mammoth.
 */
export async function extractDocText(buffer: Buffer): Promise<string> {
  if (!buffer || buffer.length === 0) {
    throw new Error('extractDocText: empty buffer');
  }
  const result = await mammoth.extractRawText({ buffer });
  return (result.value || '').trim();
}

/**
 * Dispatch extraction based on file type. Returns null for image/video
 * (no text content in v1 — they are reference links only).
 */
export async function extractText(
  buffer: Buffer,
  fileType: PropertyFileType,
): Promise<string | null> {
  switch (fileType) {
    case 'pdf':
      return extractPdfText(buffer);
    case 'doc':
      return extractDocText(buffer);
    case 'image':
    case 'video':
      return null;
    default:
      return null;
  }
}
