/** Load animated app captures only while their card or dialog is visible. */
export function initFeaturePreviews(root: HTMLElement) {
  const scenes = Array.from(root.querySelectorAll<HTMLElement>('[data-feature-preview]'));
  if (!scenes.length) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const visible = new Set<HTMLElement>();
  let suspended = false;
  let scheduled = 0;

  function sync() {
    if (scheduled) cancelAnimationFrame(scheduled);
    scheduled = 0;
    const modal = document.querySelector<HTMLDialogElement>('dialog[open]');
    const allowed = !suspended && !reducedMotion.matches && !document.hidden;
    for (const scene of scenes) {
      const available = visible.has(scene) && (!modal || modal.contains(scene))
        && !scene.closest('[hidden], [inert], dialog[data-state="closing"]');
      const running = allowed && available;
      scene.toggleAttribute('data-preview-running', running);
      const gif = scene.querySelector<HTMLImageElement>('[data-feature-gif]');
      if (gif) {
        if (running) {
          const source = gif.dataset.featureGifSrc;
          if (source && !gif.hasAttribute('src')) gif.src = source;
        } else {
          gif.removeAttribute('src');
          scene.removeAttribute('data-preview-ready');
        }
      }
    }
  }

  function schedule() {
    if (!scheduled) scheduled = requestAnimationFrame(sync);
  }

  scenes.forEach((scene) => {
    const gif = scene.querySelector<HTMLImageElement>('[data-feature-gif]');
    gif?.addEventListener('load', () => scene.setAttribute('data-preview-ready', ''));
    gif?.addEventListener('error', () => scene.removeAttribute('data-preview-ready'));
  });

  // Without observer support the local poster stays useful and avoids GIF playback.
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
