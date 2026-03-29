/**
 * Figma → canvas-elements.json sync script
 *
 * Reads a Figma page and extracts all top-level elements,
 * parsing their names to determine element type and data.
 *
 * Naming convention:
 *   project:slug           → project card
 *   project:slug:2         → project card (nth image)
 *   image:/path/to/img.jpg → standalone image
 *   note:text content      → sticky note
 *   subtitle:text          → section subtitle
 *   label:text             → (alias for subtitle)
 *   link:url:text          → link pill
 *   text:text content      → plain text
 *   group:name             → bordered group frame
 *   viewport:initial       → initial view (not rendered)
 *
 * Usage:
 *   FIGMA_TOKEN=xxx npx tsx scripts/sync-canvas.ts
 *
 * Config via env vars:
 *   FIGMA_TOKEN  — Figma personal access token (required)
 *   FIGMA_FILE   — File key (default: i9d5EDdgozyqhEDPq9x9wS)
 *   FIGMA_PAGE   — Page name to read (default: "Canvas")
 */

const FIGMA_TOKEN = process.env.FIGMA_TOKEN;
const FIGMA_FILE = process.env.FIGMA_FILE ?? 'i9d5EDdgozyqhEDPq9x9wS';
const FIGMA_PAGE = process.env.FIGMA_PAGE ?? 'Canvas';

if (!FIGMA_TOKEN) {
  console.error('Error: FIGMA_TOKEN env var is required.');
  console.error('Get one at https://www.figma.com/developers/api#access-tokens');
  process.exit(1);
}

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  absoluteBoundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  rotation?: number;
  children?: FigmaNode[];
}

interface CanvasElement {
  type: string;
  [key: string]: any;
}

async function fetchFigmaFile(): Promise<FigmaNode> {
  const url = `https://api.figma.com/v1/files/${FIGMA_FILE}`;
  const res = await fetch(url, {
    headers: { 'X-Figma-Token': FIGMA_TOKEN! },
  });

  if (!res.ok) {
    throw new Error(`Figma API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.document;
}

function findPage(document: FigmaNode, pageName: string): FigmaNode | null {
  if (!document.children) return null;
  return document.children.find((c) => c.name === pageName) ?? null;
}

function parseElement(node: FigmaNode): CanvasElement | null {
  const name = node.name;
  const bb = node.absoluteBoundingBox;
  if (!bb) return null;

  const base = {
    x: Math.round(bb.x),
    y: Math.round(bb.y),
    width: Math.round(bb.width),
    height: Math.round(bb.height),
    rotation: node.rotation ? Math.round(node.rotation * 10) / 10 : 0,
  };

  // Parse name with convention type:data
  const colonIndex = name.indexOf(':');
  if (colonIndex === -1) {
    // No convention — skip or treat as unknown
    console.warn(`  Skipping "${name}" — no type: prefix`);
    return null;
  }

  const elementType = name.slice(0, colonIndex).toLowerCase();
  const rest = name.slice(colonIndex + 1);

  switch (elementType) {
    case 'project': {
      const parts = rest.split(':');
      const slug = parts[0];
      const imageIndex = parts[1] ? parseInt(parts[1], 10) : 0;
      return { type: 'project', slug, imageIndex, ...base };
    }

    case 'image':
      return { type: 'image', path: rest, ...base };

    case 'note':
      return { type: 'note', text: rest, ...base };

    case 'subtitle':
    case 'label':
      return { type: 'subtitle', text: rest, ...base };

    case 'link': {
      // link:url:text
      const firstColon = rest.indexOf(':');
      if (firstColon === -1) {
        return { type: 'link', url: rest, text: rest, ...base };
      }
      // Find the boundary between URL and text
      // URLs contain :// so we need to be smarter
      const afterProtocol = rest.indexOf('://');
      let splitAt: number;
      if (afterProtocol !== -1) {
        // Find the next colon after the protocol
        splitAt = rest.indexOf(':', afterProtocol + 3);
        // Also check for / followed by : pattern (e.g. hyperline.co/:Visit)
        const slashColon = rest.indexOf('/:');
        if (slashColon !== -1 && slashColon > afterProtocol) {
          splitAt = slashColon + 1;
        }
      } else {
        splitAt = firstColon;
      }

      if (splitAt === -1) {
        return { type: 'link', url: rest, text: rest, ...base };
      }
      const url = rest.slice(0, splitAt);
      const text = rest.slice(splitAt + 1);
      return { type: 'link', url, text, ...base };
    }

    case 'text':
      return { type: 'text', text: rest, ...base };

    case 'title': {
      // title:/path/to/icon.png:Text or title:Text (no icon)
      const firstColon = rest.indexOf(':');
      if (firstColon !== -1 && rest.startsWith('/')) {
        const icon = rest.slice(0, firstColon);
        const text = rest.slice(firstColon + 1);
        return { type: 'title', icon, text, ...base };
      }
      return { type: 'title', text: rest, ...base };
    }

    case 'group':
      return { type: 'group', text: rest, ...base };

    case 'viewport':
      return { type: 'viewport', id: rest, ...base };

    default:
      console.warn(`  Unknown type "${elementType}" in "${name}"`);
      return null;
  }
}

async function main() {
  console.log(`Fetching Figma file ${FIGMA_FILE}...`);
  const document = await fetchFigmaFile();

  const page = findPage(document, FIGMA_PAGE);
  if (!page) {
    console.error(`Page "${FIGMA_PAGE}" not found. Available pages:`);
    document.children?.forEach((c) => console.error(`  - ${c.name}`));
    process.exit(1);
  }

  console.log(`Found page "${FIGMA_PAGE}" with ${page.children?.length ?? 0} top-level elements.\n`);

  const elements: CanvasElement[] = [];
  let skipped = 0;

  for (const node of page.children ?? []) {
    const el = parseElement(node);
    if (el) {
      console.log(`  ✓ ${el.type}: ${el.slug || el.text || el.path || el.id || ''}`);
      elements.push(el);
    } else {
      skipped++;
    }
  }

  // Normalize coordinates: offset so the top-left-most element is near (0, 0)
  if (elements.length > 0) {
    const minX = Math.min(...elements.map((e) => e.x));
    const minY = Math.min(...elements.map((e) => e.y));
    for (const el of elements) {
      el.x -= minX;
      el.y -= minY;
    }
  }

  // Remove zero rotations for cleaner JSON
  for (const el of elements) {
    if (el.rotation === 0) delete el.rotation;
  }

  const outPath = new URL('../src/data/canvas-elements.json', import.meta.url);
  const fs = await import('fs');
  fs.writeFileSync(new URL(outPath), JSON.stringify(elements, null, 2) + '\n');

  console.log(`\nWrote ${elements.length} elements to src/data/canvas-elements.json`);
  if (skipped > 0) {
    console.log(`Skipped ${skipped} elements without a recognized type: prefix`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
