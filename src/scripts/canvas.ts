import createPanzoom from 'panzoom';

type CanvasMode = 'pan' | 'move' | 'draw' | 'emoji';

// Zoom bounds for the panzoom instance. Lowered min from 0.08 → 0.04 so wide
// section rects (>3000px) still fit on a 375px mobile viewport without the
// scale getting silently clamped (which threw off the fit-rect translation).
const PANZOOM_MIN = 0.04;
const PANZOOM_MAX = 4;

// Pen swatches reference design tokens so drawings re-tint when the theme changes.
const PEN_COLORS: Record<string, string> = {
  primary: 'var(--color-text-primary)',
  orange: 'var(--color-orange-accent)',
  blue: 'var(--color-blue-accent)',
  purple: 'var(--color-purple-accent)',
};

type CanvasAction =
  | { type: 'add'; element: Element; parent: Element }
  | {
      type: 'move';
      element: HTMLElement;
      from: { left: number; top: number };
      to: { left: number; top: number };
    };

let instance: ReturnType<typeof createPanzoom> | null = null;
let currentMode: CanvasMode = 'pan';
let drawColor = PEN_COLORS.primary;
let selectedEmoji: string | null = null;
let viewport: HTMLElement | null = null;
let world: HTMLElement | null = null;
let controller: AbortController;
let wasDragging = false;
const undoStack: CanvasAction[] = [];
const redoStack: CanvasAction[] = [];

// ─── View state persistence (desktop) + mobile section isolation ───

const TRANSFORM_KEY = 'canvasTransform';

function saveTransform() {
  if (!instance) return;
  const t = instance.getTransform();
  try {
    sessionStorage.setItem(TRANSFORM_KEY, JSON.stringify({ x: t.x, y: t.y, scale: t.scale }));
  } catch {}
}

