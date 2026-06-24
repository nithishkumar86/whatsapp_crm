declare module 'pdf-parse' {
  interface PDFParseResult {
    text: string;
    numpages: number;
    numrender: number;
    info: unknown;
    metadata: unknown;
    version: string;
  }

  function pdfParse(
    dataBuffer: Buffer | Uint8Array,
    options?: Record<string, unknown>,
  ): Promise<PDFParseResult>;

  export = pdfParse;
}
