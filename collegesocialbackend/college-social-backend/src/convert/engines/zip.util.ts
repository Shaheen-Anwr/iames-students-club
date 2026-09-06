// Shared "bundle several files into one .zip buffer" helper -- used by ConvertService.streamZip
// (zipping several already-finished jobs' outputs for the batch-download button) and by the queue
// worker (zipping a single tool job's several output buffers, e.g. split / pdf->images).

// eslint-disable-next-line @typescript-eslint/no-var-requires
const AdmZip = require('adm-zip');

export function zipBuffers(files: { name: string; data: Buffer }[]): Buffer {
  const zip = new AdmZip();
  const seen = new Map<string, number>();
  for (const f of files) {
    let name = f.name;
    const n = seen.get(name) ?? 0;
    seen.set(name, n + 1);
    if (n) name = name.replace(/(\.[^.]+)$/, `-${n}$1`);
    zip.addFile(name, f.data);
  }
  return zip.toBuffer();
}