function loadTransform(): { x: number; y: number; scale: number } | null {
  try {
    const raw = sessionStorage.getItem(TRANSFORM_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const isMobileViewport = () => window.matchMedia('(max-width: 768px)').matches;

// One-canvas-per-work on mobile: hide every canvas-element not in the active
// section via inline `display: none`. The GPU only paints one section's
// content (≈4000px wide) instead of the full 17000+px world. No-op on desktop
// so callers can fire it unconditionally on any viewport-changing event.
//
// Setting `data-mobile-ready` on the world also releases the CSS gate in
// global.css that hides every sectioned element by default on mobile — see
// the @media (max-width: 768px) rule there. The gate exists to keep the
// initial paint from laying out the full ~17000px world, which crashes iOS
// Safari before this function ever gets a chance to run.
export function setMobileSection(sectionId: string) {
  if (!world || !isMobileViewport()) return;
  world.querySelectorAll<HTMLElement>('.canvas-element[data-section]').forEach((el) => {
    el.style.display = el.dataset.section === sectionId ? '' : 'none';
  });
  world.dataset.mobileReady = '';
}

function pushAction(action: CanvasAction) {
  undoStack.push(action);
  redoStack.length = 0;
}

function undo() {
  const action = undoStack.pop();
  if (!action) return;
  if (action.type === 'add') {
    if (action.element.isConnected) action.element.remove();
  } else {
    if (!action.element.isConnected) return;
    action.element.style.left = `${action.from.left}px`;
    action.element.style.top = `${action.from.top}px`;
  }
  redoStack.push(action);
}

function redo() {
  const action = redoStack.pop();
  if (!action) return;
  if (action.type === 'add') {
    if (!action.element.isConnected) action.parent.appendChild(action.element);
  } else {
    if (!action.element.isConnected) return;
    action.element.style.left = `${action.to.left}px`;
    action.element.style.top = `${action.to.top}px`;
  }
  undoStack.push(action);
}

// ─── Init ───

export function initCanvas(viewportRect?: { x: number; y: number; width: number; height: number }) {
  viewport = document.getElementById('canvas-viewport');
  world = document.getElementById('canvas-world');
  if (!viewport || !world) return;

  // Cleanup previous instance
  controller?.abort();
  controller = new AbortController();
  const { signal } = controller;
  undoStack.length = 0;
  redoStack.length = 0;

  if (instance) {
    instance.dispose();
    instance = null;
  }

  // Wheel-pan accumulator: trackpads can fire 60-120 wheel events/sec, so we
  // batch deltas and apply once per frame via rAF. Collapses redundant moveTo
  // calls and locks pan updates to the compositor's 60fps cadence, which feels
  // smoother than calling moveTo on every raw event.
  let wheelDx = 0;
  let wheelDy = 0;
  let wheelRaf: number | null = null;
  let panningTimer: ReturnType<typeof setTimeout> | null = null;

  const applyWheelPan = () => {
    wheelRaf = null;
    if (!instance || (wheelDx === 0 && wheelDy === 0)) return;
    const t = instance.getTransform();
    instance.moveTo(t.x - wheelDx, t.y - wheelDy);
    wheelDx = 0;
    wheelDy = 0;
  };

  // Mark the world as "panning" whenever the camera moves so CSS can suppress
  // hover transforms on elements the cursor slides over (otherwise each one
  // briefly promotes its own GPU layer, causing micro-jank during pan/zoom
  // and flyToRect animations). Auto-clears 180ms after the last transform.
  const markPanning = () => {
    world?.classList.add('panning');
    if (panningTimer) clearTimeout(panningTimer);
    panningTimer = setTimeout(() => world?.classList.remove('panning'), 180);
  };

  instance = createPanzoom(world, {
    maxZoom: PANZOOM_MAX,
    minZoom: PANZOOM_MIN,
    // Kinetic inertia on drag-release — pointer flings keep momentum
    // instead of stopping dead. Uses panzoom's built-in kinetic scroll.
    smoothScroll: true,
    bounds: false,
    zoomDoubleClickSpeed: 1,
    filterKey: () => true,
    // Trackpad-friendly wheel handling: by default panzoom treats every wheel
    // event as zoom, which makes the canvas feel stiff on a laptop. We hijack
    // wheel events that aren't pinch-zoom (browsers send ctrlKey on pinch) and
    // pan the world instead. ctrl/⌘+wheel falls through to panzoom for zoom.
    beforeWheel: (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return false;
      e.preventDefault();
      wheelDx += e.deltaX;
      wheelDy += e.deltaY;
      if (wheelRaf === null) wheelRaf = requestAnimationFrame(applyWheelPan);
      return true;
    },
  });

  // Mark `.panning` on every camera change (wheel, drag, kinetic, flyToRect).
  instance.on('transform', markPanning);

  // Capture-phase wheel handler covering the gaps in panzoom's built-in wheel
  // handling. Two cases:
  //  1. Cursor over the toolbar / emoji picker (fixed, outside #canvas-viewport):
  //     wheel events never bubble to panzoom, so the browser zooms/scrolls the page.
  //  2. Non-pan modes (emoji/draw/move): panzoom is paused (see setMode), so its
  //     internal wheel handler bails without preventDefault and the browser zooms
  //     or scrolls even when the cursor is over the canvas.
  // We drive zoom via instance.zoomTo (works while paused) and reuse the same
  // pan accumulator as beforeWheel. When the cursor is over the toolbar we anchor
  // zoom at viewport center — anchoring at the bottom of the screen warps weirdly.
  document.addEventListener('wheel', (e: WheelEvent) => {
    if (!instance || !viewport) return;
    const overViewport = viewport.contains(e.target as Node);

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      const rect = viewport.getBoundingClientRect();
      const cx = overViewport ? e.clientX - rect.left : rect.width / 2;
      const cy = overViewport ? e.clientY - rect.top : rect.height / 2;
      const sign = Math.sign(e.deltaY);
      const ratio = 1 - sign * Math.min(0.25, Math.abs(e.deltaY / 128));
      instance.zoomTo(cx, cy, ratio);
      return;
    }

    // Non-ctrl wheel = pan. Let beforeWheel handle it when panzoom is active and
    // the cursor is inside the viewport; otherwise (paused, or over the toolbar)
    // pan the canvas ourselves.
    if (!instance.isPaused() && overViewport) return;
    e.preventDefault();
    e.stopPropagation();
    wheelDx += e.deltaX;
    wheelDy += e.deltaY;
    if (wheelRaf === null) wheelRaf = requestAnimationFrame(applyWheelPan);
  }, { passive: false, capture: true, signal });

  const mobile = isMobileViewport();

  // Transform persistence: desktop only. On mobile, sections are isolated
  // (one canvas at a time) so a saved transform from section A would land
  // weirdly when section B is loaded.
  if (!mobile) {
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    instance.on('transform', () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(saveTransform, 200);
    });
    document.addEventListener('astro:before-swap', saveTransform, { signal });
  }

  // Initial framing
  requestAnimationFrame(() => {
    if (mobile) {
      // On mobile, hide everything not in the first/hash section and frame it.
      const hashId = window.location.hash.replace(/^#/, '');
      const namedRaw = viewport!.dataset.namedViewports;
      const named = namedRaw ? JSON.parse(namedRaw) : {};
      const sectionIds = Object.keys(named).filter((k) => k !== 'initial');
      const initialSectionId = (hashId && named[hashId]) ? hashId : sectionIds[0];
      if (initialSectionId) {
        setMobileSection(initialSectionId);
        const rect = named[initialSectionId];
        if (rect) fitRect(viewport!, rect);
      } else {
        fitAllElements(viewport!, world!);
      }
    } else {
      // Desktop: restore saved transform if any, otherwise URL hash, otherwise fit-all.
      const saved = loadTransform();
      if (saved) {
        instance!.zoomAbs(0, 0, saved.scale);
        instance!.moveTo(saved.x, saved.y);
      } else if (viewportRect) {
        fitRect(viewport!, viewportRect);
      } else {
        fitAllElements(viewport!, world!);
      }
    }
    requestAnimationFrame(() => world!.classList.add('ready'));
  });

  // Tap/click handling for project modals (pan mode only)
  let tapStartPos = { x: 0, y: 0 };
  let tapStartTime = 0;
  let tapTarget: EventTarget | null = null;

  world.addEventListener('pointerdown', (e) => {
    tapStartPos = { x: e.clientX, y: e.clientY };
    tapStartTime = Date.now();
    tapTarget = e.target;
  }, { signal });

  world.addEventListener('pointerup', (e) => {
    if (currentMode !== 'pan') return;

    const dx = e.clientX - tapStartPos.x;
    const dy = e.clientY - tapStartPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const duration = Date.now() - tapStartTime;

    if (distance > 10 || duration > 300) return;

    const target = tapTarget as HTMLElement | null;
    if (!target) return;

    const projectEl = target.closest('[data-project-id]');
    if (projectEl) {
      const id = (projectEl as HTMLElement).dataset.projectId;
      if (id) window.dispatchEvent(new CustomEvent('open-project-modal', { detail: { id } }));
      return;
    }

    const externalEl = target.closest('[data-external-url]');
    if (externalEl) {
      const url = (externalEl as HTMLElement).dataset.externalUrl;
      if (url) window.open(url, '_blank');
      return;
    }

    // Handle native links (e.g. canvas-link elements)
    const linkEl = target.closest('a[href]') as HTMLAnchorElement | null;
    if (linkEl) {
      if (linkEl.target === '_blank') {
        window.open(linkEl.href, '_blank');
      } else {
        window.location.href = linkEl.href;
      }
    }
  }, { signal });

  // Block native link clicks during move/draw or after a drag
  world.addEventListener('click', (e) => {
    if (currentMode !== 'pan' || wasDragging) {
      const link = (e.target as HTMLElement).closest('a');
      if (link) e.preventDefault();
      wasDragging = false;
    }
  }, { signal });

  initMoveMode(viewport, world, signal);
  initDrawMode(viewport, signal);
  initEmojiMode(viewport, world, signal);
  initToolbar(signal);
  initKeyboardShortcuts(signal);

  // Sync viewport + toolbar state with the initial mode so cursor/styles apply on first paint.
  setMode(currentMode);
}

// ─── Mode system ───

function setMode(mode: CanvasMode) {
  currentMode = mode;

  if (mode === 'pan') {
    instance?.resume();
  } else {
    instance?.pause();
  }

  viewport?.setAttribute('data-mode', mode);

  const drawLayer = document.getElementById('draw-layer');
  if (drawLayer) {
    drawLayer.style.pointerEvents = (mode === 'draw' || mode === 'emoji') ? 'auto' : 'none';
  }

  document.querySelectorAll('.toolbar-mode').forEach((btn) => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.mode === mode);
  });

  const colors = document.getElementById('toolbar-colors');
  if (colors) {
    colors.classList.toggle('visible', mode === 'draw');
  }

  const emojiPicker = document.getElementById('emoji-picker');
  if (emojiPicker) {
    emojiPicker.classList.toggle('visible', mode === 'emoji');
  }

}

