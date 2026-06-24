/**
 * Downscale the canvas project images so they stop blowing up mobile.
 *
 * The canvas never displays an image wider than ~1426 CSS px, yet the source
 * files are 4500–5800px wide. Decode memory is width × height × 4 bytes
 * (independent of the compressed file size), so each oversized image costs
 * 50–80MB of RAM once decoded — a single mobile section holds ~10 of them and
 * blows past iOS Safari's ~200–400MB ceiling. Capping the long edge at
 * MAX_EDGE cuts that by roughly an order of magnitude.
 *
 * Pristine originals are stashed in image-originals/<relative path> on first
 * run (kept OUT of public/ so they're never deployed) and every optimization
 * re-derives from there, so the script is idempotent and you can re-run it with
 * a different MAX_EDGE at any time.
 *
 *   npm run optimize:images
 */
import { readdir, mkdir, copyFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, extname, basename } from 'node:path';
import sharp from 'sharp';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC_DIR = join(ROOT, 'public/images/projects');
const ORIGINALS_DIR = join(ROOT, 'image-originals/projects');

const MAX_EDGE = 2000;
const RASTER = new Set(['.webp', '.png', '.jpg', '.jpeg']);
// Files whose dimensions are meaningful elsewhere (social cards) — leave alone.
const SKIP = new Set(['opengraph.jpg']);

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

async function encodeTo(pipeline: sharp.Sharp, ext: string, dest: string) {
  if (ext === '.webp') return pipeline.webp({ quality: 80 }).toFile(dest);
  if (ext === '.png') return pipeline.png({ compressionLevel: 9 }).toFile(dest);
  return pipeline.jpeg({ quality: 82, mozjpeg: true }).toFile(dest);
}

async function run() {
  if (!existsSync(SRC_DIR)) throw new Error(`Not found: ${SRC_DIR}`);

  const files = (await walk(SRC_DIR)).filter(
    (f) => RASTER.has(extname(f).toLowerCase()) && !SKIP.has(basename(f)),
  );

  let savedKB = 0;
  let processed = 0;

  for (const live of files) {
    const ext = extname(live).toLowerCase();
    const rel = relative(SRC_DIR, live);
    const backup = join(ORIGINALS_DIR, rel);

    // First run for this file: stash the pristine original.
    if (!existsSync(backup)) {
      await mkdir(dirname(backup), { recursive: true });
      await copyFile(live, backup);
    }

    // Always optimize from the pristine original so re-runs are deterministic.
    const meta = await sharp(backup).metadata();
    const longEdge = Math.max(meta.width ?? 0, meta.height ?? 0);
    const before = (await stat(backup)).size;

    if (longEdge <= MAX_EDGE) {
      // Already small enough — make sure the live file matches the original.
      await copyFile(backup, live);
    } else {
      const pipeline = sharp(backup).resize({
        width: meta.width! >= meta.height! ? MAX_EDGE : undefined,
        height: meta.height! > meta.width! ? MAX_EDGE : undefined,
        withoutEnlargement: true,
      });
      await encodeTo(pipeline, ext, live);
    }

    const after = (await stat(live)).size;
    savedKB += (before - after) / 1024;
    processed++;
    const w = Math.min(longEdge, MAX_EDGE);
    console.log(`  ${rel}  ${longEdge}px → ${longEdge <= MAX_EDGE ? longEdge : w}px  (${Math.round(before / 1024)}→${Math.round(after / 1024)} KB)`);
  }

  console.log(`\nOptimized ${processed} files. Disk saved: ${Math.round(savedKB / 1024)} MB. Originals in image-originals/.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
