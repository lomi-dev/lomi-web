import { chromium, firefox, webkit, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const url = process.env.VERIFY_URL || 'http://127.0.0.1:4322';
const browserType = { chromium, firefox, webkit }[process.env.VERIFY_BROWSER || 'chromium'];
// Keep real scrollbars visible so long-copy transitions exercise gutter changes.
const browser = await browserType.launch(browserType === chromium ? { ignoreDefaultArgs: ['--hide-scrollbars'] } : {});
const seed = JSON.parse(await readFile(new URL('../content/landing.json', import.meta.url), 'utf8'));
const errors = [];
await mkdir('artifacts', { recursive: true });

async function open(options = {}, html, init) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  await context.addInitScript(() => {
    try { localStorage.setItem('lomi.cookie-consent', JSON.stringify({ version: 1, externalMedia: false, savedAt: Date.now() })); } catch { /* Storage may be unavailable in fallback checks. */ }
  });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.on('pageerror', (error) => { errors.push(error.message); console.error('Feature browser error:', error.message); });
  page.on('requestfailed', (request) => { if (['script', 'document'].includes(request.resourceType())) console.error('Feature request failed:', request.url(), request.failure()?.errorText); });
  await page.route('https://api.github.com/**', (route) => route.fulfill({ contentType: 'application/json', body: '[]' }));
  if (html) await page.route(new URL(url).href, (route) => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  if (options.javaScriptEnabled !== false) {
    try { await expect(page.locator('[data-feature-gallery]')).toHaveAttribute('data-feature-ready', 'true'); }
    catch (error) {
      if (html) {
        await writeFile('artifacts/features-fixture-input.html', html);
        await writeFile('artifacts/features-fixture-rendered.html', await page.content());
        const state = await page.evaluate(() => {
          const root = document.querySelector('[data-feature-gallery]');
          const modal = root?.querySelector('#feature-dialog');
          const ancestors = [];
          for (let element = root; element; element = element.parentElement) ancestors.push({
            tag: element.tagName, hidden: element.hidden, inert: element.inert, display: getComputedStyle(element).display,
          });
          return {
            readyState: document.readyState, nativeDialog: typeof HTMLDialogElement,
            showModal: typeof modal?.showModal, rootReady: root?.getAttribute('data-feature-ready'),
            dialog: Boolean(modal), panel: Boolean(modal?.querySelector('[data-feature-panel]')),
            close: Boolean(modal?.querySelector('[data-feature-close]')), triggers: root?.querySelectorAll('[data-feature-open]').length,
            slides: [...(root?.querySelectorAll('[data-feature-slide]') ?? [])].map((slide, index) => ({
              title: slide.querySelectorAll(`#feature-dialog-title-${index}`).length,
              description: slide.querySelectorAll(`#feature-dialog-description-${index}`).length,
            })),
            ancestors,
            openDialogs: [...document.querySelectorAll('dialog[open]')].map((element) => element.id),
            scripts: [...document.scripts].map((script) => ({ src: script.src, type: script.type, async: script.async })),
            resources: performance.getEntriesByType('resource').filter((entry) => entry.initiatorType === 'script').map((entry) => ({ name: entry.name, duration: entry.duration })),
          };
        });
        await writeFile('artifacts/features-fixture-state.json', JSON.stringify(state, null, 2));
        await page.screenshot({ path: 'artifacts/features-fixture-failure.png' });
      }
      throw error;
    }
  }
  return { context, page };
}

const dialog = (page) => page.locator('#feature-dialog');
const card = (page, index) => page.locator(`[data-feature-open="${index}"]`);
async function selected(page, index, count = 6, title = seed.features.items[index]?.title) {
  const modal = dialog(page);
  await expect(modal).toBeVisible();
  await expect(modal).toHaveAttribute('aria-labelledby', `feature-dialog-title-${index}`);
  await expect(modal).toHaveAttribute('aria-describedby', `feature-dialog-description-${index}`);
  if (title) await expect(modal).toHaveAccessibleName(title);
  await expect(modal.locator('[data-feature-slide]:not([hidden])')).toHaveCount(1);
  await expect(modal.locator('[data-feature-navigation]')).toHaveCount(1);
  await expect(modal.locator('[data-feature-slide]:not([hidden]) [data-feature-navigation]')).toHaveCount(1);
  await expect(page.locator(`#feature-dialog-title-${index}`)).toBeVisible();
  await expect(page.locator(`#feature-dialog-description-${index}`)).toBeVisible();
  if (count === 6) await expect(page.locator(`#feature-dialog-description-${index}`)).toHaveText(seed.features.items[index].description);
  await expect(modal.locator('[data-feature-dot][aria-current="true"]')).toHaveCount(1);
  await expect(modal.locator(`[data-feature-dot="${index}"]`)).toHaveAttribute('aria-current', 'true');
  await expect(modal.locator('[data-feature-count]')).toHaveText(`${String(index + 1).padStart(2, '0')} / ${String(count).padStart(2, '0')}`);
}

async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth), 'No horizontal document overflow').toBe(await page.evaluate(() => document.documentElement.clientWidth));
}

