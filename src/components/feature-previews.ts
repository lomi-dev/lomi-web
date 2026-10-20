/** Run explanatory previews only while their actual card or dialog is visible. */
export function initFeaturePreviews(root: HTMLElement) {
  const scenes = Array.from(root.querySelectorAll<HTMLElement>('[data-feature-simulation]'));
  if (!scenes.length) return;
  const toggles = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-preview-toggle]'));
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const visible = new Set<HTMLElement>();
  let paused = false;
  let suspended = false;
  let scheduled = 0;

  function sync() {
    if (scheduled) cancelAnimationFrame(scheduled);
    scheduled = 0;
    const modal = document.querySelector<HTMLDialogElement>('dialog[open]');
    const allowed = !paused && !suspended && !reducedMotion.matches && !document.hidden;
    for (const scene of scenes) {
      const available = visible.has(scene) && (!modal || modal.contains(scene))
        && !scene.closest('[hidden], [inert], dialog[data-state="closing"]');
      scene.toggleAttribute('data-preview-running', allowed && available);
    }
    root.dataset.previewPaused = String(paused);
    for (const toggle of toggles) {
      const ownDialog = toggle.closest('dialog');
      const uploadedMedia = ownDialog && !ownDialog.querySelector('[data-feature-slide]:not([hidden]) [data-feature-simulation]');
      const hideToggle = reducedMotion.matches || Boolean(uploadedMedia);
      if (toggle.hidden !== hideToggle) toggle.hidden = hideToggle;
      const label = paused ? toggle.dataset.resumeLabel : toggle.dataset.pauseLabel;
      toggle.setAttribute('aria-label', label ?? '');
      toggle.title = label ?? '';
      const text = toggle.querySelector<HTMLElement>('[data-preview-label]');
      if (text) text.textContent = label ?? '';
      const pauseIcon = toggle.querySelector<HTMLElement>('[data-preview-pause-icon]');
      const playIcon = toggle.querySelector<HTMLElement>('[data-preview-play-icon]');
      if (pauseIcon && pauseIcon.hidden !== paused) pauseIcon.hidden = paused;
      if (playIcon && playIcon.hidden === paused) playIcon.hidden = !paused;
    }
  }

  function schedule() {
    if (!scheduled) scheduled = requestAnimationFrame(sync);
  }

  toggles.forEach((toggle) => toggle.addEventListener('click', () => {
    paused = !paused;
    sync();
  }));

  // No observer support means a useful static illustration, with no busy loop.
  if (typeof IntersectionObserver === 'undefined') return;
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const scene = entry.target as HTMLElement;
      if (entry.isIntersecting && entry.intersectionRatio >= .1) visible.add(scene);
      else visible.delete(scene);
    }
    schedule();
  }, { threshold: [0, .1] });
  scenes.forEach((scene) => observer.observe(scene));

  // Dialog visibility and selected slides change independently of page scrolling.
  // Observe only these attributes, never our own running flags or animated styles.
  const changes = new MutationObserver(schedule);
  changes.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open', 'hidden', 'inert', 'data-state'] });
  document.addEventListener('visibilitychange', sync);
  reducedMotion.addEventListener('change', sync);
  window.addEventListener('pagehide', () => {
    suspended = true;
    if (scheduled) cancelAnimationFrame(scheduled);
    sync();
  });
  window.addEventListener('pageshow', () => { suspended = false; schedule(); });
  sync();
}
