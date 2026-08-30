// The whole conversion matrix in one place: PDF, Word, PowerPoint, Excel only. `SUPPORTED[src]`
// lists every target the engines can produce from that source; the controller/service validate
// every request against it and GET /api/convert/capabilities hands it to the UI.
//
// Fidelity note: every `-> pdf` / `-> docx` / `-> pptx` pair is produced by a real layout engine
// (Adobe PDF Services or headless LibreOffice, see engines/index.ts) so the source's pagination,
// tables, fonts and RTL survive and the output stays editable; cross-family pairs route through a
// PDF, which makes the result page-bound. `-> xlsx` still goes through the text/table extraction
// pipeline (a spreadsheet has no page canvas). The from-scratch pdfkit draw is only a last-resort
// fallback when neither engine is installed.

export type ConvertFormat = 'pdf' | 'docx' | 'pptx' | 'xlsx';

// (percent 0-100, short Arabic stage label) -- an engine calls this so the worker can relay live
// progress onto the job row.
export type ProgressFn = (percent: number, stage: string) => void;

export interface FormatMeta {
  ext: ConvertFormat;
  label: string;
  contentType: string;
}

export const FORMATS: Record<ConvertFormat, FormatMeta> = {
  pdf: { ext: 'pdf', label: 'PDF', contentType: 'application/pdf' },
  docx: {
    ext: 'docx',
    label: 'Word',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  pptx: {
    ext: 'pptx',
    label: 'PowerPoint',
    contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
  xlsx: {
    ext: 'xlsx',
    label: 'Excel',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
};

// Only these input extensions are accepted (legacy .doc/.ppt/.xls are not).
const EXT_ALIASES: Record<string, ConvertFormat> = {
  pdf: 'pdf',
  docx: 'docx',
  pptx: 'pptx',
  xlsx: 'xlsx',
};

// "Report.FINAL.DOCX" / ".pptx" / "pdf" -> canonical format, or null if unsupported.
export function normalizeFormat(nameOrExt: string): ConvertFormat | null {
  const raw = (nameOrExt.includes('.') ? nameOrExt.split('.').pop()! : nameOrExt).trim().toLowerCase();
  return EXT_ALIASES[raw] ?? null;
}

// Every pair between the four formats (no identity). Adobe converts Office<->Office by routing
// through PDF; the local fallback goes source -> Block[] -> target. Cross-family pairs (Word->Excel,
// Excel->PowerPoint) do something sensible with the text but obviously can't invent structure the
// source never had.
export const SUPPORTED: Record<ConvertFormat, ConvertFormat[]> = {
  pdf: ['docx', 'pptx', 'xlsx'],
  docx: ['pdf', 'pptx', 'xlsx'],
  pptx: ['pdf', 'docx', 'xlsx'],
  xlsx: ['pdf', 'docx', 'pptx'],
};

export const ALL_TARGETS: ConvertFormat[] = [...new Set(Object.values(SUPPORTED).flat())];

export function isSupportedPair(source: string, target: string): boolean {
  const s = normalizeFormat(source);
  const t = normalizeFormat(target);
  return !!s && !!t && SUPPORTED[s].includes(t);
}

// "notes.docx" + "pdf" -> "notes.pdf"
export function buildOutputName(sourceName: string, target: string): string {
  const dot = sourceName.lastIndexOf('.');
  const base = (dot > 0 ? sourceName.slice(0, dot) : sourceName).trim() || 'converted';
  return `${base}.${target}`;
}

export function contentTypeFor(target: string): string {
  const f = normalizeFormat(target);
  return f ? FORMATS[f].contentType : 'application/octet-stream';
}
