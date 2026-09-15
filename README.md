# Thomas Cochet — portfolio

Astro portfolio with a personal homepage, interactive design canvas and photography collections.

- [Design system and component conventions](docs/design-system.md)
- Content: `src/data/`; external links: `src/data/links.ts`
- Main routes: `/`, `/design`, `/photography`

Run `npm install`, then `npm run dev -- --host 127.0.0.1`.

Checks: `npm run check:design-system`, `npm run check`, `npm run build`.
Stop the portfolio dev server before building and restart afterward to avoid invalidating its dependency cache. See the design-system guide for preview troubleshooting and visual checks.
