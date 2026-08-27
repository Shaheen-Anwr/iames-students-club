/**
 * One-off backfill: shrink images uploaded BEFORE upload-time compression existed.
 *
 * New uploads already get an incoming transformation so the stored master is small
 * (StorageService.uploadSingleAsset). Older assets are still stored full-size and keep eating the
 * Cloudinary free-tier storage quota. This walks every image folder in the connected Cloudinary
 * account and re-uploads each asset over itself, resized to the category cap
 * (StorageService.recompressStoredImage). Format/extension is left unchanged so URLs already saved
 * in Mongo keep working; `invalidate: true` purges the old CDN copy. Idempotent -- processed
 * assets are tagged 'legacy-compressed' and skipped on re-run.
 *
 * Build first (`npm run build`), then:
 *   node dist/scripts/compress-legacy-images.js --dry-run
 *   node dist/scripts/compress-legacy-images.js
 *   node dist/scripts/compress-legacy-images.js --only=photos,cover-photos
 *
 * Needs the same env as the server: MONGODB_URI + CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET.
 */
import { NestFactory } from '@nestjs/core';
import { v2 as cloudinary } from 'cloudinary';
import { AppModule } from '../app.module';
import { StorageService } from '../upload/storage.service';
import type { UploadCategory } from '../upload/multer.config';

// Cloudinary "folder" == our UploadCategory. 'files/' also gets scanned but only its image-typed
// assets come back (resource_type:'image' filter), so generic docs there are untouched.
const IMAGE_FOLDERS: UploadCategory[] = ['photos', 'cover-photos', 'post-images', 'chat-backgrounds', 'files'];

interface CliArgs {
  dryRun: boolean;
  only: Set<string> | null;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const onlyArg = argv.find((a) => a.startsWith('--only='));
  return {
    dryRun: argv.includes('--dry-run'),
    only: onlyArg
      ? new Set(
          onlyArg
            .slice('--only='.length)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        )
      : null,
  };
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

interface CldResource {
  public_id: string;
  bytes: number;
  tags?: string[];
}

async function listFolderImages(prefix: string): Promise<CldResource[]> {
  const out: CldResource[] = [];
  let nextCursor: string | undefined;
  do {
    const res: { resources: CldResource[]; next_cursor?: string } = await cloudinary.api.resources({
      resource_type: 'image',
      type: 'upload',
      prefix: `${prefix}/`,
      max_results: 500,
      next_cursor: nextCursor,
      tags: true,
    });
    out.push(...res.resources);
    nextCursor = res.next_cursor;
  } while (nextCursor);
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const storage = app.get(StorageService);

  const folders = IMAGE_FOLDERS.filter((f) => !args.only || args.only.has(f));
  if (!folders.length) {
    console.error(`--only matched no known image folder. Known: ${IMAGE_FOLDERS.join(', ')}`);
    await app.close();
    process.exit(1);
  }

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let dryCount = 0;
  let beforeTotal = 0;
  let afterTotal = 0;

  console.log(args.dryRun ? '--- DRY RUN (no uploads) ---' : '--- compressing legacy images ---');

  for (const folder of folders) {
    let resources: CldResource[];
    try {
      resources = await listFolderImages(folder);
    } catch (e) {
      console.log(`\n== ${folder}/ : could not list (${(e as Error).message}) -- skipping folder`);
      continue;
    }
    console.log(`\n== ${folder}/ : ${resources.length} image asset(s) ==`);

    for (const r of resources) {
      if (Array.isArray(r.tags) && r.tags.includes('legacy-compressed')) {
        skipped++;
        continue;
      }

      if (args.dryRun) {
        dryCount++;
        beforeTotal += r.bytes;
        console.log(`  would compress ${r.public_id}  (${mb(r.bytes)})`);
        continue;
      }

      try {
        const res = await storage.recompressStoredImage(r.public_id, folder);
        if (!res) {
          console.error('  ! Cloudinary is not configured -- aborting.');
          process.exitCode = 1;
          await app.close();
          return;
        }
        if (res.skippedReason) {
          skipped++;
          console.log(`  skip ${r.public_id} (${res.skippedReason})`);
          continue;
        }
        processed++;
        beforeTotal += res.beforeBytes;
        afterTotal += res.afterBytes;
        const saved = res.beforeBytes - res.afterBytes;
        const delta = saved >= 0 ? `-${mb(saved)}` : `+${mb(-saved)}`;
        console.log(`  ok   ${r.public_id}  ${mb(res.beforeBytes)} -> ${mb(res.afterBytes)}  (${delta})`);
      } catch (e) {
        failed++;
        console.log(`  FAIL ${r.public_id}: ${(e as Error).message}`);
      }
    }
  }

  console.log('\n----- summary -----');
  if (args.dryRun) {
    console.log(`${dryCount} asset(s), ${mb(beforeTotal)} stored, would be recompressed.`);
  } else {
    console.log(`processed ${processed}, skipped ${skipped}, failed ${failed}`);
    console.log(`stored (processed only): ${mb(beforeTotal)} -> ${mb(afterTotal)}  (saved ${mb(beforeTotal - afterTotal)})`);
  }

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
