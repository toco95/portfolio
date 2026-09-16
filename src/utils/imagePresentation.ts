import sharp from 'sharp';
import { join } from 'node:path';

export interface ImagePresentation {
  src: string;
  width: number;
  height: number;
  placeholder: string;
}

const presentationCache = new Map<string, Promise<ImagePresentation>>();

/**
 * Reads a public image once at build time and creates a tiny inline preview.
 * The preview is intentionally small: it gives the page colour and shape while
 * the full image downloads, without adding another network request.
 */
export function getImagePresentation(src: string): Promise<ImagePresentation> {
  const cached = presentationCache.get(src);
  if (cached) return cached;

  const presentation = (async () => {
    const imagePath = join(process.cwd(), 'public', src);
    const image = sharp(imagePath);
    const { width, height } = await image.metadata();

    if (!width || !height) {
      throw new Error(`Could not read image dimensions for ${src}`);
    }

    const preview = await image
      .clone()
      .resize({ width: 32, withoutEnlargement: true })
      .blur(1)
      .webp({ quality: 28 })
      .toBuffer();

    return {
      src,
      width,
      height,
      placeholder: `data:image/webp;base64,${preview.toString('base64')}`,
    };
  })();

  presentationCache.set(src, presentation);
  return presentation;
}
