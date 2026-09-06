// High-fidelity conversion via Adobe PDF Services (the same class of engine the big converter
// sites use). Enabled automatically when PDF_SERVICES_CLIENT_ID + PDF_SERVICES_CLIENT_SECRET are
// set; otherwise the local Poppler / LibreOffice / pdfkit pipeline is used. Free tier: 500
// document transactions / month. Get credentials at https://acrobatservices.adobe.com/dc-integration-creation-app-cdn/main.html
//
// Covers every pair in our matrix:
//   pdf -> docx|pptx|xlsx   via Export PDF   (Adobe's PDF->Office engine; recovers text + layout
//                                             from broken font encodings far better than any
//                                             self-hosted tool)
//   docx|pptx|xlsx -> pdf   via Create PDF
//   docx<->pptx<->xlsx      chained: source -> Create PDF -> pdf -> Export PDF -> target

import { Readable } from 'stream';
import type { OfficeFormat, ProgressFn } from '../formats';

// The SDK pulls in log4js and prints "No logging configuration" on load; silence it first.
// eslint-disable-next-line @typescript-eslint/no-var-requires
try {
  require('log4js').configure({ appenders: { _n: { type: 'console' } }, categories: { default: { appenders: ['_n'], level: 'off' } } });
} catch {
  /* log4js not resolvable yet -- harmless */
}
// eslint-disable-next-line @typescript-eslint/no-var-requires
const adobe = require('@adobe/pdfservices-node-sdk');

// Read env lazily: this module is imported while Nest builds its DI graph, which is before
// ConfigModule.forRoot() loads .env -- so reading process.env at module top level would miss it.
const clientId = () => process.env.PDF_SERVICES_CLIENT_ID || process.env.ADOBE_CLIENT_ID || '';
const clientSecret = () => process.env.PDF_SERVICES_CLIENT_SECRET || process.env.ADOBE_CLIENT_SECRET || '';
// The SDK's per-request timeout defaults to 10s -- too tight for uploading a multi-MB PDF or
// downloading a large converted file over a slow link.
const requestTimeoutMs = () => Number(process.env.PDF_SERVICES_TIMEOUT_MS) || 240_000;

export function adobeAvailable(): boolean {
  return !!(clientId() && clientSecret());
}

const MIME: Record<OfficeFormat, string> = {
  pdf: adobe.MimeType.PDF,
  docx: adobe.MimeType.DOCX,
  pptx: adobe.MimeType.PPTX,
  xlsx: adobe.MimeType.XLSX,
};
const EXPORT_TARGET: Record<'docx' | 'pptx' | 'xlsx', string> = {
  docx: adobe.ExportPDFTargetFormat.DOCX,
  pptx: adobe.ExportPDFTargetFormat.PPTX,
  xlsx: adobe.ExportPDFTargetFormat.XLSX,
};

