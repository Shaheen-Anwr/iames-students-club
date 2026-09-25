import { mkdtemp, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { StorageService } from './storage.service';

describe('StorageService post attachment cleanup', () => {
  let uploadsDir: string;
  let storage: StorageService;

  beforeEach(async () => {
    uploadsDir = await mkdtemp(join(tmpdir(), 'college-social-uploads-'));
    storage = new StorageService({
      get: (key: string) => (key === 'uploadsDir' ? uploadsDir : ''),
    } as never);
  });

  afterEach(async () => {
    await rm(uploadsDir, { recursive: true, force: true });
  });

  it('removes a local uploaded attachment when post creation fails', async () => {
    const relativePath = 'files/orphan.pdf';
    const filePath = join(uploadsDir, relativePath);
    await mkdirFor(filePath);
    await writeFile(filePath, 'orphaned upload');

    await storage.destroyPostAttachment('file', `/uploads/${relativePath}`, 1);

    await expect(stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('removes every local image in a multi-photo post', async () => {
    const relativePaths = ['post-images/one.webp', 'post-images/two.webp'];
    await Promise.all(
      relativePaths.map(async (relativePath) => {
        const filePath = join(uploadsDir, relativePath);
        await mkdirFor(filePath);
        await writeFile(filePath, 'image');
      }),
    );

    await storage.destroyPostAttachment('image', null, 1, relativePaths.map((path) => `/uploads/${path}`));

    await Promise.all(relativePaths.map(async (path) => expect(stat(join(uploadsDir, path))).rejects.toMatchObject({ code: 'ENOENT' })));
  });
});

async function mkdirFor(filePath: string) {
  const { mkdir } = await import('fs/promises');
  await mkdir(dirname(filePath), { recursive: true });
}