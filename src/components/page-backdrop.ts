/** Match the solid root canvas to the surface exposed by native overscroll. */
export function initPageBackdrop(): () => void {
  const root = document.documentElement;
  const surfaces = Array.from(document.querySelectorAll<HTMLElement>('[data-scroll-surface]'));
  const probe = document.createElement('span');
  probe.hidden = true;
  probe.style.display = 'none';
  probe.style.color = 'var(--scroll-surface-color, var(--color-chalk, #ecefe5))';

  let observer: IntersectionObserver | undefined;
  let frame = 0;
  let disposed = false;
  let selected: HTMLElement | undefined;
  let color = '';
  let refreshColor = true;

  function surfaceAt(viewportY: number): HTMLElement {
    // Read the marked page regions directly: top-layer dialogs and menus must
    // not hide the underlying surface from selection.
    const x = Math.max(0, Math.min(innerWidth / 2, root.clientWidth - 1));
    const y = Math.max(0, Math.min(viewportY, root.clientHeight - 1));
    let selectedSurface = document.body;
    for (const surface of surfaces) {
      const bounds = surface.getBoundingClientRect();
      if (bounds.left <= x && bounds.right > x && bounds.top <= y && bounds.bottom > y) {
        // Query order puts descendants after their fallback parent; later
        // matching regions therefore win without scanning the rest of the DOM.
        selectedSurface = surface;
      }
    }
    return selectedSurface;
  }

  function update() {
    frame = 0;
    if (disposed) return;
    const scrolling = document.scrollingElement ?? root;
    const maximum = Math.max(0, scrolling.scrollHeight - scrolling.clientHeight);
    const position = scrolling.scrollTop;
    // Sample the physical edge during overscroll. The first nested region
    // (such as a dark hero player) may be far below the page's top surface.
    const y = position <= 1
      ? 0
      : maximum > 0 && position >= maximum - 1
        ? root.clientHeight - 1
        : innerHeight / 2;
    const surface = surfaceAt(y);
    if (surface === selected && !refreshColor) return;
    selected = surface;
    refreshColor = false;

    // Resolve inherited and nested CSS variables in the selected surface's own
    // context. A computed custom property alone can still contain var() tokens.
    surface.append(probe);
    const nextColor = getComputedStyle(probe).color;
    probe.remove();
    if (nextColor !== color) {
      color = nextColor;
      root.style.setProperty('--page-canvas-background', color);
    }
  }

  function schedule() {
    if (!disposed && !frame) frame = requestAnimationFrame(update);
  }

  function refresh() {
    refreshColor = true;
    schedule();
  }

  function observeMidpoint() {
    observer?.disconnect();
    if ('IntersectionObserver' in window) {
      const height = root.clientHeight;
      const top = Math.max(0, Math.floor(height / 2) - 1);
      const bottom = Math.max(0, height - top - 2);
      observer = new IntersectionObserver(schedule, {
        rootMargin: `-${top}px 0px -${bottom}px 0px`,
        threshold: 0,
      });
      surfaces.forEach((surface) => observer!.observe(surface));
    }
    refresh();
  }

  const onVisibility = () => {
    if (document.visibilityState === 'visible') refresh();
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', observeMidpoint);
  window.addEventListener('pageshow', refresh);
  window.addEventListener('load', refresh);
  window.addEventListener('hashchange', refresh);
  window.addEventListener('popstate', refresh);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('lomi:media-surface-change', refresh);
  document.addEventListener('close', refresh, true);
  update();
  observeMidpoint();

  return () => {
    disposed = true;
    observer?.disconnect();
    if (frame) cancelAnimationFrame(frame);
    probe.remove();
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', observeMidpoint);
    window.removeEventListener('pageshow', refresh);
    window.removeEventListener('load', refresh);
    window.removeEventListener('hashchange', refresh);
    window.removeEventListener('popstate', refresh);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('lomi:media-surface-change', refresh);
    document.removeEventListener('close', refresh, true);
    root.style.removeProperty('--page-canvas-background');
  };
}