let servicesSingleton: any;
function services(): any {
  if (!servicesSingleton) {
    const credentials = new adobe.ServicePrincipalCredentials({ clientId: clientId(), clientSecret: clientSecret() });
    const clientConfig = new adobe.ClientConfig({ timeout: requestTimeoutMs() });
    servicesSingleton = new adobe.PDFServices({ credentials, clientConfig });
  }
  return servicesSingleton;
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

const TRANSIENT = /ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket hang up|Client network|network request failed/i;
const noProgress: ProgressFn = () => undefined;

async function runJobOnce(
  inputBuf: Buffer,
  inputMime: string,
  job: (inputAsset: any) => any,
  resultType: any,
  onProgress: ProgressFn,
  band: [number, number],
): Promise<Buffer> {
  const svc = services();
  onProgress(band[0], 'رفع الملف إلى Adobe');
  const inputAsset = await svc.upload({ readStream: Readable.from(inputBuf), mimeType: inputMime });
  // Adobe processes the job server-side (10s-2min). Ease the bar forward across the band while we
  // poll so it never looks frozen; the real 100% is set by the worker once the file lands.
  let pct = band[0] + 4;
  const ramp = setInterval(() => {
    pct = Math.min(band[1] - 2, pct + 3);
    onProgress(pct, 'جارٍ التحويل في Adobe');
  }, 2500);
  try {
    const pollingURL = await svc.submit({ job: job(inputAsset) });
    const response = await svc.getJobResult({ pollingURL, resultType });
    clearInterval(ramp);
    onProgress(band[1], 'تنزيل الناتج');
    const streamAsset = await svc.getContent({ asset: response.result.asset });
    const out = await streamToBuffer(streamAsset.readStream);
    if (!out.length) throw new Error('Adobe returned an empty file');
    return out;
  } finally {
    clearInterval(ramp);
    await svc.deleteAsset({ asset: inputAsset }).catch(() => undefined);
  }
}

// Retry once on a transient network hiccup (the token endpoint / upload occasionally ETIMEDOUTs).
async function runJob(
  inputBuf: Buffer,
  inputMime: string,
  job: (inputAsset: any) => any,
  resultType: any,
  onProgress: ProgressFn,
  band: [number, number],
): Promise<Buffer> {
  try {
    return await runJobOnce(inputBuf, inputMime, job, resultType, onProgress, band);
  } catch (err) {
    if (!TRANSIENT.test((err as Error).message || '')) throw err;
    await new Promise((r) => setTimeout(r, 2000));
    return runJobOnce(inputBuf, inputMime, job, resultType, onProgress, band);
  }
}

function createPdf(input: Buffer, source: OfficeFormat, onProgress: ProgressFn, band: [number, number]): Promise<Buffer> {
  return runJob(input, MIME[source], (inputAsset) => new adobe.CreatePDFJob({ inputAsset }), adobe.CreatePDFResult, onProgress, band);
}

function exportPdf(input: Buffer, target: 'docx' | 'pptx' | 'xlsx', onProgress: ProgressFn, band: [number, number]): Promise<Buffer> {
  const params = new adobe.ExportPDFParams({ targetFormat: EXPORT_TARGET[target] });
  return runJob(input, adobe.MimeType.PDF, (inputAsset) => new adobe.ExportPDFJob({ inputAsset, params }), adobe.ExportPDFResult, onProgress, band);
}

// Password protect / remove -- Adobe only. pdf-lib has no encryption support at all, and qpdf
// isn't installed anywhere (dev box or Docker image), so there's no pure-JS fallback for these two;
// ConvertToolsController gates their availability on adobeAvailable().
export function protectPdf(input: Buffer, password: string, onProgress: ProgressFn = noProgress): Promise<Buffer> {
  // AES-256 supports full Unicode passwords (Arabic included) -- AES-128 is LATIN-1 only.
  const params = new adobe.ProtectPDFParams({ userPassword: password, encryptionAlgorithm: adobe.EncryptionAlgorithm.AES_256 });
  return runJob(input, adobe.MimeType.PDF, (inputAsset) => new adobe.ProtectPDFJob({ inputAsset, params }), adobe.ProtectPDFResult, onProgress, [8, 92]);
}

export function removeProtection(input: Buffer, password: string, onProgress: ProgressFn = noProgress): Promise<Buffer> {
  const params = new adobe.RemoveProtectionParams({ password });
  return runJob(
    input,
    adobe.MimeType.PDF,
    (inputAsset) => new adobe.RemoveProtectionJob({ inputAsset, params }),
    adobe.RemoveProtectionResult,
    onProgress,
    [8, 92],
  );
}

// HTML -> PDF, real CSS/visual styling preserved (the point of converting HTML at all, unlike the
// htmlToBlocks()+blocksToPdf() fallback which throws away all styling and keeps only text
// structure). A static HTML file with inline CSS uploads directly as mimeType text/html -- no
// zip-with-index.html needed for that simpler single-file case.
export function htmlToPdf(input: Buffer, onProgress: ProgressFn = noProgress): Promise<Buffer> {
  return runJob(input, adobe.MimeType.HTML, (inputAsset) => new adobe.HTMLToPDFJob({ inputAsset }), adobe.HTMLToPDFResult, onProgress, [8, 92]);
}

const COMPRESSION_LEVEL: Record<'low' | 'medium' | 'high', string> = {
  low: adobe.CompressionLevel.LOW,
  medium: adobe.CompressionLevel.MEDIUM,
  high: adobe.CompressionLevel.HIGH,
};

// Fallback for when Ghostscript isn't installed (see ghostscript.engine.ts, the primary path).
export function compressPdfViaAdobe(input: Buffer, level: 'low' | 'medium' | 'high', onProgress: ProgressFn = noProgress): Promise<Buffer> {
  const params = new adobe.CompressPDFParams({ compressionLevel: COMPRESSION_LEVEL[level] });
  return runJob(input, adobe.MimeType.PDF, (inputAsset) => new adobe.CompressPDFJob({ inputAsset, params }), adobe.CompressPDFResult, onProgress, [8, 92]);
}

export async function runViaAdobe(
  input: Buffer,
  source: OfficeFormat,
  target: OfficeFormat,
  onProgress: ProgressFn = noProgress,
): Promise<Buffer> {
  if (source === 'pdf') return exportPdf(input, target as 'docx' | 'pptx' | 'xlsx', onProgress, [8, 92]);
  if (target === 'pdf') return createPdf(input, source, onProgress, [8, 92]);
  // Office -> Office: no direct Adobe path -- round-trip through PDF (2 transactions).
  const pdf = await createPdf(input, source, onProgress, [8, 50]);
  return exportPdf(pdf, target as 'docx' | 'pptx' | 'xlsx', onProgress, [50, 92]);
}

// A quota-exhausted / auth error should fall back to the local pipeline rather than surface.
export function isAdobeRecoverable(err: unknown): boolean {
  return (
    err instanceof adobe.ServiceUsageError ||
    err instanceof adobe.ServiceApiError ||
    err instanceof adobe.SDKError
  );
}