function initToolbar(signal: AbortSignal) {
  document.querySelectorAll('.toolbar-mode').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = (btn as HTMLElement).dataset.mode as CanvasMode;
      if (mode) setMode(mode === currentMode ? 'pan' : mode);
    }, { signal });
  });

  document.querySelectorAll('.toolbar-color').forEach((btn) => {
    btn.addEventListener('click', () => {
      const token = (btn as HTMLElement).dataset.colorToken;
      if (token && PEN_COLORS[token]) drawColor = PEN_COLORS[token];
      document.querySelectorAll('.toolbar-color').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    }, { signal });
  });

  document.querySelectorAll('.emoji-item').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedEmoji = (btn as HTMLElement).dataset.emojiSrc ?? null;
      document.querySelectorAll('.emoji-item').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    }, { signal });
  });
}

function initKeyboardShortcuts(signal: AbortSignal) {
  document.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }
    if (
      ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) ||
      ((e.metaKey || e.ctrlKey) && (e.key === 'y' || e.key === 'Y'))
    ) {
      e.preventDefault();
      redo();
      return;
    }
    if (e.key === 'v' || e.key === 'V') setMode('pan');
    if (e.key === 'h' || e.key === 'H') setMode('move');
    if (e.key === 'd' || e.key === 'D') setMode('draw');
    if (e.key === 'e' || e.key === 'E') setMode('emoji');
  }, { signal });
}

