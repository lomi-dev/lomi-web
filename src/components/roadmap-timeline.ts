// Native scrolling moves the track. No wheel/touch handlers or animation loop.
export function initRoadmap(root: HTMLElement) {
  const viewport = root.querySelector<HTMLElement>('[data-roadmap-viewport]');
  const stage = root.querySelector<HTMLElement>('[data-roadmap-stage]');
  const track = root.querySelector<HTMLElement>('[data-roadmap-track]');
  const milestones = [...root.querySelectorAll<HTMLElement>('[data-roadmap-milestone]')];
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-roadmap-jump]')];
  const spine = root.querySelector<HTMLElement>('.roadmap-spine');
  if (!viewport || !stage || !track || !spine || !milestones.length || !('IntersectionObserver' in window)) return;

  const desktop = matchMedia('(min-width: 1024px) and (min-height: 760px)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  let distance = 0;
  let headerHeight = 72;
  let visible = false;
  let active = -1;
  let frame = 0;
  let measureFrame = 0;
  let positions: number[] = [];
  let spineLeft = 0;
  let spineWidth = 1;
  let stageWidth = 0;
  const jumpTarget = (index: number) => Math.max(0, Math.min(distance, positions[index] - stageWidth * .3));

  const render = () => {
    frame = 0;
    if (!visible || !distance || root.dataset.roadmapMode !== 'horizontal' || document.hidden) return;
    const progress = clamp((headerHeight - root.getBoundingClientRect().top) / distance);
    const offset = progress * distance;
    track.style.transform = `translate3d(${-offset}px, 0, 0)`;
    root.style.setProperty('--roadmap-progress', String(progress));
    root.style.setProperty('--roadmap-draw', String(clamp((offset + stageWidth * .75 - spineLeft) / spineWidth)));
    let nextActive = -1;
    let nearest = Infinity;
    milestones.forEach((milestone, index) => {
      const left = positions[index] - offset;
      const reveal = clamp((stageWidth * .95 - left) / (stageWidth * .22));
      milestone.style.setProperty('--milestone-reveal', String(reveal));
      const fromReadingPosition = Math.abs(offset - jumpTarget(index));
      if (fromReadingPosition < nearest) {
        nearest = fromReadingPosition;
        nextActive = index;
      }
    });
    if (nextActive !== active) {
      active = nextActive;
      buttons.forEach((button, index) => {
        if (index === active) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
    }
  };
  const schedule = () => { if (!frame && visible) frame = requestAnimationFrame(render); };
  const measure = () => {
    measureFrame = 0;
    const wasHorizontal = root.dataset.roadmapMode === 'horizontal';
    const bounds = root.getBoundingClientRect();
    const wasPinned = wasHorizontal && bounds.top <= headerHeight && bounds.bottom >= innerHeight;
    const previousActive = Math.max(0, active);
    const reset = () => {
      const focusedJump = buttons.findIndex((button) => button === document.activeElement);
      root.dataset.roadmapMode = 'static';
      root.style.removeProperty('--roadmap-distance');
      root.style.removeProperty('--roadmap-progress');
      root.style.removeProperty('--roadmap-draw');
      track.style.removeProperty('transform');
      milestones.forEach((milestone) => milestone.style.removeProperty('--milestone-reveal'));
      buttons.forEach((button) => button.removeAttribute('aria-current'));
      distance = 0;
      active = -1;
      const target = milestones[focusedJump >= 0 ? focusedJump : previousActive];
      if (focusedJump >= 0 && target) {
        target.tabIndex = -1;
        target.focus({ preventScroll: true });
        target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
      }
      if (wasPinned || focusedJump >= 0) target?.scrollIntoView({ block: 'start', behavior: 'instant' });
    };
    if (!desktop.matches || reduced.matches) { reset(); return; }
    headerHeight = document.querySelector<HTMLElement>('.site-header')?.offsetHeight ?? 72;
    root.dataset.roadmapMode = 'horizontal';
    // Long published CMS copy must stay readable. Use the natural list layout
    // whenever an alternating entry cannot fit inside this particular window.
    const space = stage.clientHeight * .45 - 28;
    const fits = milestones.every((milestone) => (milestone.querySelector<HTMLElement>('[data-roadmap-copy]')?.offsetHeight ?? Infinity) <= space)
      && (root.querySelector<HTMLElement>('.roadmap-intro')?.scrollHeight ?? Infinity) <= stage.clientHeight;
    if (!fits) { reset(); return; }
    stageWidth = stage.clientWidth;
    distance = Math.max(0, track.scrollWidth - stageWidth);
    if (!distance) { reset(); return; }
    root.style.setProperty('--roadmap-distance', `${distance}px`);
    const trackLeft = track.getBoundingClientRect().left;
    positions = milestones.map((milestone) => milestone.getBoundingClientRect().left - trackLeft);
    spineLeft = spine.offsetLeft;
    spineWidth = spine.offsetWidth;
    visible = root.getBoundingClientRect().bottom > 0 && root.getBoundingClientRect().top < innerHeight;
    render();
  };
  const scheduleMeasure = () => {
    if (!measureFrame) measureFrame = requestAnimationFrame(measure);
  };
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) schedule();
  });
  observer.observe(root);
  buttons.forEach((button, index) => button.addEventListener('click', () => {
    if (root.dataset.roadmapMode !== 'horizontal') return;
    const target = jumpTarget(index);
    scrollTo({ top: scrollY + root.getBoundingClientRect().top - headerHeight + target, behavior: 'smooth' });
  }));
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', scheduleMeasure, { passive: true });
  desktop.addEventListener('change', scheduleMeasure);
  reduced.addEventListener('change', scheduleMeasure);
  document.addEventListener('visibilitychange', scheduleMeasure);
  window.addEventListener('pageshow', scheduleMeasure);
  // Draft previews or translated copy can change without a viewport resize.
  const contentObserver = new MutationObserver(scheduleMeasure);
  contentObserver.observe(track, { subtree: true, childList: true, characterData: true });
  measure();
  document.fonts.ready.then(scheduleMeasure);
}
