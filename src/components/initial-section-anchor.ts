/** Keep an incoming section link aligned after the homepage enhances its layout. */
export function alignInitialSectionAnchor(): void {
  const hash = location.hash;
  if (!hash) return;
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  // A history traversal should retain the visitor's restored reading position.
  if (navigation?.type === 'back_forward') return;
  let target: HTMLElement | null;
  try { target = document.getElementById(decodeURIComponent(hash.slice(1))); }
  catch { return; }
  if (!target?.closest('main')) return;

  const controller = new AbortController();
  let interrupted = false;
  const cancel = () => { interrupted = true; controller.abort(); };
  for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
    window.addEventListener(event, cancel, { once: true, passive: true, capture: true, signal: controller.signal });
  }

  void (async () => {
    try {
      if (document.readyState === 'loading') {
        await new Promise<void>((resolve) => document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));
      }
      await document.fonts.ready;
      // Let font measurements and the roadmap's scheduled layout finish first.
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (!interrupted && location.hash === hash && target.isConnected) {
        target.scrollIntoView({ block: 'start', behavior: 'instant' });
      }
    } finally {
      controller.abort();
    }
  })();
}