// ─── Move mode ───

function initMoveMode(viewport: HTMLElement, world: HTMLElement, signal: AbortSignal) {
  let dragging: HTMLElement | null = null;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  viewport.addEventListener('pointerdown', (e) => {
    if (currentMode !== 'move') return;

    const el = (e.target as HTMLElement).closest('.canvas-element') as HTMLElement | null;
    if (!el) return;

    dragging = el;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = parseFloat(el.style.left) || 0;
    startTop = parseFloat(el.style.top) || 0;
    el.style.zIndex = '999';
    e.preventDefault();
  }, { signal });

  window.addEventListener('pointermove', (e) => {
    if (!dragging || currentMode !== 'move') return;

    const scale = instance?.getTransform().scale ?? 1;
    const dx = (e.clientX - startX) / scale;
    const dy = (e.clientY - startY) / scale;

    dragging.style.left = `${startLeft + dx}px`;
    dragging.style.top = `${startTop + dy}px`;
  }, { signal });

  window.addEventListener('pointerup', () => {
    if (dragging) {
      const finalLeft = parseFloat(dragging.style.left) || 0;
      const finalTop = parseFloat(dragging.style.top) || 0;
      if (finalLeft !== startLeft || finalTop !== startTop) {
        pushAction({
          type: 'move',
          element: dragging,
          from: { left: startLeft, top: startTop },
          to: { left: finalLeft, top: finalTop },
        });
      }
      wasDragging = true;
      dragging.style.zIndex = '';
      dragging = null;
      // Reset after the click event fires
      requestAnimationFrame(() => { wasDragging = false; });
    }
  }, { signal });
}

// ─── Draw mode (SVG paths in world) ───

function initDrawMode(vp: HTMLElement, signal: AbortSignal) {
  const drawLayer = document.getElementById('draw-layer') as HTMLElement | null;
  if (!drawLayer) return;

  let drawing = false;
  let currentPath: string[] = [];
  let currentSvg: SVGSVGElement | null = null;
  let currentPathEl: SVGPathElement | null = null;

  function screenToWorld(clientX: number, clientY: number) {
    const transform = instance?.getTransform();
    if (!transform) return { x: 0, y: 0 };
    const rect = vp.getBoundingClientRect();
    return {
      x: (clientX - rect.left - transform.x) / transform.scale,
      y: (clientY - rect.top - transform.y) / transform.scale,
    };
  }

  drawLayer.addEventListener('pointerdown', (e) => {
    if (currentMode !== 'draw') return;
    drawing = true;
    e.preventDefault();

    const pos = screenToWorld(e.clientX, e.clientY);
    currentPath = [`M${pos.x},${pos.y}`];

    // Create SVG element in the world
    currentSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    currentSvg.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;overflow:visible;pointer-events:none;';
    currentPathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    currentPathEl.setAttribute('fill', 'none');
    currentPathEl.style.stroke = drawColor;
    currentPathEl.setAttribute('stroke-width', '4');
    currentPathEl.setAttribute('stroke-linecap', 'round');
    currentPathEl.setAttribute('stroke-linejoin', 'round');
    currentPathEl.setAttribute('d', currentPath.join(''));
    currentSvg.appendChild(currentPathEl);
    world!.appendChild(currentSvg);
  }, { signal });

  window.addEventListener('pointermove', (e) => {
    if (!drawing || currentMode !== 'draw' || !currentPathEl) return;
    const pos = screenToWorld(e.clientX, e.clientY);
    currentPath.push(`L${pos.x},${pos.y}`);
    currentPathEl.setAttribute('d', currentPath.join(''));
  }, { signal });

  window.addEventListener('pointerup', () => {
    if (!drawing) return;
    drawing = false;
    if (currentSvg && currentPath.length > 1) {
      pushAction({ type: 'add', element: currentSvg, parent: world! });
    } else if (currentSvg) {
      currentSvg.remove();
    }
    currentSvg = null;
    currentPathEl = null;
    currentPath = [];
  }, { signal });
}

