/** Decorative motion stays inside the backdrop; scrolling never drives it. */
export class HeroBackdrop extends HTMLElement {
  private dispose?: () => void;

  connectedCallback() {
    this.dispose?.();
    const hero = this.closest<HTMLElement>('.hero');
    const layer = this.querySelector<HTMLElement>('.hero-backdrop-parallax');
    if (!hero || !layer || !('IntersectionObserver' in window)) return;

    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
    const events = new AbortController();
    const { signal } = events;
    let visible = false;
    let suspended = false;
    let running = false;
    let frame = 0;
    let lastTime = 0;
    let x = 0;
    let y = 0;
    let targetX = 0;
    let targetY = 0;

    function stopPointer() {
      cancelAnimationFrame(frame);
      frame = lastTime = x = y = targetX = targetY = 0;
      layer!.style.removeProperty('transform');
    }

    function tick(time: number) {
      const elapsed = lastTime ? Math.min(time - lastTime, 64) : 16;
      lastTime = time;
      // Time-based damping keeps the same soft response on 60/120Hz displays.
      const ease = 1 - Math.exp(-elapsed / 240);
      x += (targetX - x) * ease;
      y += (targetY - y) * ease;
      const settled = Math.abs(targetX - x) + Math.abs(targetY - y) < .02;
      if (settled) { x = targetX; y = targetY; }
      layer!.style.transform = `translate3d(${x.toFixed(3)}px, ${y.toFixed(3)}px, 0)`;
      frame = settled ? 0 : requestAnimationFrame(tick);
      if (settled) lastTime = 0;
    }

    function schedule() {
      if (!frame) frame = requestAnimationFrame(tick);
    }

    const sync = () => {
      running = visible && !suspended && !document.hidden && !reducedMotion.matches;
      this.dataset.motion = running ? 'running' : 'paused';
      if (!running || !finePointer.matches) stopPointer();
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer.observe(this);

    hero.addEventListener('pointermove', (event) => {
      if (!running || !finePointer.matches || event.pointerType !== 'mouse') return;
      const bounds = hero.getBoundingClientRect();
      const horizontal = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
      const vertical = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
      // Compact layouts keep the glass farther away from the copy.
      targetX = horizontal * (bounds.width < 1400 ? 6 : 12);
      targetY = vertical * 8;
      schedule();
    }, { passive: true, signal });
    hero.addEventListener('pointerleave', () => {
      if (!running) return;
      targetX = targetY = 0;
      schedule();
    }, { passive: true, signal });
    document.addEventListener('visibilitychange', sync, { signal });
    reducedMotion.addEventListener('change', sync, { signal });
    finePointer.addEventListener('change', sync, { signal });
    window.addEventListener('pagehide', () => { suspended = true; sync(); }, { signal });
    window.addEventListener('pageshow', () => { suspended = false; sync(); }, { signal });
    sync();

    this.dispose = () => {
      events.abort();
      observer.disconnect();
      stopPointer();
      this.removeAttribute('data-motion');
    };
  }

  disconnectedCallback() {
    this.dispose?.();
    this.dispose = undefined;
  }
}
