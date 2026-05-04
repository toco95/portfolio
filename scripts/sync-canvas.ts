/**
 * Figma → canvas-elements.json sync script
 *
 * Reads a Figma page and extracts all top-level elements.
 * Layer names carry the type prefix and any non-text identifier (slug, url,
 * path, icon, id). Display text is read from the node's actual content
 * (`characters` field, recursively for frames) so you can edit copy directly
 * inside Figma — including line breaks and colons.
 *
 * Naming convention:
 *
 *   Identifier-only (text not applicable):
 *     project:slug              → project card
 *     project:slug:2            → project card (nth image)
 *     image:/path/to/img.jpg    → standalone image
 *     image:category:/path      → image with category pill
 *       categories: product, designsystem, branding, fullstack, webdesign
 *     viewport:initial          → initial view (not rendered)
 *
 *   Text-bearing (text from node content; see fallback below):
 *     text                      → plain text — content from the TEXT node
 *     note                      → sticky note — content from inner TEXT
 *     subtitle / label          → section subtitle — content from TEXT
 *     group                     → bordered group; label from inner TEXT
 *     link:url                  → link pill; label from inner TEXT
 *     title:/path/to/icon.png   → titled item; text from inner TEXT
 *     title                     → titled item without icon; text from TEXT
 *
 *   Backward compat: if a text-bearing layer still carries old-style text in
 *   its name (e.g. "text:Hello world", "link:url:Visit"), that wins over
 *   `characters`. Rename layers progressively as you go.
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
  characters?: string;
  absoluteBoundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  rotation?: number;
  children?: FigmaNode[];
}

/** Walk a node depth-first and return the first non-empty TEXT content. */
function findTextContent(node: FigmaNode): string | undefined {
  if (node.type === 'TEXT' && node.characters) return node.characters;
  if (!node.children) return undefined;
  for (const child of node.children) {
    const t = findTextContent(child);
    if (t !== undefined) return t;
  }
  return undefined;
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

  // Layer name is "<type>" or "<type>:<rest>". The colon-separated rest
  // carries identifier-only data (slug, path, url, icon path, id) — never
  // display text. For text-bearing types, content is read from the node.
  const colonIndex = name.indexOf(':');
  const elementType = (colonIndex === -1 ? name : name.slice(0, colonIndex)).toLowerCase().trim();
  const rest = colonIndex === -1 ? '' : name.slice(colonIndex + 1);

  switch (elementType) {
    case 'project': {
      const parts = rest.split(':');
      const slug = parts[0];
      const imageIndex = parts[1] ? parseInt(parts[1], 10) : 0;
      return { type: 'project', slug, imageIndex, ...base };
    }

    case 'image': {
      // image:/path → no category
      // image:category:/path → with category (lowercase, no spaces)
      const imgColon = rest.indexOf(':');
      if (imgColon !== -1 && !rest.startsWith('/')) {
        const category = rest.slice(0, imgColon);
        const path = rest.slice(imgColon + 1);
        return { type: 'image', category, path, ...base };
      }
      return { type: 'image', path: rest, ...base };
    }

    case 'note': {
      const text = rest || findTextContent(node) || '';
      return { type: 'note', text, ...base };
    }

    case 'subtitle':
    case 'label': {
      const text = rest || findTextContent(node) || '';
      return { type: 'subtitle', text, ...base };
    }

    case 'link': {
      // New: "link:url" → label from inner TEXT
      // Old: "link:url:text" → both in name (still supported)
      const url = parseLinkUrl(rest);
      const tail = rest.slice(url.length);
      const oldStyleText = tail.startsWith(':') ? tail.slice(1) : '';
      const text = oldStyleText || findTextContent(node) || url;
      return { type: 'link', url, text, ...base };
    }

    case 'text': {
      const text = rest || findTextContent(node) || '';
      return { type: 'text', text, ...base };
    }

    case 'title': {
      // New: "title:/icon.png" → text from inner TEXT
      // Old: "title:/icon.png:Text" → both in name (still supported)
      // Also: "title" (no icon) — text from TEXT
      if (rest.startsWith('/')) {
        const sep = rest.indexOf(':');
        const icon = sep === -1 ? rest : rest.slice(0, sep);
        const oldStyleText = sep === -1 ? '' : rest.slice(sep + 1);
        const text = oldStyleText || findTextContent(node) || '';
        return { type: 'title', icon, text, ...base };
      }
      const text = rest || findTextContent(node) || '';
      return { type: 'title', text, ...base };
    }

    case 'group': {
      const text = rest || findTextContent(node) || '';
      return { type: 'group', text, ...base };
    }

    case 'viewport':
      return { type: 'viewport', id: rest, ...base };

    default:
      console.warn(`  Unknown type "${elementType}" in "${name}"`);
      return null;
  }
}

/** Extract just the URL from a link layer's `rest`, handling old "url:text" form. */
function parseLinkUrl(rest: string): string {
  const protoIdx = rest.indexOf('://');
  if (protoIdx === -1) {
    // No protocol — assume the whole rest up to first colon is the URL
    const c = rest.indexOf(':');
    return c === -1 ? rest : rest.slice(0, c);
  }
  // Has protocol — boundary is the first colon AFTER the protocol, or end of string
  const afterProto = rest.indexOf(':', protoIdx + 3);
  if (afterProto === -1) return rest;
  // Old convention sometimes puts `/:` between url and text (e.g. "hyperline.co/:Visit")
  // Treat the slash as part of the URL if it's right before the boundary colon.
  return rest.slice(0, afterProto);
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
