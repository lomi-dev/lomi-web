/** Homepage-only elastic top edge. One canvas, fixed overscan, transforms only. */
const MAX_PULL = 72;
const RESISTANCE = 180;
// Raw stretch uses a mass-1, critically damped spring (k=196, c=28).
const SPRING_FREQUENCY = 14;
const WHEEL_IMPULSE = 12;
const INTERACTIVE = 'a, button, summary, input, select, textarea, label, video, audio, iframe, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="slider"], [tabindex]:not([tabindex="-1"])';

let dispose: (() => void) | undefined;

export function initHeroPull(): () => void {
  dispose?.();
  const viewport = document.querySelector<HTMLElement>('.home-pull-viewport');
  const content = viewport?.querySelector<HTMLElement>('.home-pull-content');
  const hero = content?.querySelector<HTMLElement>('.hero');
  const main = content?.querySelector('main');
  const header = document.querySelector<HTMLElement>('.site-header');
  if (!viewport || !content || !hero || !main || !header) return () => {};

  const moved = [content, header];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const listeners = new AbortController();
  let position = 0;
  let stretch = 0;
  let velocity = 0;
  let frame = 0;
  let lastFrame = 0;
  let wheelOwned = false;
  let controlPointer: number | undefined;
  let controlTimer: ReturnType<typeof setTimeout> | undefined;
  let touch: { id: number; x: number; y: number; base: number; owned: boolean } | undefined;

  const state = (value: 'idle' | 'pulling' | 'settling') => {
    if (hero.dataset.heroPullState !== value) hero.dataset.heroPullState = value;
  };
  const cancelMotion = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };
  const reset = () => {
    cancelMotion();
    touch = undefined;
    wheelOwned = false;
    controlPointer = undefined;
    clearTimeout(controlTimer);
    controlTimer = undefined;
    position = stretch = velocity = 0;
    for (const element of moved) {
      element.style.removeProperty('transform');
      element.style.removeProperty('will-change');
    }
    delete hero.dataset.heroPullActive;
    state('idle');
  };
  const paint = () => {
    hero.dataset.heroPullActive = '';
    for (const element of moved) {
      element.style.willChange = 'transform';
      element.style.transform = `translate3d(0, ${position}px, 0)`;
    }
  };
  const blocked = () => !!document.fullscreenElement || !!document.querySelector('dialog[open], [aria-modal="true"], .site-header details[open]');
  const atTop = () => {
    if (reduced.matches || document.hidden || scrollY > 1 || blocked()) return false;
    // CMS can disable or reorder the hero; only a first visible hero owns this edge.
    const first = Array.from(main.children).find((element) => element.getBoundingClientRect().height > 0);
    return first === hero && Math.abs(hero.getBoundingClientRect().top - position) <= 1;
  };
  const eligibleTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element) || target.closest(INTERACTIVE)) return false;
    // A nested scroller keeps its own gestures even when it is at its top edge.
    for (let element: Element | null = target; element && element !== document.body; element = element.parentElement) {
      const style = getComputedStyle(element);
      if (/(auto|scroll|overlay)/.test(style.overflowY + style.overflowX)
        && (element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1)) return false;
    }
    return viewport.contains(target) || header.contains(target) || target === document.documentElement || target === document.body;
  };
  const rubber = (amount: number) => MAX_PULL * (1 - Math.exp(-amount / RESISTANCE));
  const currentRaw = () => -RESISTANCE * Math.log(Math.max(0.000001, 1 - position / MAX_PULL));
  const animate = () => {
    if (frame) return;
    lastFrame = performance.now();
    const step = (time: number) => {
      frame = 0;
      if (!atTop()) { reset(); return; }
      // Exact critical damping stays stable and keeps real elapsed time after
      // a stalled frame. Wheel packets add momentum while this return runs.
      const dt = Math.max(0, (time - lastFrame) / 1000);
      lastFrame = time;
      const decay = Math.exp(-SPRING_FREQUENCY * dt);
      const coefficient = velocity + SPRING_FREQUENCY * stretch;
      stretch = (stretch + coefficient * dt) * decay;
      velocity = (velocity - SPRING_FREQUENCY * coefficient * dt) * decay;
      position = rubber(stretch);
      const visualVelocity = velocity * (MAX_PULL - position) / RESISTANCE;
      if (position < 0.05 && Math.abs(visualVelocity) < 0.5) { reset(); return; }
      state(velocity > 0 ? 'pulling' : 'settling');
      paint();
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };
  const release = () => {
    cancelMotion();
    if (!position || !atTop()) { reset(); return; }
    state('settling');
    animate();
  };
  const pull = (amount: number) => {
    cancelMotion();
    stretch = Math.max(0, amount);
    velocity = 0;
    position = rubber(stretch);
    if (!position) { reset(); return; }
    state('pulling');
    paint();
  };
  const own = (event: Event) => {
    if (!event.cancelable || event.defaultPrevented) return false;
    event.preventDefault();
    return event.defaultPrevented;
  };
  const wheel = (event: WheelEvent) => {
    if (controlPointer !== undefined) {
      // Trackpad momentum must not scroll the pressed control out from under
      // the pointer. Keep browser zoom gestures available during activation.
      if (!event.ctrlKey && !event.metaKey) own(event);
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)
      || !atTop() || (!wheelOwned && !eligibleTarget(event.target))) { if (position) reset(); return; }
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
    const delta = event.deltaY * unit;
    if (delta > 0) {
      if (!position) { reset(); return; }
      if (!own(event)) { reset(); return; }
      // Spend only the visible stretch before handing the remaining distance
      // back to document scrolling. A small reversal must not erase the pull.
      const remaining = delta - position;
      if (remaining >= 0) {
        reset();
        if (remaining) window.scrollBy({ top: remaining, behavior: 'instant' });
        return;
      }
      position -= delta;
      stretch = currentRaw();
      // Cancel outward momentum and keep the return on the non-crossing side
      // of the critically damped solution after a direct position change.
      velocity = Math.max(-SPRING_FREQUENCY * stretch, Math.min(0, velocity));
      state('settling');
      paint();
      animate();
      return;
    }
    if (!own(event)) { if (position) reset(); return; }
    // Moving the header can put a control under a stationary pointer. Keep the
    // accepted gesture through its return spring; controls only exclude a
    // gesture at its start. Sparse trackpad momentum can interrupt the return.
    wheelOwned = true;
    velocity -= delta * WHEEL_IMPULSE;
    state('pulling');
    animate();
  };
  const touchStart = (event: TouchEvent) => {
    if (controlPointer !== undefined && event.touches.length === 1) return;
    wheelOwned = false;
    if (event.touches.length !== 1 || !atTop() || !eligibleTarget(event.target)) { reset(); return; }
    const point = event.touches[0];
    // A finger can catch the return spring at its current position.
    cancelMotion();
    velocity = 0;
    touch = { id: point.identifier, x: point.clientX, y: point.clientY, base: currentRaw(), owned: false };
  };
  const touchMove = (event: TouchEvent) => {
    if (!touch) return;
    const point = event.touches[0];
    if (event.touches.length !== 1 || point.identifier !== touch.id || !atTop()) { reset(); return; }
    const dx = point.clientX - touch.x;
    const dy = point.clientY - touch.y;
    if (!touch.owned && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    if (Math.abs(dx) > Math.abs(dy) || touch.base + dy <= 0) { reset(); return; }
    if (!own(event)) { reset(); return; }
    touch.owned = true;
    pull(touch.base + dy);
  };
  const touchEnd = () => { if (touch) { touch = undefined; release(); } };
  const onScroll = () => { if (scrollY > 1 && (position || touch)) reset(); };
  const onPointerDown = (event: PointerEvent) => {
    if (!(event.target instanceof Element) || !event.target.closest(INTERACTIVE)) return;
    if (!position || controlPointer !== undefined) { reset(); return; }
    // Keep a displaced control under the pointer until the browser establishes
    // its click target. Focus and touchstart can follow pointerdown before click.
    cancelMotion();
    velocity = 0;
    clearTimeout(controlTimer);
    wheelOwned = false;
    touch = undefined;
    controlPointer = event.pointerId;
  };
  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerId !== controlPointer) return;
    // Click normally follows pointerup in the same task. Touch browsers may
    // delay it; canceled or non-click activations still return to rest.
    controlTimer = setTimeout(reset, event.pointerType === 'touch' ? 400 : 0);
  };
  const onPointerCancel = (event: PointerEvent) => {
    if (event.pointerId === controlPointer) reset();
  };
  const onFocus = (event: FocusEvent) => {
    if (controlPointer === undefined && event.target instanceof Element && event.target.closest(INTERACTIVE)) reset();
  };
  const onClick = (event: MouseEvent) => {
    if (controlPointer !== undefined || (event.target instanceof Element && event.target.closest(INTERACTIVE))) reset();
  };
  const onVisibility = () => { if (document.hidden) reset(); };
  const onMotion = () => { reset(); };

  hero.dataset.heroPullReady = '';
  state('idle');
  window.addEventListener('wheel', wheel, { passive: false, signal: listeners.signal });
  window.addEventListener('touchstart', touchStart, { passive: true, signal: listeners.signal });
  window.addEventListener('touchmove', touchMove, { passive: false, signal: listeners.signal });
  window.addEventListener('touchend', touchEnd, { passive: true, signal: listeners.signal });
  window.addEventListener('touchcancel', reset, { passive: true, signal: listeners.signal });
  window.addEventListener('scroll', onScroll, { passive: true, signal: listeners.signal });
  window.addEventListener('resize', reset, { signal: listeners.signal });
  window.addEventListener('pagehide', reset, { signal: listeners.signal });
  window.addEventListener('hashchange', reset, { signal: listeners.signal });
  window.addEventListener('popstate', reset, { signal: listeners.signal });
  document.addEventListener('visibilitychange', onVisibility, { signal: listeners.signal });
  document.addEventListener('pointerdown', onPointerDown, { capture: true, signal: listeners.signal });
  window.addEventListener('pointerup', onPointerUp, { capture: true, signal: listeners.signal });
  window.addEventListener('pointercancel', onPointerCancel, { capture: true, signal: listeners.signal });
  document.addEventListener('dragend', reset, { capture: true, signal: listeners.signal });
  window.addEventListener('blur', reset, { signal: listeners.signal });
  document.addEventListener('focusin', onFocus, { signal: listeners.signal });
  document.addEventListener('click', onClick, { capture: true, signal: listeners.signal });
  document.addEventListener('fullscreenchange', reset, { signal: listeners.signal });
  reduced.addEventListener('change', onMotion, { signal: listeners.signal });
  const observer = new MutationObserver(() => { if (blocked()) reset(); });
  observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open', 'aria-modal'] });

  const cleanup = () => {
    reset();
    listeners.abort();
    observer.disconnect();
    delete hero.dataset.heroPullReady;
    delete hero.dataset.heroPullState;
    if (dispose === cleanup) dispose = undefined;
  };
  document.addEventListener('astro:before-swap', cleanup, { once: true, signal: listeners.signal });
  dispose = cleanup;
  return cleanup;
}
