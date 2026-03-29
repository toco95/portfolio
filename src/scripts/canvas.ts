import createPanzoom from 'panzoom';

type CanvasMode = 'pan' | 'move' | 'draw';

let instance: ReturnType<typeof createPanzoom> | null = null;
let currentMode: CanvasMode = 'pan';
let drawColor = '#404040';
let viewport: HTMLElement | null = null;
let world: HTMLElement | null = null;
let controller: AbortController;

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
    }
  }, { signal });

  initMoveMode(viewport, world, signal);
  initDrawMode(viewport, signal);
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

  const drawLayer = document.getElementById('draw-layer') as HTMLCanvasElement | null;
  if (drawLayer) {
    drawLayer.style.pointerEvents = mode === 'draw' ? 'auto' : 'none';
  }

  document.querySelectorAll('.toolbar-mode').forEach((btn) => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.mode === mode);
  });

  const colors = document.getElementById('toolbar-colors');
  if (colors) {
    colors.classList.toggle('visible', mode === 'draw');
  }
}

function initToolbar(signal: AbortSignal) {
  document.querySelectorAll('.toolbar-mode').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = (btn as HTMLElement).dataset.mode as CanvasMode;
      if (mode) setMode(mode);
    }, { signal });
  });

  document.querySelectorAll('.toolbar-color').forEach((btn) => {
    btn.addEventListener('click', () => {
      drawColor = (btn as HTMLElement).dataset.color ?? drawColor;
      document.querySelectorAll('.toolbar-color').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    }, { signal });
  });
}

function initKeyboardShortcuts(signal: AbortSignal) {
  document.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'h' || e.key === 'H') setMode('pan');
    if (e.key === 'v' || e.key === 'V') setMode('move');
    if (e.key === 'd' || e.key === 'D') setMode('draw');
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
      dragging.style.zIndex = '';
      dragging.style.cursor = '';
      dragging = null;
    }
  }, { signal });
}

// ─── Draw mode (HTML Canvas) ───

function initDrawMode(vp: HTMLElement, signal: AbortSignal) {
  const canvas = document.getElementById('draw-layer') as HTMLCanvasElement | null;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let drawing = false;
  let lastX = 0;
  let lastY = 0;

  function resizeCanvas() {
    canvas.width = vp.clientWidth * window.devicePixelRatio;
    canvas.height = vp.clientHeight * window.devicePixelRatio;
    canvas.style.width = vp.clientWidth + 'px';
    canvas.style.height = vp.clientHeight + 'px';
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas, { signal });

  canvas.addEventListener('pointerdown', (e) => {
    if (currentMode !== 'draw') return;
    drawing = true;
    lastX = e.clientX - canvas.getBoundingClientRect().left;
    lastY = e.clientY - canvas.getBoundingClientRect().top;
    e.preventDefault();
  }, { signal });

  window.addEventListener('pointermove', (e) => {
    if (!drawing || currentMode !== 'draw') return;
    const x = e.clientX - canvas.getBoundingClientRect().left;
    const y = e.clientY - canvas.getBoundingClientRect().top;

    ctx.strokeStyle = drawColor;
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();

    lastX = x;
    lastY = y;
  }, { signal });

  window.addEventListener('pointerup', () => {
    drawing = false;
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
