const initializedGalleries = new WeakSet<HTMLElement>();

type SavedProperty = { element: HTMLElement; name: string; value: string; priority: string };

/** Enhance the cards only when a complete, native modal gallery is available. */
export function initFeatureGallery(root: HTMLElement) {
  if (initializedGalleries.has(root) || typeof HTMLDialogElement === 'undefined') return;
  const dialog = root.querySelector<HTMLDialogElement>('#feature-dialog');
  const panel = dialog?.querySelector<HTMLElement>('[data-feature-panel]');
  const navigation = dialog?.querySelector<HTMLElement>('[data-feature-navigation]');
  const closeButton = dialog?.querySelector<HTMLButtonElement>('[data-feature-close]');
  const slides = Array.from(dialog?.querySelectorAll<HTMLElement>('[data-feature-slide]') ?? []);
  const triggers = Array.from(root.querySelectorAll<HTMLAnchorElement>('[data-feature-open]'));
  if (!dialog || typeof dialog.showModal !== 'function' || !panel || !navigation || !closeButton || !slides.length || !triggers.length) return;
  if (slides.some((slide, index) => !slide.querySelector(`#feature-dialog-title-${index}`)
    || !slide.querySelector(`#feature-dialog-description-${index}`))) return;

  const previousButton = dialog.querySelector<HTMLButtonElement>('[data-feature-prev]');
  const nextButton = dialog.querySelector<HTMLButtonElement>('[data-feature-next]');
  const announcement = dialog.querySelector<HTMLElement>('[data-feature-announcement]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const navigationEasing = getComputedStyle(root).getPropertyValue('--ease-out').trim() || 'cubic-bezier(0.23, 1, 0.32, 1)';
  const animations = new Set<Animation>();
  const motionLayers = new Set<HTMLElement>();
  let selected = 0;
  let requested = 0;
  let requestedDirection = 1;
  let navigating = false;
  let generation = 0;
  let closing = false;
  let opener: HTMLElement | null = null;
  let savedStyles: SavedProperty[] | null = null;
  let scrollPosition = { x: 0, y: 0 };
  let backdropPointer = false;
  const pauseVideos = (scope: ParentNode) => scope.querySelectorAll<HTMLVideoElement>('video').forEach((video) => video.pause());

  function cancelAnimations() {
    generation++;
    for (const animation of animations) animation.cancel();
    animations.clear();
    for (const layer of motionLayers) layer.remove();
    motionLayers.clear();
    navigating = false;
  }

  async function animate(element: HTMLElement, frames: Keyframe[], duration: number, easing = 'cubic-bezier(.2,.7,.2,1)'): Promise<void> {
    if (typeof element.animate !== 'function') return;
    const animation = element.animate(frames, { duration, easing, fill: 'both' });
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

  function outgoingLayer(source: HTMLElement) {
    const layer = source.cloneNode(true) as HTMLElement;
    // Freeze the displayed native frame; cloned videos start at time zero.
    const originals = source.querySelectorAll<HTMLElement>('[data-feature-preview]');
    layer.querySelectorAll<HTMLElement>('[data-feature-preview]').forEach((preview, index) => {
      const video = originals[index]?.querySelector<HTMLVideoElement>('[data-feature-video]');
      const poster = preview.querySelector<HTMLImageElement>('[data-feature-poster]');
      if (video && poster && video.readyState >= 2) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const context = canvas.getContext('2d');
          if (context) {
            context.drawImage(video, 0, 0);
            canvas.className = poster.className;
            for (const attribute of Array.from(poster.attributes)) {
              if (attribute.name.startsWith('data-astro-')) canvas.setAttribute(attribute.name, attribute.value);
            }
            poster.replaceWith(canvas);
          }
        } catch { /* The first-frame poster also works if drawing is unavailable. */ }
      }
      preview.querySelectorAll('[data-feature-video]').forEach((video) => video.remove());
      preview.removeAttribute('data-video-ready');
      preview.removeAttribute('data-preview-running');
    });
    for (const element of [layer, ...layer.querySelectorAll<HTMLElement>('*')]) {
      for (const attribute of Array.from(element.attributes)) {
        if (['id', 'tabindex', 'aria-labelledby', 'aria-describedby', 'role'].includes(attribute.name)
          || attribute.name.startsWith('data-feature-')) element.removeAttribute(attribute.name);
      }
    }
    layer.removeAttribute('hidden');
    layer.inert = true;
    layer.setAttribute('aria-hidden', 'true');
    layer.dataset.featureMotionLayer = 'slide';
    Object.assign(layer.style, {
      pointerEvents: 'none', zIndex: '2',
    });
    motionLayers.add(layer);
    return layer;
  }

  async function animateLayer(layer: HTMLElement, frames: Keyframe[], duration: number) {
    await animate(layer, frames, duration, navigationEasing);
    layer.remove();
    motionLayers.delete(layer);
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
    pauseVideos(dialog!);
    cancelAnimations();
    requested = selected;
    closing = false;
    backdropPointer = false;
    delete dialog!.dataset.state;
    if (announcement) announcement.textContent = '';
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
    slides.forEach((slide, slideIndex) => {
      slide.hidden = slideIndex !== selected;
      if (slide.hidden) pauseVideos(slide);
    });
    const copy = slides[selected]?.querySelector<HTMLElement>('[data-feature-copy]');
    if (copy) copy.scrollTop = 0;
    dialog!.setAttribute('aria-labelledby', `feature-dialog-title-${selected}`);
    dialog!.setAttribute('aria-describedby', `feature-dialog-description-${selected}`);
    if (dialog!.open && announcement) announcement.textContent = slides[selected]?.querySelector('h3')?.textContent ?? '';
  }

  function restoreSlideFocus(focused: Element | null, focusInSlide: boolean) {
    if (focused instanceof HTMLElement && navigation!.contains(focused)) {
      focused.focus({ preventScroll: true });
    } else if (focusInSlide) {
      slides[selected]?.querySelector<HTMLElement>('[data-feature-copy]')?.focus({ preventScroll: true });
    }
  }

  function startNavigation() {
    if (requested === selected || !dialog!.open || closing) return;
    const direction = requestedDirection;
    const outgoing = slides[selected]!;
    const previousCopy = outgoing.querySelector<HTMLElement>('[data-feature-copy]');
    const previousScroll = previousCopy?.scrollTop ?? 0;
    const focused = document.activeElement;
    const focusInSlide = outgoing.contains(focused);
    cancelAnimations();
    // Freeze the outgoing content while the edge controls stay in place.
    const layer = reducedMotion.matches ? null : outgoingLayer(outgoing);
    select(requested);
    const version = generation;
    const incoming = slides[selected]!;
    restoreSlideFocus(focused, focusInSlide);
    navigating = true;
    dialog!.dataset.state = 'navigating';
    const transitions: Promise<void>[] = [];

    if (reducedMotion.matches) {
      transitions.push(animate(incoming, [{ opacity: 0.65 }, { opacity: 1 }], 80, navigationEasing));
    } else if (layer) {
      incoming.parentElement!.append(layer);
      const outgoingCopy = layer.querySelector<HTMLElement>('.feature-modal-copy');
      if (outgoingCopy) outgoingCopy.scrollTop = previousScroll;
      transitions.push(animateLayer(layer, [
        { transform: 'translateX(0)' }, { transform: `translateX(${-direction * 100}%)` },
      ], 280));
      transitions.push(animate(incoming, [
        { transform: `translateX(${direction * 100}%)` }, { transform: 'translateX(0)' },
      ], 280, navigationEasing));
    }
    void Promise.all(transitions).then(() => {
      if (generation !== version || !dialog!.open || closing) return;
      navigating = false;
      dialog!.dataset.state = 'open';
      // Complete the current movement, then head straight to the latest intent.
      // Repeated input never restarts a slide or builds an animation backlog.
      startNavigation();
    });
  }

  function navigate(index: number, direction = Math.sign(index - requested)) {
    if (!dialog!.open || closing) return;
    requested = (index + slides.length) % slides.length;
    requestedDirection = direction < 0 ? -1 : 1;
    if (!navigating) startNavigation();
  }

  function settleMotion() {
    const focused = document.activeElement;
    const focusInSlide = slides[selected]?.contains(focused) ?? false;
    cancelAnimations();
    if (closing) finishClose(generation);
    else if (dialog!.open) {
      if (selected !== requested) select(requested);
      restoreSlideFocus(focused, focusInSlide);
      dialog!.dataset.state = 'open';
    }
  }

  function finishClose(version: number) {
    if (version !== generation || !closing) return;
    if (dialog!.open) dialog!.close();
    cleanup();
  }

  function hasGeometry(bounds: DOMRect) {
    return [bounds.left, bounds.top, bounds.width, bounds.height].every(Number.isFinite)
      && bounds.width > 0 && bounds.height > 0;
  }

  function surfaceTransform(bounds: DOMRect, target: DOMRect) {
    return `translate(${bounds.left - target.left}px, ${bounds.top - target.top}px) scale(${bounds.width / target.width}, ${bounds.height / target.height})`;
  }

  function visibleOpenerBounds() {
    if (!opener?.isConnected || !opener.getClientRects().length) return null;
    const bounds = opener.getBoundingClientRect();
    const style = getComputedStyle(opener);
    return hasGeometry(bounds) && bounds.bottom > 0 && bounds.top < innerHeight
      && bounds.right > 0 && bounds.left < innerWidth
      && style.visibility === 'visible' && Number(style.opacity) > 0 ? bounds : null;
  }

  function requestClose() {
    if (!dialog!.open || closing) return;
    pauseVideos(dialog!);
    // Read the animated surface before cancellation, including an interrupted entry.
    const current = dialog!.getBoundingClientRect();
    const opacity = getComputedStyle(dialog!).opacity;
    const origin = visibleOpenerBounds();
    cancelAnimations();
    closing = true;
    dialog!.dataset.state = 'closing';
    const version = generation;
    const target = dialog!.getBoundingClientRect();
    let frames: Keyframe[] = [{ opacity }, { opacity: 0 }];
    const geometric = !reducedMotion.matches && hasGeometry(current) && hasGeometry(target);
    if (geometric) {
      const transform = surfaceTransform(current, target);
      frames = [
        { opacity, transformOrigin: '0 0', transform },
        { opacity: 0, transformOrigin: '0 0', transform: origin ? surfaceTransform(origin, target) : transform },
      ];
    }
    const duration = reducedMotion.matches ? 80 : geometric && origin ? 200 : 120;
    void animate(dialog!, frames, duration, navigationEasing).then(() => finishClose(version));
  }

  function open(trigger: HTMLAnchorElement, index: number) {
    const origin = trigger.getBoundingClientRect();
    cancelAnimations();
    select(index);
    requested = selected;
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
    document.querySelectorAll<HTMLVideoElement>('video').forEach((video) => {
      if (!dialog!.contains(video)) video.pause();
    });
    root.dataset.featureReady = 'true';
    closing = false;
    dialog!.dataset.state = 'opening';
    dialog!.scrollTop = 0;
    closeButton!.focus({ preventScroll: true });
    const version = generation;
    const target = dialog!.getBoundingClientRect();
    let frames: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];
    if (!reducedMotion.matches && hasGeometry(origin) && hasGeometry(target)) {
      frames = [
        { opacity: 0.35, transformOrigin: '0 0', transform: surfaceTransform(origin, target) },
        { opacity: 1, transformOrigin: '0 0', transform: 'translate(0, 0) scale(1, 1)' },
      ];
    }
    void animate(dialog!, frames, reducedMotion.matches ? 80 : 280, navigationEasing).then(() => {
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
  previousButton?.addEventListener('click', () => navigate(requested - 1, -1));
  nextButton?.addEventListener('click', () => navigate(requested + 1, 1));
  if (previousButton) previousButton.disabled = slides.length < 2;
  if (nextButton) nextButton.disabled = slides.length < 2;
  navigation.hidden = slides.length < 2;

  dialog.addEventListener('keydown', (event) => {
    if (!dialog.open || closing || event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
    if (event.key === 'Tab') {
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, video[controls], audio[controls], [tabindex]'))
        .filter((element) => element.tabIndex >= 0 && !element.matches(':disabled')
          && !element.closest('[inert]')
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
    if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, select, textarea, video, audio, [contenteditable]:not([contenteditable="false"])'))) return;
    if ((event.key === 'Home' || event.key === 'End') && target instanceof HTMLElement && target.closest('[data-feature-copy]')) return;
    const index = event.key === 'ArrowLeft' ? requested - 1
      : event.key === 'ArrowRight' ? requested + 1
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
  reducedMotion.addEventListener('change', settleMotion);
  window.addEventListener('resize', () => {
    if (dialog.open && animations.size > 0) settleMotion();
  });

  select(0);
  initializedGalleries.add(root);
  root.dataset.featureReady = 'true';
}
