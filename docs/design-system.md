# Portfolio design system

This documents the implemented UI, including the September 2026 navigation and typography decisions. Keep this guide and the regression checks current when changing shared behavior. Do not infer a new visual design from the token names.

## Sources of truth

| File | Owns |
| --- | --- |
| `src/styles/tokens.css` | Font files, type/weight scale, four palettes, spacing, radii, shadows, header geometry, layers |
| `src/styles/global.css` | Global base, canvas, project modal, prose and route transitions |
| `src/styles/navigation.css` | Menu surface, menu items, focus and disclosure states |
| `src/scripts/dropdowns.ts` | Native dropdown lifecycle across Astro navigations |
| `src/components/Icon.astro` | Typed inline icon set, `currentColor`, decorative SVG accessibility |
| `src/data/links.ts` | External destinations; never repeat their URLs in components |

Tailwind v4 consumes the `@theme static` tokens. Both `text-lg` and `font-size: var(--text-lg)` resolve to the same value. Static emission makes the complete token contract available to scoped component CSS and runtime styles. Custom geometry and layer variables are consumed directly, not as utility classes.

## Typography

Only PP Neue Montreal Book (400) and Medium (500) are loaded. Use `--font-weight-normal` / `font-normal` or `--font-weight-medium` / `font-medium`. “Bold” in visual feedback means the existing Medium face unless a new font asset and weight are explicitly introduced. Synthetic weights are disabled. Do not add 600/700 or rely on the browser to invent a face.

| Token | Size | Current role |
| --- | --- | --- |
| `text-micro`, `text-caption` | 10, 11px | Existing canvas tool hints only |
| `text-tiny` | 12px | Compact keyboard hints |
| `text-sm` | 14px | Secondary compact labels |
| `text-base` | 16px | Homepage navigation, work, highlights, menus, general UI |
| `text-lg` | 18px | Homepage name, tagline and bio; album metadata; canvas text and Design shortcuts |
| `text-xl` | 24px | Design welcome title, project modal titles |
| `text-title` | 28px | Photography album h1 |
| `text-display` | 48px | Canvas artwork titles; zoom changes apparent screen size |

Sizes are rem-based, assuming the browser's default 16px root. Leave the root size alone so user text preferences still work. Heading semantics do not prescribe a single size: the homepage h1 intentionally uses 18px. Keep weights unchanged when adjusting size.

## Colors and themes

Noon is the default palette. Sand, Dusk and Midnight override semantic roles on `<html data-theme>`. Saved values are validated; otherwise the system color preference selects Noon or Midnight. The chrome appearance menu exposes all four themes. Preserve support for saved preferences.

| Role | Use |
| --- | --- |
| `text-primary` | Main text, active/hovered labels and icons |
| `text-secondary` | Supporting text and resting secondary actions |
| `text-tertiary` | Muted icons and low-emphasis metadata; not essential body copy |
| `text-inverse` | Text when intentionally using an inverted surface |
| `bg-page` | Homepage and breadcrumb header |
| `bg-design` | Darker Design welcome page and canvas |
| `bg-canvas` | Legacy neutral surface / photography fallback and scrims; not a replacement for `bg-design` |
| `bg-element` | Cards, menus, tool controls |
| `bg-hover`, `bg-active` | Interaction fills, themed rather than literal gray |
| `border-secondary` | Light menu/card borders and separators |
| `border-primary` | Stronger outlines, underlines, structural boundaries |
| `yellow-*`, `*-accent` | Notes and semantic canvas categories |
| `media-background`, overlay channel tokens | Intentionally theme-independent media surfaces and scrims |

Use role names, not literal hex values, in UI components. Brand SVGs, photographs and authored canvas artwork retain their own colors. Do not replace these with palette tokens. Tertiary text is deliberately low contrast: existing dates use it, but no claim of full accessibility contrast compliance is made. A broader contrast redesign should be reviewed separately.

## Navigation and menus

- Homepage order: Design →, Photography →, About ⌄. Plain text, no underline, no pill, 16px Medium, minimum row height 36px, 20px horizontal gap (16px on narrow screens). Keep the row outside the bio description container.
- Text and icons use primary color on hover **and keyboard focus**. Resting navigation icons use tertiary. The About caret rotates while open.
- `details[data-dropdown]` / `summary` provide native disclosure semantics. Do not add `role="menu"` unless implementing the complete corresponding keyboard model. Contents are ordinary links in normal Tab order.
- Both navigation components import `dropdowns.ts`. It closes other disclosures, closes on outside click, focus departure or scrolling, and returns focus to the trigger on Escape. Abort listeners before route swaps; do not register one permanent document listener per visit.
- `.menu-surface` and `.menu-item` own common appearance. Callers own position and width. Dropdown content uses 16px Medium and 44px minimum item height. Brand icons stay decorative when the adjacent label supplies their name.
- `Chrome.astro` is the historical filename for the compact breadcrumb, not the old floating pill navigation. Its name link returns home; its disclosure switches sections.