// ─── Emoji stamp mode ───

function initEmojiMode(vp: HTMLElement, world: HTMLElement, signal: AbortSignal) {
  const drawLayer = document.getElementById('draw-layer');
  if (!drawLayer) return;

  drawLayer.addEventListener('pointerdown', (e) => {
    if (currentMode !== 'emoji' || !selectedEmoji) return;
    e.preventDefault();

    const transform = instance?.getTransform();
    if (!transform) return;

    const rect = vp.getBoundingClientRect();
    const scale = transform.scale;
    const worldX = (e.clientX - rect.left - transform.x) / scale;
    const worldY = (e.clientY - rect.top - transform.y) / scale;

    const wrapper = document.createElement('div');
    wrapper.className = 'canvas-element';
    wrapper.style.cssText = `left:${worldX - 24}px;top:${worldY - 24}px;width:48px;height:48px;`;

    const stamp = document.createElement('img');
    stamp.src = selectedEmoji;
    stamp.alt = '';
    stamp.draggable = false;
    stamp.style.cssText = 'width:100%;height:100%;object-fit:contain;pointer-events:none;user-select:none;';

    wrapper.appendChild(stamp);
    world.appendChild(wrapper);
    pushAction({ type: 'add', element: wrapper, parent: world });
  }, { signal });
}

// ─── Viewport fitting ───

function fitRect(
  viewport: HTMLElement,
  rect: { x: number; y: number; width: number; height: number }
) {
  if (!instance) return;

  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  const padding = 60;

  const scaleX = (vw - padding * 2) / rect.width;
  const scaleY = (vh - padding * 2) / rect.height;
  // Clamp to the panzoom bounds. Without this, panzoom silently clamps
  // zoomAbs() but our tx/ty math uses the unclamped value, leaving the rect
  // off-center on small viewports.
  const scale = Math.min(PANZOOM_MAX, Math.max(PANZOOM_MIN, Math.min(scaleX, scaleY)));

  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  const tx = vw / 2 - centerX * scale;
  const ty = vh / 2 - centerY * scale;

  instance.zoomAbs(0, 0, scale);
  instance.moveTo(tx, ty);
}

let flyAnimationId: number | null = null;

// Animated counterpart to fitRect — interpolates scale + translation over `duration` ms.
export function flyToRect(
  rect: { x: number; y: number; width: number; height: number },
  duration = 700,
) {
  if (!instance || !viewport) return;

  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  const padding = 60;

  const scaleX = (vw - padding * 2) / rect.width;
  const scaleY = (vh - padding * 2) / rect.height;
  const targetScale = Math.min(PANZOOM_MAX, Math.max(PANZOOM_MIN, Math.min(scaleX, scaleY)));

  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  const targetTx = vw / 2 - centerX * targetScale;
  const targetTy = vh / 2 - centerY * targetScale;

  const start = instance.getTransform();
  const startScale = start.scale;
  const startTx = start.x;
  const startTy = start.y;

  const t0 = performance.now();
  // Ease-out cubic — quick start, soft landing.
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);

  if (flyAnimationId !== null) cancelAnimationFrame(flyAnimationId);

  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / duration);
    const k = ease(t);
    const s = startScale + (targetScale - startScale) * k;
    const x = startTx + (targetTx - startTx) * k;
    const y = startTy + (targetTy - startTy) * k;
    instance!.zoomAbs(0, 0, s);
    instance!.moveTo(x, y);
    if (t < 1) {
      flyAnimationId = requestAnimationFrame(step);
    } else {
      flyAnimationId = null;
    }
  };
  flyAnimationId = requestAnimationFrame(step);
}

function fitAllElements(viewport: HTMLElement, world: HTMLElement) {
  const elements = world.querySelectorAll('.canvas-element');
  if (elements.length === 0) return;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  elements.forEach(el => {
    const htmlEl = el as HTMLElement;
    const left = parseFloat(htmlEl.style.left) || 0;
    const top = parseFloat(htmlEl.style.top) || 0;
    const width = parseFloat(htmlEl.style.width) || htmlEl.offsetWidth;
    const height = parseFloat(htmlEl.style.height) || htmlEl.offsetHeight;

    minX = Math.min(minX, left);
    minY = Math.min(minY, top);
    maxX = Math.max(maxX, left + width);
    maxY = Math.max(maxY, top + height);
  });

  fitRect(viewport, {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  });
}
