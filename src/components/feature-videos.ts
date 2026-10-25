import { featureCameraAt, readFeatureCamera } from './feature-video-motion';

const initialized = new WeakSet<HTMLElement>();

export function initFeatureVideos(root: HTMLElement) {
  if (initialized.has(root) || typeof IntersectionObserver === 'undefined') return;
  const scenes = Array.from(root.querySelectorAll<HTMLElement>('[data-feature-preview]')).flatMap((element) => {
    const video = element.querySelector<HTMLVideoElement>('[data-feature-video]');
    const camera = element.querySelector<HTMLElement>('[data-render-window]');
    return video && camera ? [{ element, video, camera, cue: readFeatureCamera(element.dataset.featureCamera), width: 0, height: 0, frame: 0, videoFrame: false, pending: false, failed: false }] : [];
  });
  if (!scenes.length) return;
  initialized.add(root);
  type Scene = typeof scenes[number];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const visible = new Set<HTMLElement>();
  const disposers: (() => void)[] = [];
  let enabled = !reduced.matches;
  let active = true;
  let scheduled = 0;

  function listen(target: EventTarget, type: string, handler: EventListener) {
    target.addEventListener(type, handler);
    disposers.push(() => target.removeEventListener(type, handler));
  }
  function paint(scene: Scene) {
    const view = reduced.matches ? { scale: 1, x: 0, y: 0 } : featureCameraAt(scene.video.currentTime, scene.cue);
    scene.camera.style.transform = `translate(-50%, -50%) translate(${view.x * scene.width}px, ${view.y * scene.height}px) scale(${view.scale})`;
  }
  function stopFrames(scene: Scene) {
    if (scene.frame) {
      if (scene.videoFrame) scene.video.cancelVideoFrameCallback(scene.frame);
      else cancelAnimationFrame(scene.frame);
    }
    scene.frame = 0;
    scene.camera.style.removeProperty('will-change');
  }
  function frames(scene: Scene) {
    if (scene.frame || scene.video.paused || reduced.matches || scene.cue.zoom <= 1 || !scene.cue.focus) return;
    scene.camera.style.willChange = 'transform';
    const tick = () => {
      scene.frame = 0;
      if (scene.video.paused || !available(scene)) { scene.video.pause(); stopFrames(scene); return; }
      paint(scene);
      frames(scene);
    };
    scene.videoFrame = typeof scene.video.requestVideoFrameCallback === 'function';
    scene.frame = scene.videoFrame ? scene.video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
  }
  function available(scene: Scene) {
    const modals = document.querySelectorAll('dialog[open]');
    return active && enabled && !document.hidden && !scene.failed && visible.has(scene.element)
      && !scene.element.closest('[hidden], [inert], dialog:not([open]), dialog[data-state="closing"]')
      && Array.from(modals).every((modal) => modal.contains(scene.element));
  }
  function sync() {
    scheduled = 0;
    for (const scene of scenes) {
      const shouldPlay = available(scene);
      scene.element.toggleAttribute('data-preview-running', shouldPlay);
      if (!shouldPlay) { scene.video.pause(); stopFrames(scene); continue; }
      if (!scene.video.getAttribute('src')) {
        scene.video.muted = true;
        scene.video.src = scene.video.dataset.featureVideoSrc!;
        scene.video.load();
      }
      if (!scene.video.paused || scene.pending) continue;
      scene.pending = true;
      let interrupted = false;
      void scene.video.play().catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'NotAllowedError') { enabled = false; schedule(); }
        else if (error instanceof DOMException && error.name === 'AbortError') interrupted = true;
      }).finally(() => {
        scene.pending = false;
        if (!available(scene)) scene.video.pause();
        else if (interrupted && scene.video.paused) schedule();
      });
    }
  }
  function schedule() { if (!scheduled) scheduled = requestAnimationFrame(sync); }

  const intersections = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting && entry.intersectionRatio >= .15) visible.add(entry.target as HTMLElement);
      else visible.delete(entry.target as HTMLElement);
    }
    schedule();
  }, { threshold: [0, .15] });
  const sizes = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const scene = scenes.find((candidate) => candidate.camera === entry.target);
      if (scene) { scene.width = entry.contentRect.width; scene.height = entry.contentRect.height; paint(scene); }
    }
  });
  for (const scene of scenes) {
    intersections.observe(scene.element);
    sizes.observe(scene.camera);
    listen(scene.video, 'playing', () => {
      if (!available(scene)) { scene.video.pause(); return; }
      scene.element.setAttribute('data-video-ready', '');
      frames(scene);
    });
    listen(scene.video, 'pause', () => stopFrames(scene));
    listen(scene.video, 'seeked', () => paint(scene));
    listen(scene.video, 'error', () => {
      scene.failed = true;
      scene.element.removeAttribute('data-video-ready');
      scene.element.removeAttribute('data-preview-running');
      stopFrames(scene);
    });
  }
  const mutations = new MutationObserver(schedule);
  // Cookie/download dialogs outside the gallery also suspend its previews.
  mutations.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open', 'hidden', 'inert', 'data-state'] });
  listen(document, 'visibilitychange', () => { if (document.hidden) sync(); else schedule(); });
  listen(reduced, 'change', () => {
    enabled = !reduced.matches;
    for (const scene of scenes) { scene.video.pause(); stopFrames(scene); paint(scene); }
    sync();
  });
  listen(window, 'pagehide', () => { active = false; sync(); });
  listen(window, 'pageshow', () => { active = true; schedule(); });
  listen(document, 'astro:before-swap', () => {
    active = false;
    sync();
    intersections.disconnect(); sizes.disconnect(); mutations.disconnect();
    if (scheduled) cancelAnimationFrame(scheduled);
    disposers.forEach((dispose) => dispose());
    initialized.delete(root);
  });
  sync();
}
