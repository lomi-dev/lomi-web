const initializedGalleries = new WeakSet<HTMLElement>();

type SavedProperty = { element: HTMLElement; name: string; value: string; priority: string };

/** Enhance the cards only when a complete, native modal gallery is available. */
export function initFeatureGallery(root: HTMLElement) {
  if (initializedGalleries.has(root) || typeof HTMLDialogElement === 'undefined') return;
  const dialog = root.querySelector<HTMLDialogElement>('#feature-dialog');
  const panel = dialog?.querySelector<HTMLElement>('[data-feature-panel]');
  const closeButton = dialog?.querySelector<HTMLButtonElement>('[data-feature-close]');
  const slides = Array.from(dialog?.querySelectorAll<HTMLElement>('[data-feature-slide]') ?? []);
  const triggers = Array.from(root.querySelectorAll<HTMLAnchorElement>('[data-feature-open]'));
  if (!dialog || typeof dialog.showModal !== 'function' || !panel || !closeButton || !slides.length || !triggers.length) return;
  if (slides.some((slide, index) => !slide.querySelector(`#feature-dialog-title-${index}`)
    || !slide.querySelector(`#feature-dialog-description-${index}`))) return;

  const previousButton = dialog.querySelector<HTMLButtonElement>('[data-feature-prev]');
  const nextButton = dialog.querySelector<HTMLButtonElement>('[data-feature-next]');
  const dots = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-feature-dot]'));
  const count = dialog.querySelector<HTMLElement>('[data-feature-count]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new Set<Animation>();
  let selected = 0;
  let generation = 0;
  let closing = false;
  let opener: HTMLElement | null = null;
  let savedStyles: SavedProperty[] | null = null;
  let scrollPosition = { x: 0, y: 0 };
  let backdropPointer = false;

  function cancelAnimations() {
    generation++;
    for (const animation of animations) animation.cancel();
    animations.clear();
  }

  async function animate(element: HTMLElement, frames: Keyframe[], duration: number): Promise<void> {
    if (typeof element.animate !== 'function') return;
    const animation = element.animate(frames, { duration, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' });
    animations.add(animation);
    try {
      await animation.finished;
      animation.cancel();
    } catch {
      // Superseded transitions must never act on a newer open/close cycle.
    } finally {
      animations.delete(animation);
    }
  }

  function saveAndSet(element: HTMLElement, name: string, value: string) {
    savedStyles?.push({ element, name, value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name) });
    element.style.setProperty(name, value);
  }

  function lockScroll() {
    if (savedStyles) return;
    scrollPosition = { x: window.scrollX, y: window.scrollY };
    savedStyles = [];
    const page = document.documentElement;
    const gap = Math.max(0, window.innerWidth - page.clientWidth);
    // A stable gutter already reserves this space when overflow is hidden.
    if (gap && !getComputedStyle(page).getPropertyValue('scrollbar-gutter').includes('stable')) {
      const padding = Number.parseFloat(getComputedStyle(document.body).paddingRight) || 0;
      saveAndSet(document.body, 'padding-right', `${padding + gap}px`);
    }
    saveAndSet(page, 'overflow', 'hidden');
    saveAndSet(document.body, 'overflow', 'hidden');
  }

  function restoreFocus() {
    if (opener?.isConnected) {
      opener.focus({ preventScroll: true });
      const bounds = opener.getBoundingClientRect();
      const headerHeight = document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0;
      if (bounds.bottom <= headerHeight || bounds.top >= innerHeight) {
        opener.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      }
    } else {
      const heading = root.querySelector<HTMLElement>('h2, h1, [data-feature-heading]');
      if (heading) {
        const previousTabIndex = heading.getAttribute('tabindex');
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
        if (previousTabIndex === null) heading.removeAttribute('tabindex');
        else heading.setAttribute('tabindex', previousTabIndex);
      }
    }
    opener = null;
  }

  function cleanup() {
    cancelAnimations();
    closing = false;
    backdropPointer = false;
    delete dialog!.dataset.state;
    if (!savedStyles) return;
    for (const { element, name, value, priority } of savedStyles.reverse()) {
      if (value) element.style.setProperty(name, value, priority);
      else element.style.removeProperty(name);
    }
    savedStyles = null;
    window.scrollTo({ left: scrollPosition.x, top: scrollPosition.y, behavior: 'instant' });
    restoreFocus();
  }

  function select(index: number) {
    selected = (index + slides.length) % slides.length;
    slides.forEach((slide, slideIndex) => { slide.hidden = slideIndex !== selected; });
    const copy = slides[selected]?.querySelector<HTMLElement>('[data-feature-copy]');
    if (copy) copy.scrollTop = 0;
    dialog!.setAttribute('aria-labelledby', `feature-dialog-title-${selected}`);
    dialog!.setAttribute('aria-describedby', `feature-dialog-description-${selected}`);
    dots.forEach((dot) => {
      if (Number(dot.dataset.featureDot) === selected) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
    if (count) count.textContent = `${String(selected + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;
  }

  function navigate(index: number) {
    if (!dialog!.open || closing) return;
    const focusInSlide = slides[selected]?.contains(document.activeElement);
    cancelAnimations();
    select(index);
    if (focusInSlide) slides[selected]?.querySelector<HTMLElement>('[data-feature-copy]')?.focus({ preventScroll: true });
    const media = slides[selected]?.querySelector<HTMLElement>('[data-feature-modal-media]');
    if (media) void animate(media, [{ opacity: 0.65 }, { opacity: 1 }], reducedMotion.matches ? 80 : 120);
  }

  function finishClose(version: number) {
    if (version !== generation || !closing) return;
    if (dialog!.open) dialog!.close();
    cleanup();
  }

  function requestClose() {
    if (!dialog!.open || closing) return;
    const opacity = getComputedStyle(panel!).opacity;
    cancelAnimations();
    closing = true;
    dialog!.dataset.state = 'closing';
    const version = generation;
    const frames = reducedMotion.matches
      ? [{ opacity }, { opacity: 0 }]
      : [{ opacity, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.98)' }];
    void animate(panel!, frames, reducedMotion.matches ? 80 : 150).then(() => finishClose(version));
  }

  function open(trigger: HTMLAnchorElement, index: number) {
    const thumbnail = trigger.querySelector<HTMLElement>('[data-feature-card-media]');
    const origin = thumbnail?.getBoundingClientRect();
    cancelAnimations();
    select(index);
    opener = trigger;
    lockScroll();
    try {
      dialog!.showModal();
    } catch {
      cleanup();
      // Preserve the card's ordinary description link if native opening fails.
      delete root.dataset.featureReady;
      return false;
    }
    root.dataset.featureReady = 'true';
    closing = false;
    dialog!.dataset.state = 'opening';
    dialog!.scrollTop = 0;
    closeButton!.focus({ preventScroll: true });
    const version = generation;
    const transitions: Promise<void>[] = [animate(panel!, [{ opacity: 0 }, { opacity: 1 }], reducedMotion.matches ? 80 : 220)];
    const slide = slides[selected]!;
    const media = slide.querySelector<HTMLElement>('[data-feature-modal-media]');
    if (media && origin && origin.width > 0 && origin.height > 0 && !reducedMotion.matches) {
      const target = media.getBoundingClientRect();
      if (target.width > 0 && target.height > 0) {
        transitions.push(animate(media, [
          { transformOrigin: '0 0', transform: `translate(${origin.left - target.left}px, ${origin.top - target.top}px) scale(${origin.width / target.width}, ${origin.height / target.height})` },
          { transformOrigin: '0 0', transform: 'translate(0, 0) scale(1, 1)' },
        ], 280));
      }
    }
    const copy = slide.querySelector<HTMLElement>('[data-feature-copy]');
    if (copy && !reducedMotion.matches) transitions.push(animate(copy, [
      { opacity: 0, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], 200));
    void Promise.all(transitions).then(() => {
      if (generation === version && dialog!.open && !closing) dialog!.dataset.state = 'open';
    });
    return true;
  }

  triggers.forEach((trigger) => {
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-controls', dialog.id);
    trigger.addEventListener('click', (event) => {
      if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const index = Number(trigger.dataset.featureOpen);
      if (!Number.isInteger(index) || index < 0 || index >= slides.length) return;
      if (document.querySelector('dialog[open]')) {
        event.preventDefault();
        return;
      }
      if (open(trigger, index)) event.preventDefault();
    });
  });

  closeButton.addEventListener('click', requestClose);
  previousButton?.addEventListener('click', () => navigate(selected - 1));
  nextButton?.addEventListener('click', () => navigate(selected + 1));
  if (previousButton) previousButton.disabled = slides.length < 2;
  if (nextButton) nextButton.disabled = slides.length < 2;
  dots.forEach((dot) => dot.addEventListener('click', () => {
    const index = Number(dot.dataset.featureDot);
    if (Number.isInteger(index) && index >= 0 && index < slides.length) navigate(index);
  }));

  dialog.addEventListener('keydown', (event) => {
    if (!dialog.open || closing || event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
    if (event.key === 'Tab') {
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]'))
        .filter((element) => element.tabIndex >= 0 && !element.matches(':disabled')
          && element.getClientRects().length > 0 && getComputedStyle(element).visibility === 'visible');
      const first = controls[0];
      const last = controls.at(-1);
      // Native dialogs may briefly send focus to browser chrome at either edge.
      if (first && last && (document.activeElement === dialog
        || (event.shiftKey ? document.activeElement === first : document.activeElement === last))) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      }
      return;
    }
    if (event.shiftKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"])'))) return;
    if ((event.key === 'Home' || event.key === 'End') && target instanceof HTMLElement && target.closest('[data-feature-copy]')) return;
    const index = event.key === 'ArrowLeft' ? selected - 1
      : event.key === 'ArrowRight' ? selected + 1
        : event.key === 'Home' ? 0 : event.key === 'End' ? slides.length - 1 : null;
    if (index === null) return;
    event.preventDefault();
    navigate(index);
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    requestClose();
  });
  dialog.addEventListener('close', () => {
    // A queued close event from an earlier cycle must not unlock a reopened modal.
    if (!dialog.open) cleanup();
  });
  const outsidePanel = (event: MouseEvent) => {
    if (event.target !== dialog) return false;
    const bounds = panel.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  };
  dialog.addEventListener('pointerdown', (event) => {
    backdropPointer = event.button === 0 && outsidePanel(event);
  });
  dialog.addEventListener('pointercancel', () => { backdropPointer = false; });
  dialog.addEventListener('click', (event) => {
    const dismiss = backdropPointer && outsidePanel(event);
    backdropPointer = false;
    if (dismiss) requestClose();
  });
  reducedMotion.addEventListener('change', () => {
    cancelAnimations();
    if (closing) finishClose(generation);
    else if (dialog.open) dialog.dataset.state = 'open';
  });

  select(0);
  initializedGalleries.add(root);
  root.dataset.featureReady = 'true';
}