async function controlsVisible(page) {
  for (const control of await dialog(page).locator('[data-feature-close], [data-feature-prev], [data-feature-next], [data-feature-dot], [data-preview-toggle]:not([hidden])').all()) {
    await expect(control).toBeVisible();
    expect(await control.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      let left = 0, top = 0, right = innerWidth, bottom = innerHeight;
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), box = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
          left = Math.max(left, box.left); right = Math.min(right, box.right);
        }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
          top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom);
        }
      }
      return rect.width > 0 && rect.height > 0 && rect.left >= left - 1 && rect.right <= right + 1 && rect.top >= top - 1 && rect.bottom <= bottom + 1;
    }), 'Modal controls remain fully visible without scrolling').toBe(true);
  }
  await noOverflow(page);
}

async function layout(page) {
  const slide = dialog(page).locator('[data-feature-slide]:not([hidden])');
  const media = await slide.locator('[data-feature-modal-media]').boundingBox();
  const copy = await slide.locator('[data-feature-copy]').boundingBox();
  if (page.viewportSize().width >= 900) {
    expect(media.x + media.width, 'Desktop media sits left of its copy').toBeLessThanOrEqual(copy.x + 1);
  } else {
    expect(media.y + media.height, 'Narrow modal stacks media above copy').toBeLessThanOrEqual(copy.y + 1);
  }
}

async function axe(page, label) {
  // Contrast snapshots describe the readable resting state; motion itself is
  // sampled separately while its outgoing visual copies remain aria-hidden.
  await expect.poll(() => dialog(page).evaluate((element) => element.getAnimations({ subtree: true })
    .filter((animation) => animation.constructor.name === 'Animation' && ['running', 'paused'].includes(animation.playState)).length)).toBe(0);
  const result = await new AxeBuilder({ page }).include('#features').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations, `${label}: feature accessibility`).toEqual([]);
}

async function close(page, opener) {
  await page.keyboard.press('Escape');
  await expect(dialog(page)).not.toBeVisible();
  await expect(opener).toBeFocused();
  await expect(dialog(page).locator('[data-feature-motion-layer]')).toHaveCount(0);
}

async function settled(page, index) {
  await selected(page, index);
  await expect(dialog(page).locator('[data-feature-motion-layer]')).toHaveCount(0);
  await expect.poll(() => dialog(page).evaluate((element) => element.getAnimations({ subtree: true })
    .filter((animation) => animation.constructor.name === 'Animation' && ['running', 'paused'].includes(animation.playState)).length)).toBe(0);
}

async function verifyOriginMotion(page, index) {
  await card(page, index).scrollIntoViewIfNeeded();
  const probe = await card(page, index).evaluate((trigger) => {
    const box = (element) => {
      const { left, top, width, height } = element.getBoundingClientRect();
      return { left, top, width, height };
    };
    const source = box(trigger);
    trigger.click();
    const modal = document.querySelector('#feature-dialog');
    const motion = modal.getAnimations().find((animation) => animation.effect.target === modal
      && animation.effect.getKeyframes().some((frame) => frame.transform && frame.transform !== 'none'));
    if (!motion) return { source, hasWholeDialogMotion: false };
    motion.pause();
    const duration = Number(motion.effect.getTiming().duration);
    const parts = ['[data-feature-panel]', '[data-feature-close]', '[data-feature-slide]:not([hidden]) [data-feature-modal-media]',
      '[data-feature-slide]:not([hidden]) [data-feature-copy]', '[data-feature-navigation]'].map((selector) => modal.querySelector(selector));
    motion.currentTime = duration;
    const target = box(modal);
    const finalParts = parts.map(box);
    motion.currentTime = 0;
    const start = box(modal);
    motion.currentTime = duration / 2;
    const middle = box(modal);
    const middleParts = parts.map(box);
    const independentMotion = parts.some((part) => getComputedStyle(part).transform !== 'none');
    motion.play();
    return { hasWholeDialogMotion: true, source, start, target, middle, finalParts, middleParts, independentMotion };
  });
  expect(probe.hasWholeDialogMotion, 'The complete dialog grows from its card').toBe(true);
  for (const dimension of ['left', 'top', 'width', 'height']) {
    expect(Math.abs(probe.start[dimension] - probe.source[dimension]), `Dialog starts at the clicked card: ${dimension}`).toBeLessThan(1.5);
  }
  expect(probe.independentMotion, 'Content and chrome move with the dialog surface').toBe(false);
  const scaleX = probe.middle.width / probe.target.width;
  const scaleY = probe.middle.height / probe.target.height;
  for (let part = 0; part < probe.finalParts.length; part++) {
    const final = probe.finalParts[part], middle = probe.middleParts[part];
    expect(Math.abs(middle.left - (probe.middle.left + (final.left - probe.target.left) * scaleX))).toBeLessThan(1.5);
    expect(Math.abs(middle.top - (probe.middle.top + (final.top - probe.target.top) * scaleY))).toBeLessThan(1.5);
    expect(Math.abs(middle.width - final.width * scaleX)).toBeLessThan(1.5);
    expect(Math.abs(middle.height - final.height * scaleY)).toBeLessThan(1.5);
  }
  await settled(page, index);
  const exit = await dialog(page).evaluate((modal) => {
    modal.querySelector('[data-feature-close]').click();
    return modal.getAnimations().some((animation) => animation.effect.target === modal
      && animation.effect.getKeyframes().some((frame) => frame.transform && frame.transform !== 'none'));
  });
  expect(exit, 'Exit animates the complete dialog too').toBe(true);
  await expect(dialog(page)).not.toBeVisible();
  await expect(card(page, index)).toBeFocused();

  const interruption = await card(page, index).evaluate((trigger) => {
    trigger.click();
    const modal = document.querySelector('#feature-dialog');
    const opening = modal.getAnimations().find((animation) => animation.effect.target === modal
      && animation.effect.getKeyframes().some((frame) => frame.transform && frame.transform !== 'none'));
    opening.pause();
    opening.currentTime = Number(opening.effect.getTiming().duration) * .35;
    const before = modal.getBoundingClientRect().toJSON();
    modal.querySelector('[data-feature-close]').click();
    const after = modal.getBoundingClientRect().toJSON();
    return { before, after };
  });
  for (const dimension of ['left', 'top', 'width', 'height']) {
    expect(Math.abs(interruption.before[dimension] - interruption.after[dimension]), `Closing mid-opening keeps the current position: ${dimension}`).toBeLessThan(1.5);
  }
  await expect(dialog(page)).not.toBeVisible();
  await expect(card(page, index)).toBeFocused();
}