## Geometry and layers

`--header-height` is 56px and `--header-padding-inline` is 20px. The header, Design welcome, canvas inset and photography hero height must all use this token. `--surface-radius` resolves to 20px on desktop, 16px below 768px. The homepage portrait remains 40×40px with the 8px radius token.

Stack order: controls 100 → floating gallery controls 150 → dropdowns 160 → Design welcome 200 → header 210 → project/lightbox modal 300 → video modal 1000. Menu children remain inside their parent's stacking context. Raising only the menu cannot overcome a header below the welcome layer. Fullscreen modals intentionally cover the navigation. Small local layer numbers inside a component are allowed.

Spacing generally follows the existing 4px scale. Optical exceptions such as 6px menu padding, 10px icon gaps, icon dimensions, 1px borders, 36px navigation targets and 44px menu items are intentional. Canvas coordinates are content geometry, not UI spacing tokens.

## Motion and routes

Home ↔ sections use vertical page motion; sibling sections crossfade. There is no shared portrait movement. Reduced-motion preferences disable route motion and menu transitions. The Design welcome screen remains available at `/design`; project hash links bypass it. Do not remove the welcome screen when editing global navigation.

Mobile entry into Design deliberately uses a full document load: keeping two large canvases alive during a transition previously exhausted iOS memory. Preserve section isolation in `canvas.ts`. This refactor does not change canvas pan/zoom, photography controls, or hovercard content.

## Validation and maintenance

Run `npm run check:design-system`, `npm run check`, then `npm run build`. The design-system check guards declared token references, token-based sizes/weights, core palette roles and header/layer relationships. It is a source regression check, not a substitute for visual or accessibility testing.

After a shared change, inspect home and the Design welcome screen, open each dropdown, test Escape and Tab, navigate to a project, and inspect photography. Check a narrow viewport and all four palettes when changing color or geometry. Confirm both label and icon states.

**Local preview:** use `npm run dev -- --host 127.0.0.1` for the portfolio URL. Another local project may occupy IPv6 `localhost:4321`. Stop this project's dev server before building, then restart: build and dev dependency optimization can invalidate Vite's cached panzoom module, leaving the Design canvas blank. Do not kill other projects' processes or mistake this for missing content.

The separate skate experiment (`src/skate`, `src/pages/skate.astro`) and authored canvas data are outside the UI token guard. They have their own scene/artwork constraints. Do not mass-rewrite them as part of UI cleanup.

### Main navigation

`canvas/Chrome.astro` supplies floating profile and appearance pills on the left and segmented Home, Design and Photography navigation on the right. Controls use shared surface, border, shadow, typography and radius tokens. Native disclosure menus use the shared dropdown lifecycle. Theme choices persist through the existing theme resolver. The active route uses `aria-current="page"`; there is no shared-avatar animation. On small screens the profile label hides to leave room for navigation. Contact links are available in the profile dropdown; there is no separate contact row above Work.


### Paris modal

`ParisModal.astro` opens from the Paris button in the homepage tagline. It uses a native modal dialog for focus containment and Escape dismissal, plus a close button and outside-click dismissal. Closing returns focus to the trigger. Foodie copy lives in the component; Google Maps destinations remain in `src/data/links.ts`. Unlike the previous hovercard, it opens only on activation.

Floating chrome reserves no space above Design or Photography: canvas and welcome use zero inset, and the photo hero uses the full viewport height. Route transitions have no animation.

Full-viewport Design and Photography surfaces have square outer corners on desktop and mobile; floating controls retain their own radii.

### Desktop rail experiment

Above 900px, Chrome becomes a fixed 280px left rail with identity, bio, page navigation, contacts and appearance controls. `--rail-width` sets the content origin for flowing pages, canvas, welcome and fixed content controls. Smaller viewports retain the floating chrome for now. The homepage header hides on desktop to avoid duplicating identity.

### Figma rail implementation

The current Chrome uses a 240px rail, 16px padding, 20px grouping, 32px navigation rows and existing semantic colors. RailLink owns icon/label layout and active/hover states; exported navigation SVGs are used as masks so they inherit theme colors. Contact destinations remain in links.ts and use real brand icons rather than Figma placeholders. The homepage uses the exported portrait and preserves its real Work and Highlights data. Content receives a subtle 180ms fade with 4px travel; the rail is a separate stationary view-transition layer. Reduced-motion disables the effect. On smaller screens the rail becomes a compact top navigation.

The shared `.content-panel` encloses page content with a 0.5px secondary border, radius-md (8px) and space-2 (8px) outer gutter. Fixed Design surfaces share these bounds.

On desktop the panel has a viewport-bounded height and owns vertical scrolling. The body does not scroll, so the outer gutter and panel corners remain visible throughout.
