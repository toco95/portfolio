/**
 * Prepare portfolio photography for the web.
 *
 * Originals are copied to image-originals/ (which is gitignored), then the
 * deployed files are capped at 2560px and encoded as WebP. Content references
 * are updated automatically, making the script safe to run when adding photos.
 */
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PHOTO_DIR = join(ROOT, 'public/images/photography');
const CONTENT_DIR = join(ROOT, 'src/data/photography');
const ORIGINALS_DIR = join(ROOT, 'image-originals/photography');
const PORTRAIT = join(ROOT, 'public/images/intro-portrait.png');
const PORTRAIT_WEBP = join(ROOT, 'public/images/intro-portrait.webp');
const PORTRAIT_ORIGINAL = join(ROOT, 'image-originals/intro-portrait.png');

// The album column is 928 CSS px wide, so 2048px still covers a 2x display
// and leaves enough resolution for the full-screen lightbox.
const MAX_EDGE = 2048;
const PHOTO_QUALITY = 78;
const WORKERS = 8;
const RASTER_EXTENSIONS = new Set(['.jpeg', '.jpg', '.png', '.webp']);

async function walk(dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

function withoutExtension(file: string) {
  return file.slice(0, -extname(file).length);
}

function findOriginal(relativeFile: string) {
  const stem = withoutExtension(join(ORIGINALS_DIR, relativeFile));
  for (const extension of RASTER_EXTENSIONS) {
    const candidate = `${stem}${extension}`;
    if (existsSync(candidate)) return candidate;
  }
}

async function optimizePhotos() {
  const liveFiles = (await walk(PHOTO_DIR)).filter(
    (file) =>
      RASTER_EXTENSIONS.has(extname(file).toLowerCase()) &&
      !file.endsWith('.tmp.webp'),
  );

  let nextIndex = 0;
  async function worker() {
    let before = 0;
    let after = 0;
    while (nextIndex < liveFiles.length) {
      const live = liveFiles[nextIndex++];
    const relativeFile = relative(PHOTO_DIR, live);
    let original = findOriginal(relativeFile);

    if (!original) {
      original = join(ORIGINALS_DIR, relativeFile);
      await mkdir(dirname(original), { recursive: true });
      await copyFile(live, original);
    }

    const output = `${withoutExtension(live)}.webp`;
    const temporary = `${output}.tmp.webp`;
    const originalSize = (await stat(original)).size;

    await sharp(original)
      .rotate()
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: PHOTO_QUALITY, effort: 3, smartSubsample: true })
      .toFile(temporary);

    await rename(temporary, output);
    if (output !== live) await rm(live);

    before += originalSize;
    after += (await stat(output)).size;
    }
    return { before, after };
  }

  const totals = await Promise.all(Array.from({ length: WORKERS }, () => worker()));
  const before = totals.reduce((sum, total) => sum + total.before, 0);
  const after = totals.reduce((sum, total) => sum + total.after, 0);

  const contentFiles = (await readdir(CONTENT_DIR))
    .filter((file) => file.endsWith('.mdx'))
    .map((file) => join(CONTENT_DIR, file));

  for (const contentFile of contentFiles) {
    const source = await readFile(contentFile, 'utf8');
    const updated = source.replace(
      /(\/images\/photography\/[^"'\s]+?)\.(?:jpe?g|png)/gi,
      '$1.webp',
    );
    if (updated !== source) await writeFile(contentFile, updated);
  }

  return { count: liveFiles.length, before, after };
}

async function optimizePortrait() {
  const source = existsSync(PORTRAIT_ORIGINAL) ? PORTRAIT_ORIGINAL : PORTRAIT;
  if (!existsSync(source)) return;

  if (!existsSync(PORTRAIT_ORIGINAL)) {
    await mkdir(dirname(PORTRAIT_ORIGINAL), { recursive: true });
    await copyFile(PORTRAIT, PORTRAIT_ORIGINAL);
  }

  await sharp(source)
    .rotate()
    .resize({ width: 400, height: 286, fit: 'cover', position: 'centre' })
    .webp({ quality: 84, effort: 4, smartSubsample: true })
    .toFile(PORTRAIT_WEBP);

  if (existsSync(PORTRAIT)) await rm(PORTRAIT);
}

const result = await optimizePhotos();
await optimizePortrait();

const megabytes = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
console.log(
  `Optimized ${result.count} photographs: ${megabytes(result.before)} MB -> ${megabytes(result.after)} MB`,
);
