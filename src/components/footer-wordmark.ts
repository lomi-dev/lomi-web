/** An authored halftone rendering of the original lomi paths. */
type Dot = {
  homeX: number; homeY: number; x: number; y: number;
  vx: number; vy: number; radius: number; tint: number;
};

const SOURCE_WIDTH = 491;
const SOURCE_HEIGHT = 202;
const MAX_DOTS = 9000;
const ENTRY_DURATION = 800;
const COLORS = ['#0b0d0c', '#152015', '#1d2e17', '#263b19', '#30491c', '#3a561f'];

export function initFooterWordmark(root: HTMLElement): () => void {
  const canvas = root.querySelector<HTMLCanvasElement>('canvas[data-footer-wordmark-canvas]');
  const source = root.querySelector<SVGSVGElement>('svg[data-footer-wordmark-source], [data-footer-wordmark-source] svg');
  if (!canvas || !source || typeof Path2D === 'undefined') return () => {};

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(any-hover: hover) and (any-pointer: fine)');
  let context: CanvasRenderingContext2D | null = null;
  let paths: Path2D[] = [];
  let dots: Dot[] = [];
  let width = 0;
  let height = 0;
  let dpr = 0;
  let pitch = 6;
  let frame = 0;
  let previousTime = 0;
  let entryElapsed = 0;
  let entered = false;
  let visible = false;
  let dirty = true;
  let disposed = false;
  let failed = false;
  let pointer: { x: number; y: number } | null = null;
  let wave: { x: number; y: number; age: number } | null = null;
  let resolution: MediaQueryList | undefined;

  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
  };
  const fail = () => {
    failed = true;
    stop();
    delete root.dataset.wordmarkReady;
  };
  const canAnimate = () => !disposed && !failed && visible && !document.hidden && !reducedMotion.matches;

  // Source paths already use normalized coordinates; their enclosing SVG's
  // translate(40 40) is intentionally excluded from canvas sampling.
  function rebuild() {
    if (!context) {
      context = canvas!.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      paths = Array.from(source!.querySelectorAll('path[d]'), (path) => new Path2D(path.getAttribute('d')!));
      if (!paths.length) throw new Error('No wordmark paths');
    }
    const bounds = canvas!.getBoundingClientRect();
    const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!bounds.width || !bounds.height) return false;
    dirty = false;
    if (bounds.width === width && bounds.height === height && nextDpr === dpr && dots.length) return true;
    width = bounds.width;
    height = bounds.height;
    dpr = nextDpr;
    canvas!.width = Math.max(1, Math.round(width * dpr));
    canvas!.height = Math.max(1, Math.round(height * dpr));
    // Sample with the identity transform: isPointInPath receives source units.
    context.setTransform(1, 0, 0, 1, 0, 0);
    const scale = Math.min(width / SOURCE_WIDTH, height / SOURCE_HEIGHT);
    const logoWidth = SOURCE_WIDTH * scale;
    const logoHeight = SOURCE_HEIGHT * scale;
    const offsetX = (width - logoWidth) / 2;
    const offsetY = (height - logoHeight) / 2;
    pitch = width < 640 ? 3.5 : 6;
    // Bound all candidate grid points, so even a fully filled source is safe.
    while (Math.ceil(logoWidth / pitch) * Math.ceil(logoHeight / pitch) > MAX_DOTS) pitch *= 1.05;
    dots = [];
    for (let y = pitch / 2; y < logoHeight; y += pitch) {
      for (let x = pitch / 2; x < logoWidth; x += pitch) {
        if (!paths.some((path) => context!.isPointInPath(path, x / scale, y / scale, 'evenodd'))) continue;
        const grain = (Math.sin(x * 0.013 + y * 0.019) + 1) / 2;
        dots.push({ homeX: offsetX + x, homeY: offsetY + y, x: 0, y: 0,
          vx: 0, vy: 0, radius: pitch * (0.28 + grain * 0.075), tint: 0 });
      }
    }
    if (!dots.length) throw new Error('Empty wordmark');
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    pointer = null;
    wave = null;
    return true;
  }

  function paint() {
    const ctx = context!;
    ctx.clearRect(0, 0, width, height);
    const progress = Math.min(1, entryElapsed / ENTRY_DURATION);
    for (let tint = 0; tint < COLORS.length; tint++) {
      ctx.beginPath();
      for (const dot of dots) {
        if (dot.tint !== tint) continue;
        // A small travelling assembly, completed once in 800ms.
        const local = Math.max(0, Math.min(1, (progress - dot.homeX / width * 0.22) / 0.78));
        const assembly = entered ? 0 : Math.pow(1 - local, 3);
        const x = dot.homeX + dot.x + assembly * Math.sin(dot.homeY * 0.08) * pitch * 3;
        const y = dot.homeY + dot.y + assembly * (18 + Math.sin(dot.homeX * 0.025) * 12);
        const radius = dot.radius * (1 - assembly * 0.65);
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, Math.PI * 2);
      }
      ctx.fillStyle = COLORS[tint];
      ctx.fill();
    }
    root.dataset.wordmarkReady = 'true';
  }

  function tick(now: number) {
    frame = 0;
    if (!canAnimate()) return;
    try {
      if (dirty && !rebuild()) return;
      const delta = previousTime ? Math.min((now - previousTime) / 1000, 1 / 30) : 1 / 60;
      previousTime = now;
      if (!entered) entryElapsed = Math.min(ENTRY_DURATION, entryElapsed + delta * 1000);
      if (wave) {
        wave.age += delta;
        if (wave.age > 1.1) wave = null;
      }
      let moving = !entered;
      const radius = Math.max(55, Math.min(110, width * 0.1));
      // Substeps keep the spring stable on slow frames and high-refresh screens.
      const steps = Math.ceil(delta / (1 / 120));
      const dt = delta / steps;
      for (const dot of dots) {
        let targetX = 0;
        let targetY = 0;
        let influence = 0;
        if (pointer) {
          const dx = dot.homeX - pointer.x;
          const dy = dot.homeY - pointer.y;
          const distance = Math.hypot(dx, dy);
          if (distance < radius) {
            influence = Math.pow(1 - distance / radius, 2);
            targetX = dx / Math.max(distance, 1) * influence * 26;
            targetY = dy / Math.max(distance, 1) * influence * 26;
          }
        }
        if (wave) {
          const dx = dot.homeX - wave.x;
          const dy = dot.homeY - wave.y;
          const distance = Math.hypot(dx, dy);
          const ring = (distance - wave.age * 480) / 38;
          const force = Math.exp(-ring * ring) * (1 - wave.age / 1.1) * 16;
          targetX += dx / Math.max(distance, 1) * force;
          targetY += dy / Math.max(distance, 1) * force;
          influence = Math.max(influence, force / 20);
        }
        for (let step = 0; step < steps; step++) {
          dot.vx += ((targetX - dot.x) * 180 - dot.vx * 24) * dt;
          dot.vy += ((targetY - dot.y) * 180 - dot.vy * 24) * dt;
          dot.x += dot.vx * dt;
          dot.y += dot.vy * dt;
        }
        if (Math.abs(dot.x - targetX) + Math.abs(dot.y - targetY) + Math.abs(dot.vx) + Math.abs(dot.vy) > 0.025) moving = true;
        else { dot.x = targetX; dot.y = targetY; dot.vx = dot.vy = 0; }
        dot.tint = Math.min(COLORS.length - 1, Math.floor(influence * COLORS.length * 0.75));
      }
      if (entryElapsed >= ENTRY_DURATION) entered = true;
      paint();
      if (moving || wave) frame = requestAnimationFrame(tick);
      else previousTime = 0;
    } catch {
      fail();
    }
  }

  function requestPaint() {
    if (canAnimate() && !frame) frame = requestAnimationFrame(tick);
  }
  function sync() {
    if (reducedMotion.matches) {
      stop();
      pointer = null;
      wave = null;
      entered = true;
      entryElapsed = ENTRY_DURATION;
      dots = [];
      dirty = true;
      delete root.dataset.wordmarkReady;
    } else if (!canAnimate()) {
      stop();
      pointer = null;
    } else {
      dirty = true;
      requestPaint();
    }
  }
  const resize = () => { dirty = true; requestPaint(); };
  const clearPointer = () => { pointer = null; requestPaint(); };
  const pointerPosition = (event: PointerEvent) => {
    if (!finePointer.matches || !['mouse', 'pen'].includes(event.pointerType) || !canAnimate()) return null;
    const bounds = canvas!.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };
  const move = (event: PointerEvent) => {
    const point = pointerPosition(event);
    if (!point) return;
    pointer = point;
    requestPaint();
  };
  const press = (event: PointerEvent) => {
    const point = pointerPosition(event);
    if (!point) return;
    wave = { ...point, age: 0 };
    requestPaint();
  };
  const watchResolution = () => {
    resolution?.removeEventListener('change', watchResolution);
    resolution = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    resolution.addEventListener('change', watchResolution);
    resize();
  };
  const intersection = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  }) : null;
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  intersection?.observe(root);
  observer?.observe(canvas);
  if (!intersection) visible = true;
  root.addEventListener('pointermove', move, { passive: true });
  root.addEventListener('pointerdown', press, { passive: true });
  root.addEventListener('pointerleave', clearPointer, { passive: true });
  root.addEventListener('pointercancel', clearPointer, { passive: true });
  document.addEventListener('visibilitychange', sync);
  reducedMotion.addEventListener('change', sync);
  finePointer.addEventListener('change', clearPointer);
  window.addEventListener('resize', resize, { passive: true });
  watchResolution();
  sync();

  return () => {
    disposed = true;
    stop();
    intersection?.disconnect();
    observer?.disconnect();
    root.removeEventListener('pointermove', move);
    root.removeEventListener('pointerdown', press);
    root.removeEventListener('pointerleave', clearPointer);
    root.removeEventListener('pointercancel', clearPointer);
    document.removeEventListener('visibilitychange', sync);
    reducedMotion.removeEventListener('change', sync);
    finePointer.removeEventListener('change', clearPointer);
    resolution?.removeEventListener('change', watchResolution);
    window.removeEventListener('resize', resize);
    delete root.dataset.wordmarkReady;
  };
}