async function directionStep(page, control, index, direction) {
  // Seek native animations in the same task as the click, so direction is
  // measured from rendered geometry without racing a short transition.
  const motion = await dialog(page).evaluate((element, selector) => {
    const beforeSlide = element.querySelector('[data-feature-slide]:not([hidden])');
    const left = (root, selector) => root.querySelector(selector).getBoundingClientRect().left;
    const box = (item) => { const rect = item.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; };
    const navigation = element.querySelector('[data-feature-navigation]');
    const navigationState = (nav) => ({
      count: nav.querySelector('.feature-modal-paging > span').textContent.trim(),
      current: [...nav.querySelectorAll('.feature-modal-dots button')].findIndex((dot) => dot.getAttribute('aria-current') === 'true'),
      countColor: getComputedStyle(nav.querySelector('.feature-modal-paging > span')).color,
      countNumerals: getComputedStyle(nav.querySelector('.feature-modal-paging > span')).fontVariantNumeric,
      previousIcon: getComputedStyle(nav.querySelector('.feature-modal-arrows button:first-child svg')).transform,
    });
    const before = {
      slide: beforeSlide.getBoundingClientRect().left,
      media: left(beforeSlide, '[data-feature-modal-media]'),
      picture: left(beforeSlide, 'picture, [data-placeholder-variant="feature"]'),
      copy: left(beforeSlide, '[data-feature-copy]'),
      description: left(beforeSlide, '.feature-modal-description'),
      close: box(element.querySelector('[data-feature-close]')),
      navigation: left(beforeSlide, '[data-feature-navigation]'),
      count: left(navigation, '.feature-modal-paging > span'),
      arrows: left(navigation, '.feature-modal-arrows'),
      dots: left(navigation, '.feature-modal-dots'),
      navigationState: navigationState(navigation),
    };
    const trigger = element.querySelector(selector);
    trigger.focus({ preventScroll: true });
    trigger.click();
    const animations = element.getAnimations({ subtree: true }).filter((animation) => animation.constructor.name === 'Animation');
    for (const animation of animations) {
      animation.pause();
      animation.currentTime = Number(animation.effect.getTiming().duration) * .35;
    }
    const slide = element.querySelector('[data-feature-slide]:not([hidden])');
    const frame = element.querySelector('[data-feature-pages]');
    const outgoing = element.querySelector('[data-feature-motion-layer="slide"]');
    const copy = slide.querySelector('[data-feature-copy]');
    const layers = [...element.querySelectorAll('[data-feature-motion-layer]')];
    return {
      incoming: slide.getBoundingClientRect().left - before.slide,
      outgoing: outgoing ? outgoing.getBoundingClientRect().left - before.slide : null,
      displacements: {
        media: left(slide, '[data-feature-modal-media]') - before.media,
        picture: left(slide, 'picture, [data-placeholder-variant="feature"]') - before.picture,
        copy: left(slide, '[data-feature-copy]') - before.copy,
        description: left(slide, '.feature-modal-description') - before.description,
        navigation: left(slide, '[data-feature-navigation]') - before.navigation,
        count: left(navigation, '.feature-modal-paging > span') - before.count,
        arrows: left(navigation, '.feature-modal-arrows') - before.arrows,
        dots: left(navigation, '.feature-modal-dots') - before.dots,
      },
      outgoingDisplacements: outgoing ? {
        media: left(outgoing, '.feature-modal-media') - before.media,
        picture: left(outgoing, 'picture, [data-placeholder-variant="feature"]') - before.picture,
        copy: left(outgoing, '.feature-modal-copy') - before.copy,
        description: left(outgoing, '.feature-modal-description') - before.description,
        navigation: left(outgoing, '.feature-modal-navigation') - before.navigation,
        count: left(outgoing, '.feature-modal-paging > span') - before.count,
        arrows: left(outgoing, '.feature-modal-arrows') - before.arrows,
        dots: left(outgoing, '.feature-modal-dots') - before.dots,
      } : null,
      opacity: [slide, copy, slide.querySelector('.feature-modal-description'), slide.querySelector('picture, [data-placeholder-variant="feature"]'), slide.querySelector('[data-feature-modal-media]'),
        outgoing, outgoing?.querySelector('.feature-modal-copy'), outgoing?.querySelector('picture, [data-placeholder-variant="feature"]'), outgoing?.querySelector('.feature-modal-media')]
        .map((item) => item ? Number(getComputedStyle(item).opacity) : null),
      ownership: animations.map((animation) => animation.effect.target === slide ? 'incoming' : animation.effect.target === outgoing ? 'outgoing' : 'child'),
      clipped: ['hidden', 'clip'].includes(getComputedStyle(frame).overflowX),
      close: { before: before.close, after: box(element.querySelector('[data-feature-close]')) },
      navigationIdentity: element.querySelector('[data-feature-navigation]') === navigation,
      triggerFocused: document.activeElement === trigger,
      navigationSnapshot: { before: before.navigationState, outgoing: outgoing ? navigationState(outgoing.querySelector('.feature-modal-navigation')) : null },
      layers: layers.map((layer) => ({ kind: layer.dataset.featureMotionLayer,
        inert: layer.inert, hidden: layer.getAttribute('aria-hidden'), ids: layer.querySelectorAll('[id]').length + Number(layer.hasAttribute('id')),
        media: layer.querySelectorAll('.feature-modal-media').length, copy: layer.querySelectorAll('.feature-modal-copy').length,
        navigation: layer.querySelectorAll('.feature-modal-navigation').length, liveHooks: layer.querySelectorAll('[data-feature-navigation], [data-feature-count], [data-feature-prev], [data-feature-next], [data-feature-dot]').length })),
      duplicateIds: [...element.querySelectorAll('[id]')].map((item) => item.id).filter((id, index, all) => all.indexOf(id) !== index),
    };
  }, control);
  await selected(page, index);
  if (direction === 1 && (index === 1 || (index === 0 && page.viewportSize().width < 900))) {
    await page.screenshot({ path: `artifacts/features-${browserType.name()}-navigation-midpoint${page.viewportSize().width < 900 ? '-mobile' : ''}.png` });
  }
  expect(motion.incoming * direction, 'Incoming feature enters from the requested side').toBeGreaterThan(1);
  expect(motion.outgoing * direction, 'Outgoing feature moves in the opposite direction').toBeLessThan(-1);
  for (const [part, displacement] of Object.entries(motion.displacements)) {
    expect(Math.abs(displacement - motion.incoming), `Incoming ${part} moves with the whole slide`).toBeLessThanOrEqual(1);
  }
  for (const [part, displacement] of Object.entries(motion.outgoingDisplacements || {})) {
    expect(Math.abs(displacement - motion.outgoing), `Outgoing ${part} moves with the whole slide`).toBeLessThanOrEqual(1);
  }
  expect(motion.opacity, 'Media and copy retain full opacity during the swipe').toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
  expect(motion.ownership.sort(), 'Only the incoming and outgoing whole slides own motion').toEqual(['incoming', 'outgoing']);
  expect(motion.clipped, 'Both complete features stay inside the shared clipped viewport').toBe(true);
  expect(motion.close.after, 'Close remains stationary while navigation swipes').toEqual(motion.close.before);
  expect(motion.navigationIdentity, 'The same live navigation moves into the incoming feature').toBe(true);
  expect(motion.triggerFocused, 'Focused navigation control survives reparenting').toBe(true);
  expect(motion.navigationSnapshot.outgoing, 'Outgoing navigation preserves its old count, current dot and styling').toEqual(motion.navigationSnapshot.before);
  expect(motion.layers.map((layer) => layer.kind)).toEqual(['slide']);
  for (const layer of motion.layers) expect(layer, 'One outgoing feature contains image, copy and a passive navigation snapshot').toMatchObject({ inert: true, hidden: 'true', ids: 0, media: 1, copy: 1, navigation: 1, liveHooks: 0 });
  expect(motion.duplicateIds, 'Visual copies do not duplicate accessible IDs').toEqual([]);
  if (index === 1 && direction === 1) {
    for (let step = 0; step < 24; step++) {
      const previousFocus = await dialog(page).evaluate(() => document.activeElement?.outerHTML.slice(0, 500));
      await page.keyboard.press(step < 12 ? 'Tab' : 'Shift+Tab');
      const tabFocus = await dialog(page).evaluate((element) => ({
        contained: element.contains(document.activeElement) && !document.activeElement.closest('[data-feature-motion-layer]'),
        active: document.activeElement?.outerHTML.slice(0, 500),
      }));
      expect(tabFocus.contained, `Tab keeps focus on live controls and ignores outgoing navigation (step ${step}, previous ${previousFocus}, ${JSON.stringify(tabFocus)})`).toBe(true);
    }
    await dialog(page).evaluate((element, selector) => element.querySelector(selector).focus({ preventScroll: true }), control);
  }
  await dialog(page).evaluate((element) => element.getAnimations({ subtree: true }).filter((animation) => animation.constructor.name === 'Animation' && animation.playState === 'paused').forEach((animation) => animation.play()));
  await settled(page, index);
}

