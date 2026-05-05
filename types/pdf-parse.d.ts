declare module 'pdf-parse' {
  interface PDFData {
    text: string;
    numpages: number;
    info: Record<string, unknown>;
    metadata: Record<string, unknown>;
    version: string;
  }
  function pdf(dataBuffer: Buffer | Uint8Array, options?: Record<string, unknown>): Promise<PDFData>;
  export default pdf;
  export type { PDFData };
}
