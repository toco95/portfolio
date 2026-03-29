import createPanzoom from 'panzoom';

type CanvasMode = 'pan' | 'move' | 'draw' | 'emoji';

let instance: ReturnType<typeof createPanzoom> | null = null;
let currentMode: CanvasMode = 'pan';
let drawColor = '#404040';
let selectedEmoji: string | null = null;
let viewport: HTMLElement | null = null;
let world: HTMLElement | null = null;
let controller: AbortController;
let wasDragging = false;

// ─── Init ───

export function initCanvas(viewportRect?: { x: number; y: number; width: number; height: number }) {
  viewport = document.getElementById('canvas-viewport');
  world = document.getElementById('canvas-world');
  if (!viewport || !world) return;

  // Cleanup previous instance
  controller?.abort();
  controller = new AbortController();
  const { signal } = controller;

  if (instance) {
    instance.dispose();
    instance = null;
  }

  instance = createPanzoom(world, {
    maxZoom: 4,
    minZoom: 0.08,
    smoothScroll: false,
    bounds: false,
    zoomDoubleClickSpeed: 1,
    filterKey: () => true,
  });

  // Text rasterization fix
  let panTimeout: ReturnType<typeof setTimeout> | null = null;
  instance.on('transform', () => {
    world!.classList.add('panning');
    if (panTimeout) clearTimeout(panTimeout);
    panTimeout = setTimeout(() => {
      world!.classList.remove('panning');
      panTimeout = null;
    }, 150);
  });

  // Fit initial viewport
  requestAnimationFrame(() => {
    if (viewportRect) {
      fitRect(viewport!, viewportRect);
    } else {
      fitAllElements(viewport!, world!);
    }
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
      drawColor = (btn as HTMLElement).dataset.color ?? drawColor;
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
    el.style.cursor = 'grabbing';
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
      wasDragging = true;
      dragging.style.zIndex = '';
      dragging.style.cursor = '';
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
    currentPathEl.setAttribute('stroke', drawColor);
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
  const scale = Math.min(scaleX, scaleY);

  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  const tx = vw / 2 - centerX * scale;
  const ty = vh / 2 - centerY * scale;

  instance.zoomAbs(0, 0, scale);
  instance.moveTo(tx, ty);
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