async function verifyNavigationMotion(page) {
  await card(page, 0).click();
  await settled(page, 0);
  await directionStep(page, '[data-feature-next]', 1, 1);
  await directionStep(page, '[data-feature-prev]', 0, -1);
  await directionStep(page, '[data-feature-prev]', 5, -1);
  await directionStep(page, '[data-feature-next]', 0, 1);
  await dialog(page).locator('[data-feature-next]').focus();
  await page.keyboard.press('ArrowRight');
  await settled(page, 1);
  await expect(dialog(page).locator('[data-feature-next]')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await settled(page, 0);
  await expect(dialog(page).locator('[data-feature-next]')).toBeFocused();

  await dialog(page).evaluate((element) => {
    const probe = { starts: 0, maxSlides: 0 };
    const observer = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node instanceof Element) probe.starts += Number(node.matches('[data-feature-motion-layer="slide"]')) + node.querySelectorAll('[data-feature-motion-layer="slide"]').length;
      }
      probe.maxSlides = Math.max(probe.maxSlides, element.querySelectorAll('[data-feature-motion-layer="slide"]').length);
    });
    observer.observe(element, { childList: true, subtree: true });
    const button = element.querySelector('[data-feature-next]');
    button.focus({ preventScroll: true });
    window.__featureMotionProbe = { probe, observer, button };
    for (let index = 0; index < 15; index++) element.querySelector('[data-feature-next]').click();
  });
  await settled(page, 3);
  const rapid = await page.evaluate(() => {
    const { probe, observer, button } = window.__featureMotionProbe;
    const focused = document.activeElement === button;
    observer.disconnect(); delete window.__featureMotionProbe;
    return { ...probe, focused };
  });
  expect(rapid.starts, 'Fifteen clicks animate the current transition and latest intent only').toBeGreaterThan(0);
  expect(rapid.starts).toBeLessThanOrEqual(2);
  expect(rapid.maxSlides, 'Whole-slide layers never stack across queued intents').toBeLessThanOrEqual(1);
  expect(rapid.focused, 'The same live arrow keeps focus through queued reparenting').toBe(true);

  await dialog(page).locator('[data-feature-dot="0"]').click();
  await settled(page, 0);
  await dialog(page).evaluate((element) => {
    element.querySelector('[data-feature-next]').click();
    element.querySelector('[data-feature-prev]').click();
  });
  await settled(page, 0);
  await dialog(page).evaluate((element) => {
    element.querySelector('[data-feature-next]').click();
    element.querySelector('[data-feature-dot="4"]').click();
    element.querySelector('[data-feature-prev]').click();
  });
  await settled(page, 3);

  await dialog(page).evaluate((element) => {
    element.querySelector('[data-feature-next]').click();
    element.querySelector('[data-feature-next]').click();
    element.getAnimations({ subtree: true }).filter((animation) => animation.constructor.name === 'Animation').forEach((animation) => animation.pause());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await settled(page, 5);
  await controlsVisible(page);
  expect(await dialog(page).evaluate((element) => element.contains(document.activeElement)), 'Resizing retains focus inside the modal').toBe(true);
  await directionStep(page, '[data-feature-next]', 0, 1);
  await directionStep(page, '[data-feature-prev]', 5, -1);
  await page.setViewportSize({ width: 1440, height: 900 });
  await settled(page, 5);

  await dialog(page).evaluate((element) => {
    element.querySelector('[data-feature-next]').click();
    element.querySelector('[data-feature-next]').click();
    element.getAnimations({ subtree: true }).filter((animation) => animation.constructor.name === 'Animation').forEach((animation) => animation.pause());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await settled(page, 1);
  expect(await dialog(page).evaluate((element) => element.getAnimations({ subtree: true }).some((animation) => animation.effect.getKeyframes().some((frame) => frame.transform && frame.transform !== 'none'))), 'Live reduced motion clears all horizontal motion').toBe(false);
  await dialog(page).locator('[data-feature-next]').click();
  await selected(page, 2);
  expect(await dialog(page).evaluate((element) => element.getAnimations({ subtree: true }).some((animation) => animation.effect.getKeyframes().some((frame) => frame.transform && frame.transform !== 'none'))), 'Reduced-motion navigation only fades').toBe(false);
  await settled(page, 2);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await dialog(page).evaluate((element) => {
    element.querySelector('[data-feature-next]').click();
    element.querySelector('[data-feature-dot="5"]').click();
    element.getAnimations({ subtree: true }).filter((animation) => animation.constructor.name === 'Animation').forEach((animation) => animation.pause());
  });
  await close(page, card(page, 0));
  await card(page, 1).click();
  await settled(page, 1);
  await page.waitForTimeout(750);
  await settled(page, 1);
  await close(page, card(page, 1));
}

try {
  const { context, page } = await open();
  const root = page.locator('#features');
  await expect(page.locator('main > #features')).toHaveCount(1);
  await expect(root).toHaveCSS('background-color', 'rgb(247, 248, 243)');
  expect(await root.getAttribute('data-scroll-surface')).not.toBeNull();
  await expect(root.locator('[data-feature-open]')).toHaveCount(6);
  await expect(root.locator('[data-feature-card-media] [data-feature-simulation] > svg')).toHaveCount(6);
  await expect(root.locator('video, iframe')).toHaveCount(0);
  for (const image of await root.locator('img').all()) {
    expect(new URL(await image.getAttribute('src'), url).origin, 'Feature imagery stays local').toBe(new URL(url).origin);
  }
  await verifyOriginMotion(page, 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await verifyOriginMotion(page, 2);
  await page.setViewportSize({ width: 1440, height: 900 });
  for (let index = 0; index < 6; index++) {
    const opener = card(page, index);
    await expect(opener).toHaveAttribute('href', `#feature-description-${index}`);
    await expect(page.locator(`#feature-description-${index}`)).not.toBeVisible();
    await opener.click();
    await selected(page, index);
    await expect(dialog(page).locator('[data-feature-close]')).toBeFocused();
    await close(page, opener);
  }
  await verifyNavigationMotion(page);
  await card(page, 0).click();
  await dialog(page).locator('[data-feature-prev]').click();
  await selected(page, 5);
  await dialog(page).locator('[data-feature-next]').click();
  await selected(page, 0);
  await page.keyboard.press('ArrowLeft');
  await selected(page, 5);
  await page.keyboard.press('ArrowRight');
  await selected(page, 0);
  await dialog(page).locator('[data-feature-dot="3"]').click();
  await selected(page, 3);
  // Several events in one task expose stale animation callbacks and lost input.
  await dialog(page).evaluate((element) => {
    for (let index = 0; index < 15; index++) element.querySelector('[data-feature-next]').click();
  });
  await selected(page, 0);
  await dialog(page).locator('[data-feature-slide]:not([hidden]) [data-feature-copy]').focus();
  for (const index of [1, 2]) {
    await page.keyboard.press('ArrowRight');
    await selected(page, index);
    await expect(dialog(page).locator('[data-feature-slide]:not([hidden]) [data-feature-copy]')).toBeFocused();
  }
  await dialog(page).locator('[data-feature-dot="0"]').click();
  for (let index = 0; index < 18; index++) {
    await page.keyboard.press(index < 9 ? 'Tab' : 'Shift+Tab');
    expect(await dialog(page).evaluate((element) => element.contains(document.activeElement)), 'Native modal keeps keyboard focus inside').toBe(true);
  }
  await layout(page);
  await axe(page, 'Desktop modal');
  await page.screenshot({ path: `artifacts/features-${browserType.name()}-desktop.png` });
  await close(page, card(page, 0));

  await card(page, 2).evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const scrollBefore = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  const inlineBefore = await page.evaluate(() => ({ body: document.body.getAttribute('style'), html: document.documentElement.getAttribute('style') }));
  await card(page, 2).click();
  const lockedBefore = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  await page.mouse.move(4, 4);
  await page.mouse.wheel(0, 650);
  await expect.poll(() => page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(lockedBefore);
  await dialog(page).locator('[data-feature-close]').click();
  await expect(dialog(page)).not.toBeVisible();
  await expect(card(page, 2)).toBeFocused();
  await expect.poll(() => page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(scrollBefore);
  expect(await page.evaluate(() => ({ body: document.body.style.position, overflow: document.body.style.overflow })), 'Scroll lock releases body styles').toEqual({ body: '', overflow: '' });
  // Preserve any pre-existing inline body declaration through the modal cycle.
  expect(await page.evaluate(() => document.body.getAttribute('style') || '')).toBe(inlineBefore.body || '');

  await card(page, 1).click();
  const bounds = await dialog(page).boundingBox();
  const point = bounds.x > 2 ? { x: 1, y: bounds.y + 10 } : { x: bounds.x + 10, y: 1 };
  await page.mouse.click(point.x, point.y);
  await expect(dialog(page)).not.toBeVisible();
  await expect(card(page, 1)).toBeFocused();
  await card(page, 4).click();
  await dialog(page).evaluate((element) => element.querySelector('[data-feature-next]').click());
  await page.keyboard.press('Escape');
  await expect(dialog(page)).not.toBeVisible();
  await card(page, 1).click();
  await selected(page, 1);
  await page.waitForTimeout(450);
  await selected(page, 1);

  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 500 }]) {
    await page.setViewportSize(viewport);
    await settled(page, 1);
    await controlsVisible(page);
    await layout(page);
    await dialog(page).locator('[data-feature-next]').click();
    await selected(page, 2);
    await dialog(page).locator('[data-feature-prev]').click();
    await selected(page, 1);
    if (viewport.width === 390) {
      await axe(page, 'Mobile modal');
      await page.screenshot({ path: `artifacts/features-${browserType.name()}-mobile.png` });
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await dialog(page).locator('[data-feature-next]').click();
  await selected(page, 2);
  expect(await dialog(page).evaluate((element) => element.getAnimations({ subtree: true }).some((animation) => animation.effect.getKeyframes().some((frame) => frame.transform && frame.transform !== 'none'))), 'Reduced motion has no transform animation').toBe(false);
  await axe(page, 'Reduced motion modal');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await dialog(page).evaluate((element) => element.querySelector('[data-feature-next]').click());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await selected(page, 3);
  await expect.poll(() => dialog(page).evaluate((element) => element.getAnimations({ subtree: true }).some((animation) => animation.playState === 'running' && animation.effect.getKeyframes().some((frame) => frame.transform && frame.transform !== 'none'))), { message: 'Live reduced-motion change cancels moving animation', timeout: 1000 }).toBe(false);
  await close(page, card(page, 1));
  const serverHTML = await (await page.request.get(url)).text();

  // Transform real server markup before hydration to exercise the published
  // CMS size boundaries without replacing application scripts or scoped CSS.
  for (const [count, longCopy] of [[1, false], [12, false], [12, true]]) {
    const html = await page.evaluate(({ original, count, longCopy }) => {
      const doc = new DOMParser().parseFromString(original, 'text/html');
      const root = doc.querySelector('[data-feature-gallery]');
      const firstCard = root.querySelector('[data-feature-card]');
      const cardTemplate = firstCard.cloneNode(true), cards = firstCard.parentElement;
      const firstSlide = root.querySelector('[data-feature-slide]');
      const slideTemplate = firstSlide.cloneNode(true), slides = firstSlide.parentElement;
      slideTemplate.querySelector('[data-feature-navigation]')?.remove();
      const navigation = root.querySelector('[data-feature-navigation]');
      navigation.remove();
      const firstDot = navigation.querySelector('[data-feature-dot]');
      const dotTemplate = firstDot.cloneNode(true), dots = firstDot.parentElement;
      root.querySelectorAll('[data-feature-card]').forEach((element) => element.remove());
      root.querySelectorAll('[data-feature-slide]').forEach((element) => element.remove());
      dots.replaceChildren();
      for (let index = 0; index < count; index++) {
        const card = cardTemplate.cloneNode(true), slide = slideTemplate.cloneNode(true), dot = dotTemplate.cloneNode(true);
        const opener = card.querySelector('[data-feature-open]');
        opener.dataset.featureOpen = String(index); opener.setAttribute('href', `#feature-description-${index}`);
        opener.setAttribute('aria-labelledby', `feature-title-${index}`);
        card.querySelector('[id^="feature-title-"]').id = `feature-title-${index}`;
        card.querySelector('[id^="feature-description-"]').id = `feature-description-${index}`;
        slide.querySelector('[id^="feature-dialog-title-"]').id = `feature-dialog-title-${index}`;
        slide.querySelector('[id^="feature-dialog-description-"]').id = `feature-dialog-description-${index}`;
        slide.id = `feature-slide-${index}`;
        slide.dataset.featureSlide = String(index);
        dot.dataset.featureDot = String(index);
        dot.setAttribute('aria-label', `Show published feature ${index + 1}`);
        dot.removeAttribute('aria-current');
        if (dot.hasAttribute('aria-controls')) dot.setAttribute('aria-controls', slide.id || `feature-dialog-title-${index}`);
        const title = `Published feature ${index + 1}`;
        slide.querySelector('[id^="feature-dialog-title-"]').textContent = title;
        const description = longCopy ? 'Published feature context with enough detail to require scrolling. '.repeat(40).slice(0, 2000) : `Published feature description ${index + 1}`;
        slide.querySelector('[id^="feature-dialog-description-"]').textContent = description;
        card.querySelector('[id^="feature-description-"]').textContent = description;
        cards.append(card); slides.append(slide); dots.append(dot);
      }
      navigation.querySelector('[data-feature-count]').textContent = `01 / ${String(count).padStart(2, '0')}`;
      slides.querySelector('[data-feature-slide]').append(navigation);
      return '<!doctype html>' + doc.documentElement.outerHTML;
    }, { original: serverHTML, count, longCopy });
    const fixture = await open({}, html);
    if (longCopy) {
      // A long-to-short change removes the incoming region's scrollbar. The
      // outgoing copy must keep its original width, wrapping and scroll offset.
      await fixture.page.addStyleTag({ content: '#feature-dialog .feature-modal-copy::-webkit-scrollbar { width: 14px; }' });
      await fixture.page.locator('#feature-dialog-description-0').evaluate((element) => { element.textContent = 'Short published feature description.'; });
    }
    for (const viewport of longCopy ? [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1440, height: 500 }] : [{ width: 1440, height: 900 }]) {
      await fixture.page.setViewportSize(viewport);
      await card(fixture.page, count - 1).click();
      await selected(fixture.page, count - 1, count, `Published feature ${count}`);
      await controlsVisible(fixture.page);
      if (longCopy) {
        const copy = fixture.page.locator(`#feature-dialog-description-${count - 1}`);
        expect(await copy.textContent()).toHaveLength(2000);
        await copy.evaluate((element) => {
          const range = document.createRange(); range.selectNodeContents(element); range.collapse(false);
          const marker = document.createElement('span'); marker.dataset.testCopyEnd = ''; marker.textContent = ' End of published description';
          range.insertNode(marker); marker.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        });
        await expect(fixture.page.locator('[data-test-copy-end]')).toBeInViewport();
        await controlsVisible(fixture.page);
        await axe(fixture.page, `Long CMS copy at ${viewport.width}px`);
        await fixture.page.locator('[data-test-copy-end]').evaluate((element) => element.remove());
      }
      if (count === 1) {
        await expect(dialog(fixture.page).locator('[data-feature-next]')).toBeDisabled();
        await expect(dialog(fixture.page).locator('[data-feature-prev]')).toBeDisabled();
      } else if (longCopy) {
        const geometry = await dialog(fixture.page).evaluate((element) => {
          const copy = element.querySelector('[data-feature-slide]:not([hidden]) [data-feature-copy]');
          const measure = (region) => {
            if (!region) return null;
            const description = region.querySelector('.feature-modal-description').getBoundingClientRect();
            return { width: region.getBoundingClientRect().width, clientWidth: region.clientWidth,
              scrollTop: region.scrollTop, textWidth: description.width, textHeight: description.height };
          };
          const before = measure(copy);
          element.querySelector('[data-feature-next]').click();
          element.getAnimations({ subtree: true }).filter((animation) => animation.constructor.name === 'Animation').forEach((animation) => { animation.pause(); animation.currentTime = 0; });
          const incoming = element.querySelector('[data-feature-slide]:not([hidden]) [data-feature-copy]');
          return { before, outgoing: measure(element.querySelector('[data-feature-motion-layer="slide"] .feature-modal-copy')),
            incoming: { clientWidth: incoming.clientWidth, scrollHeight: incoming.scrollHeight, clientHeight: incoming.clientHeight },
            slideLayers: element.querySelectorAll('[data-feature-motion-layer="slide"]').length };
        });
        if (browserType === chromium) expect(geometry.before.width - geometry.before.clientWidth, 'Fixture exposes a classic scrollbar gutter').toBeGreaterThan(10);
        expect(geometry.before.scrollTop, 'Long outgoing copy starts from a real scrolled position').toBeGreaterThan(0);
        expect(geometry.outgoing, 'Long-to-short transition retains outgoing copy').not.toBeNull();
        for (const property of ['width', 'clientWidth', 'scrollTop', 'textWidth', 'textHeight']) {
          expect(Math.abs(geometry.outgoing[property] - geometry.before[property]), `Outgoing ${property} preserves scrolled text geometry at ${viewport.width}px`).toBeLessThanOrEqual(1);
        }
        expect(geometry.slideLayers).toBe(1);
        await dialog(fixture.page).evaluate((element) => element.getAnimations({ subtree: true }).filter((animation) => animation.constructor.name === 'Animation' && animation.playState === 'paused').forEach((animation) => animation.play()));
        await expect(dialog(fixture.page).locator('[data-feature-motion-layer]')).toHaveCount(0);
        const after = await dialog(fixture.page).locator('[data-feature-slide]:not([hidden]) [data-feature-copy]').evaluate((copy) => ({
          clientWidth: copy.clientWidth, scrollHeight: copy.scrollHeight, clientHeight: copy.clientHeight,
        }));
        expect(after, 'Outgoing copy does not change the incoming scroller geometry').toEqual(geometry.incoming);
      } else {
        await dialog(fixture.page).locator('[data-feature-next]').click();
      }
      await selected(fixture.page, 0, count, 'Published feature 1');
      await close(fixture.page, card(fixture.page, count - 1));
    }
    await fixture.context.close();
  }
  await context.close();

  const legacyGutter = await open({}, undefined, () => {
    const original = window.getComputedStyle;
    window.getComputedStyle = (...args) => {
      const style = original(...args);
      return new Proxy(style, { get(target, property) {
        if (property === 'scrollbarGutter') return undefined;
        if (property === 'getPropertyValue') return (name) => name === 'scrollbar-gutter' ? '' : target.getPropertyValue(name);
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
    };
  });
  await legacyGutter.page.evaluate(() => Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => innerWidth - 12 }));
  await card(legacyGutter.page, 0).click();
  await selected(legacyGutter.page, 0);
  await close(legacyGutter.page, card(legacyGutter.page, 0));
  await legacyGutter.context.close();

  for (const viewport of [{ width: 1440, height: 900 }, { width: 320, height: 568 }]) {
    const staticRun = await open({ javaScriptEnabled: false, viewport });
    for (let index = 0; index < 6; index++) {
      await expect(staticRun.page.locator(`#feature-description-${index}`)).toBeVisible();
      // Native keyboard activation avoids racing smooth fragment scrolling
      // against Playwright's pointer stability checks in a no-JS document.
      await card(staticRun.page, index).press('Enter');
      await expect(staticRun.page).toHaveURL(new URL(`/#feature-description-${index}`, url).href);
      await expect(staticRun.page.locator(`#feature-description-${index}`)).toBeInViewport();
      await expect(dialog(staticRun.page)).not.toBeVisible();
    }
    expect(await staticRun.page.locator('[data-feature-card]').evaluateAll((cards) => {
      const previews = cards.map((card) => card.querySelector('[data-feature-open]').getBoundingClientRect());
      return cards.every((card, index) => {
        const copy = card.querySelector('[id^="feature-description-"]').getBoundingClientRect();
        return previews.every((preview, other) => other === index || Math.min(copy.right, preview.right) - Math.max(copy.left, preview.left) <= 1 || Math.min(copy.bottom, preview.bottom) - Math.max(copy.top, preview.top) <= 1);
      });
    }), 'No-JS descriptions do not overlap another card').toBe(true);
    await noOverflow(staticRun.page);
    await staticRun.context.close();
  }
  expect(errors, 'No runtime errors in feature scenarios').toEqual([]);
  console.log(`Passed (${browserType.name()}): whole-dialog card-origin entry/exit and interrupted opening on desktop/mobile, all feature cards, accessible names/descriptions, wrapping arrows/dots/keyboard, directional whole-feature swipes with image/copy/navigation in lockstep, bounded latest-intent queue, reverse/resize/reduced-motion/close cleanup, rapid input and reopen, native focus containment/Escape/backdrop, focus and scroll restoration, resize/mobile/tablet/short desktop, reduced motion/live cancellation, CMS 1/12 items and long copy, no-JS fallback, local simulations, no overflow and axe.`);
} finally {
  await browser.close();
}
