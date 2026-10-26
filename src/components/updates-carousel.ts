const initializedCarousels = new WeakMap<HTMLElement, () => void>();

/** Add optional button controls while keeping the updates rail natively scrollable. */
export function initUpdatesCarousel(section: HTMLElement): () => void {
  const existingCleanup = initializedCarousels.get(section);
  if (existingCleanup) return existingCleanup;

  const railElement = section.querySelector<HTMLElement>('[data-updates-rail]');
  const controlsElement = section.querySelector<HTMLElement>('[data-updates-controls]');
  const previousButtonElement = section.querySelector<HTMLButtonElement>('[data-updates-previous]');
  const nextButtonElement = section.querySelector<HTMLButtonElement>('[data-updates-next]');
  if (!railElement || !controlsElement || !previousButtonElement || !nextButtonElement) return () => {};
  const rail = railElement;
  const controls = controlsElement;
  const previousButton = previousButtonElement;
  const nextButton = nextButtonElement;

  const originalControlsHidden = controls.hidden;
  const originalPreviousDisabled = previousButton.disabled;
  const originalNextDisabled = nextButton.disabled;
  const cards = Array.from(rail.querySelectorAll<HTMLElement>('[data-update-card]'));
  let active = true;
  let frame = 0;

  function update() {
    frame = 0;
    if (!active) return;

    const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
    const overflows = maxScroll > 0;
    const position = Math.min(maxScroll, Math.max(0, rail.scrollLeft));
    controls.hidden = !overflows;
    previousButton.disabled = !overflows || position <= 1;
    nextButton.disabled = !overflows || maxScroll - position <= 1;
  }

  function scheduleUpdate() {
    if (active && !frame) frame = requestAnimationFrame(update);
  }

  function scrollByCard(direction: -1 | 1) {
    const card = cards[0];
    if (!card) return;

    const railStyle = getComputedStyle(rail);
    const gapValue = railStyle.columnGap !== 'normal' ? railStyle.columnGap : railStyle.gap;
    const gap = Number.parseFloat(gapValue) || 0;
    const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
    const target = Math.min(maxScroll, Math.max(0, rail.scrollLeft + direction * (card.getBoundingClientRect().width + gap)));
    const behavior: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
    rail.scrollTo({ left: target, behavior });
    scheduleUpdate();
  }

  function scrollPrevious() { scrollByCard(-1); }
  function scrollNext() { scrollByCard(1); }

  function cleanup() {
    if (!active) return;
    active = false;
    if (frame) cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    rail.removeEventListener('scroll', scheduleUpdate);
    window.removeEventListener('resize', scheduleUpdate);
    previousButton.removeEventListener('click', scrollPrevious);
    nextButton.removeEventListener('click', scrollNext);
    controls.hidden = originalControlsHidden;
    previousButton.disabled = originalPreviousDisabled;
    nextButton.disabled = originalNextDisabled;
    initializedCarousels.delete(section);
  }

  const resizeObserver = typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver(scheduleUpdate);
  resizeObserver?.observe(rail);
  for (const card of cards) resizeObserver?.observe(card);
  rail.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate, { passive: true });
  previousButton.addEventListener('click', scrollPrevious);
  nextButton.addEventListener('click', scrollNext);
  initializedCarousels.set(section, cleanup);
  scheduleUpdate();
  void document.fonts.ready.then(scheduleUpdate);

  return cleanup;
}
