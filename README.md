# Thomas Cochet — portfolio

Astro portfolio with a personal homepage, interactive design canvas and photography collections.

- [Design system and component conventions](docs/design-system.md)
- Content: `src/data/`; external links: `src/data/links.ts`
- Main routes: `/`, `/design`, `/photography`

Run `npm install`, then `npm run dev -- --host 127.0.0.1`.

Checks: `npm run check:design-system`, `npm run check`, `npm run build`.
Stop the portfolio dev server before building and restart afterward to avoid invalidating its dependency cache. See the design-system guide for preview troubleshooting and visual checks.

Sync the Figma `Canvas` page with `FIGMA_TOKEN` set by running `npm run sync-canvas`.
Layer prefixes are documented in `scripts/sync-canvas.ts`. Imported screenshot layers without prefixes use file-scoped node-ID mappings in `scripts/canvas-layer-names.json`; their optimized assets live in `public/images/projects/`. The sync reads positions, dimensions and content, while image exports are stored separately.
