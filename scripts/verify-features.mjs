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
  await expect(modal.locator(':scope > [data-feature-navigation]')).toHaveCount(1);
  await expect(modal.locator('[data-feature-slide] [data-feature-navigation]')).toHaveCount(0);
  await expect(modal.locator('[data-feature-count], [data-feature-dot], .feature-modal-paging, .feature-modal-dots')).toHaveCount(0);
  await expect(page.locator(`#feature-dialog-title-${index}`)).toBeVisible();
  await expect(page.locator(`#feature-dialog-description-${index}`)).toBeVisible();
  if (count === 6) await expect(page.locator(`#feature-dialog-description-${index}`)).toHaveText(seed.features.items[index].description);
  if (count === 1) {
    await expect(modal.locator('[data-feature-navigation]')).toBeHidden();
    expect(await modal.locator('[data-feature-prev], [data-feature-next]').evaluateAll((buttons) => buttons.length === 2 && buttons.every((button) => button.disabled))).toBe(true);
  } else {
    await expect(modal.locator('[data-feature-navigation]')).toBeVisible();
    expect(await modal.locator('[data-feature-prev], [data-feature-next]').evaluateAll((buttons) => buttons.length === 2 && buttons.every((button) => !button.disabled))).toBe(true);
  }
}

async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth), 'No horizontal document overflow').toBe(await page.evaluate(() => document.documentElement.clientWidth));
}

async function controlsVisible(page) {
  const modal = dialog(page);
  const slideCount = await modal.locator('[data-feature-slide]').count();
  const navigation = modal.locator('[data-feature-navigation]');
  await expect(navigation).toHaveCount(1);
  if (slideCount === 1) {
    await expect(navigation).toBeHidden();
    expect(await modal.locator('[data-feature-prev], [data-feature-next]').evaluateAll((buttons) => buttons.length === 2 && buttons.every((button) => button.disabled))).toBe(true);
  } else {
    await expect(navigation).toBeVisible();
  }
  const controls = [modal.locator('[data-feature-close]')];
  if (slideCount > 1) controls.push(modal.locator('[data-feature-prev]'), modal.locator('[data-feature-next]'));
  for (const control of controls) {
    await expect(control).toBeVisible();
    expect(await control.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width >= 44 && rect.height >= 44 && rect.left >= -1 && rect.right <= innerWidth + 1
        && rect.top >= -1 && rect.bottom <= innerHeight + 1;
    }), 'Modal controls meet touch size and viewport bounds').toBe(true);
  }
  await noOverflow(page);
}

async function edgeNavigationGeometry(page) {
  const geometry = await dialog(page).evaluate((modal) => {
    const navigation = modal.querySelector('[data-feature-navigation]');
    const previous = navigation.querySelector('[data-feature-prev]');
    const next = navigation.querySelector('[data-feature-next]');
    const panel = modal.querySelector('[data-feature-panel]');
    const slides = modal.querySelector('[data-feature-pages]');
    const rect = (element) => {
      const { left, right, top, bottom, width, height } = element.getBoundingClientRect();
      return { left, right, top, bottom, width, height, centerX: (left + right) / 2, centerY: (top + bottom) / 2 };
    };
    const previousBox = rect(previous), nextBox = rect(next), modalBox = rect(modal);
    previousBox.borderRadius = Number.parseFloat(getComputedStyle(previous).borderTopLeftRadius);
    nextBox.borderRadius = Number.parseFloat(getComputedStyle(next).borderTopLeftRadius);
    const previousProbe = { x: previousBox.left + previousBox.width * .25, y: previousBox.centerY };
    const nextProbe = { x: nextBox.right - nextBox.width * .25, y: nextBox.centerY };
    const targetAt = (point) => document.elementFromPoint(point.x, point.y)?.closest('button');
    const width = innerWidth;
    const expectedWidth = width < 600 ? width - 32 : Math.min(width >= 900 ? 1360 : 660, width - (width >= 900 ? 160 : 128));
    return {
      parentIsDialog: navigation.parentElement === modal,
      directChild: [...modal.children].includes(navigation),
      noCountOrDots: !modal.querySelector('[data-feature-count], [data-feature-dot], .feature-modal-paging, .feature-modal-dots'),
      modalOverflow: getComputedStyle(modal).overflowX,
      panelOverflow: getComputedStyle(panel).overflowX,
      panelRadius: Number.parseFloat(getComputedStyle(panel).borderTopLeftRadius),
      modalBox, panelBox: rect(panel), slidesBox: rect(slides), previousBox, nextBox,
      expectedWidth, viewportWidth: width,
      buttonRadius: Number.parseFloat(getComputedStyle(modal).getPropertyValue('--button-radius')),
      previousOuterHalfHits: targetAt(previousProbe) === previous,
      nextOuterHalfHits: targetAt(nextProbe) === next,
      previousProbe, nextProbe,
      previousProbeInViewport: previousProbe.x >= 0 && previousProbe.x < innerWidth,
      nextProbeInViewport: nextProbe.x >= 0 && nextProbe.x < innerWidth,
    };
  });
  expect(geometry.parentIsDialog && geometry.directChild, 'Navigation stays a direct dialog child').toBe(true);
  expect(geometry.noCountOrDots, 'The modal has no counter or pagination dots').toBe(true);
  expect(geometry.modalOverflow, 'Dialog overflow stays visible for edge controls').toBe('visible');
  expect(['hidden', 'clip'].includes(geometry.panelOverflow), 'The panel clips moving slides').toBe(true);
  expect(geometry.panelRadius, 'The clipped panel keeps rounded corners').toBeGreaterThan(0);
  expect(Math.abs(geometry.modalBox.width - geometry.expectedWidth), 'Modal width preserves its responsive outer gutters').toBeLessThanOrEqual(2);
  for (const [side, button] of [
    ['previous', geometry.previousBox],
    ['next', geometry.nextBox],
  ]) {
    const expectedSize = geometry.viewportWidth < 900 ? 44 : 48;
    expect(Math.abs(button.width - expectedSize), `${side} arrow has the expected touch diameter`).toBeLessThanOrEqual(1);
    expect(Math.abs(button.height - expectedSize), `${side} arrow has the expected touch height`).toBeLessThanOrEqual(1);
    expect(button.borderRadius, `${side} arrow uses the shared button radius`).toBe(geometry.buttonRadius);
    if (geometry.viewportWidth < 600) {
      expect(button.top - geometry.panelBox.bottom, `${side} arrow sits below the panel`).toBeGreaterThanOrEqual(11);
    } else {
      const gap = side === 'previous' ? geometry.panelBox.left - button.right : button.left - geometry.panelBox.right;
      expect(gap, `${side} arrow sits fully outside the panel`).toBeGreaterThanOrEqual(7);
      expect(Math.abs(button.centerY - geometry.modalBox.centerY), `${side} arrow is centered on the full modal`).toBeLessThanOrEqual(2);
    }
    expect(button.left >= -1 && button.right <= geometry.viewportWidth + 1,
      `${side} arrow stays inside the viewport: ${JSON.stringify(button)}`).toBe(true);
  }
  expect(geometry.previousProbeInViewport && geometry.nextProbeInViewport, 'Both external arrows remain inside the viewport').toBe(true);
  expect(geometry.previousOuterHalfHits, 'The outer half of the previous arrow receives pointer hits').toBe(true);
  expect(geometry.nextOuterHalfHits, 'The outer half of the next arrow receives pointer hits').toBe(true);
  return geometry;
}

async function hitTestEdgeNavigation(page, currentIndex, count = 6) {
  const geometry = await edgeNavigationGeometry(page);
  await page.mouse.click(geometry.previousProbe.x, geometry.previousProbe.y);
  await selected(page, (currentIndex + count - 1) % count, count,
    count === 6 ? seed.features.items[(currentIndex + count - 1) % count]?.title : `Published feature ${(currentIndex + count - 1) % count + 1}`);
  await page.mouse.click(geometry.nextProbe.x, geometry.nextProbe.y);
  await selected(page, currentIndex, count,
    count === 6 ? seed.features.items[currentIndex]?.title : `Published feature ${currentIndex + 1}`);
  await expect.poll(() => dialog(page).evaluate((element) => element.getAnimations({ subtree: true })
    .filter((animation) => animation.constructor.name === 'Animation' && ['running', 'paused'].includes(animation.playState)).length)).toBe(0);
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
    const navigationBox = box(navigation);
    const previousBox = box(navigation.querySelector('[data-feature-prev]'));
    const nextBox = box(navigation.querySelector('[data-feature-next]'));
    const before = {
      slide: beforeSlide.getBoundingClientRect().left,
      media: left(beforeSlide, '[data-feature-modal-media]'),
      picture: left(beforeSlide, 'picture, [data-placeholder-variant="feature"]'),
      copy: left(beforeSlide, '[data-feature-copy]'),
      description: left(beforeSlide, '.feature-modal-description'),
      close: box(element.querySelector('[data-feature-close]')),
      navigationBox,
      previousBox,
      nextBox,
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
      before,
      incoming: slide.getBoundingClientRect().left - before.slide,
      outgoing: outgoing ? outgoing.getBoundingClientRect().left - before.slide : null,
      displacements: {
        media: left(slide, '[data-feature-modal-media]') - before.media,
        picture: left(slide, 'picture, [data-placeholder-variant="feature"]') - before.picture,
        copy: left(slide, '[data-feature-copy]') - before.copy,
        description: left(slide, '.feature-modal-description') - before.description,
      },
      outgoingDisplacements: outgoing ? {
        media: left(outgoing, '.feature-modal-media') - before.media,
        picture: left(outgoing, 'picture, [data-placeholder-variant="feature"]') - before.picture,
        copy: left(outgoing, '.feature-modal-copy') - before.copy,
        description: left(outgoing, '.feature-modal-description') - before.description,
      } : null,
      opacity: [slide, copy, slide.querySelector('.feature-modal-description'), slide.querySelector('picture, [data-placeholder-variant="feature"]'), slide.querySelector('[data-feature-modal-media]'),
        outgoing, outgoing?.querySelector('.feature-modal-copy'), outgoing?.querySelector('picture, [data-placeholder-variant="feature"]'), outgoing?.querySelector('.feature-modal-media')]
        .map((item) => item ? Number(getComputedStyle(item).opacity) : null),
      ownership: animations.map((animation) => animation.effect.target === slide ? 'incoming' : animation.effect.target === outgoing ? 'outgoing' : 'child'),
      clipped: ['hidden', 'clip'].includes(getComputedStyle(frame).overflowX),
      close: { before: before.close, after: box(element.querySelector('[data-feature-close]')) },
      navigationIdentity: element.querySelector('[data-feature-navigation]') === navigation,
      navigationParentIsDialog: navigation.parentElement === element,
      navigationBox: box(navigation),
      previousBox: box(navigation.querySelector('[data-feature-prev]')),
      nextBox: box(navigation.querySelector('[data-feature-next]')),
      triggerFocused: document.activeElement === trigger,
      staleControls: Boolean(element.querySelector('[data-feature-count], [data-feature-dot], .feature-modal-paging, .feature-modal-dots')),
      layers: layers.map((layer) => ({ kind: layer.dataset.featureMotionLayer,
        inert: layer.inert, hidden: layer.getAttribute('aria-hidden'), ids: layer.querySelectorAll('[id]').length + Number(layer.hasAttribute('id')),
        media: layer.querySelectorAll('.feature-modal-media').length, copy: layer.querySelectorAll('.feature-modal-copy').length,
        navigation: layer.querySelectorAll('[data-feature-navigation]').length, liveHooks: layer.querySelectorAll('[data-feature-navigation], [data-feature-count], [data-feature-prev], [data-feature-next], [data-feature-dot]').length })),
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
    expect(Math.abs(displacement - motion.incoming), `Incoming ${part} moves with the whole slide (part ${displacement.toFixed(2)}px, slide ${motion.incoming.toFixed(2)}px)`).toBeLessThanOrEqual(1);
  }
  for (const [part, displacement] of Object.entries(motion.outgoingDisplacements || {})) {
    expect(Math.abs(displacement - motion.outgoing), `Outgoing ${part} moves with the whole slide (part ${displacement.toFixed(2)}px, slide ${motion.outgoing.toFixed(2)}px)`).toBeLessThanOrEqual(1);
  }
  expect(motion.opacity, 'Media and copy retain full opacity during the swipe').toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
  expect(motion.ownership.sort(), 'Only the incoming and outgoing whole slides own motion').toEqual(['incoming', 'outgoing']);
  expect(motion.clipped, 'Both complete features stay inside the shared clipped viewport').toBe(true);
  expect(motion.close.after, 'Close remains stationary while navigation swipes').toEqual(motion.close.before);
  expect(motion.navigationIdentity && motion.navigationParentIsDialog, 'The same navigation remains fixed as a direct dialog child').toBe(true);
  expect(motion.navigationBox, 'Navigation stays fixed during slide movement').toEqual(motion.before.navigationBox);
  expect(motion.previousBox, 'Previous arrow stays fixed during slide movement').toEqual(motion.before.previousBox);
  expect(motion.nextBox, 'Next arrow stays fixed during slide movement').toEqual(motion.before.nextBox);
  expect(motion.triggerFocused, 'Focused navigation control retains focus').toBe(true);
  expect(motion.staleControls, 'The modal has no counter or dots').toBe(false);
  expect(motion.layers.map((layer) => layer.kind)).toEqual(['slide']);
  for (const layer of motion.layers) expect(layer, 'Outgoing visual copy contains the media and copy without cloned controls').toMatchObject({ inert: true, hidden: 'true', ids: 0, media: 1, copy: 1, navigation: 0, liveHooks: 0 });
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
  await page.keyboard.press('End');
  await settled(page, 5);
  await expect(dialog(page).locator('[data-feature-next]')).toBeFocused();
  await page.keyboard.press('Home');
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
  expect(rapid.focused, 'The same fixed live arrow keeps focus through queued transitions').toBe(true);

  await page.keyboard.press('Home');
  await settled(page, 0);
  await dialog(page).evaluate((element) => {
    element.querySelector('[data-feature-next]').click();
    element.querySelector('[data-feature-prev]').click();
  });
  await settled(page, 0);
  await dialog(page).evaluate((element) => {
    element.querySelector('[data-feature-next]').click();
    element.querySelector('[data-feature-next]').click();
    element.querySelector('[data-feature-next]').click();
    element.querySelector('[data-feature-prev]').click();
  });
  await settled(page, 2);

  await dialog(page).evaluate((element) => {
    element.querySelector('[data-feature-next]').click();
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
    element.querySelector('[data-feature-next]').click();
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
  await expect(root.locator('[data-feature-card-media] [data-feature-preview]')).toHaveCount(6);
  await expect(root.locator('video[data-feature-video]')).toHaveCount(12);
  await expect(root.locator('[data-feature-playback]')).toHaveCount(0);
  await expect(root.locator('[data-feature-count], [data-feature-dot], .feature-modal-paging, .feature-modal-dots')).toHaveCount(0);
  await expect(root.locator('[data-feature-gif], img[src$=".gif"], img[src*=".gif?"]')).toHaveCount(0);
  for (const image of await root.locator('img').all()) {
    for (const source of [await image.getAttribute('src')].filter(Boolean)) {
      expect(new URL(source, url).origin, 'Feature imagery stays local').toBe(new URL(url).origin);
    }
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
  await page.keyboard.press('Home');
  await selected(page, 0);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
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
  await settled(page, 2);
  await dialog(page).locator('[data-feature-next]').focus();
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

  for (const viewport of [
    { width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 },
    { width: 1440, height: 500 }, { width: 1920, height: 1080 },
    { width: 568, height: 320 }, { width: 844, height: 390 }, { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await settled(page, 1);
    await controlsVisible(page);
    await hitTestEdgeNavigation(page, 1);
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
      const navigation = root.querySelector('[data-feature-navigation]').cloneNode(true);
      const arrows = navigation.querySelector('.feature-modal-arrows');
      if (arrows) navigation.replaceChildren(arrows);
      navigation.querySelectorAll('[data-feature-count], [data-feature-dot], .feature-modal-dots').forEach((element) => element.remove());
      navigation.querySelectorAll('[hidden], [disabled]').forEach((element) => { element.hidden = false; element.disabled = false; });
      slideTemplate.querySelector('[data-feature-navigation]')?.remove();
      const dialog = root.querySelector('#feature-dialog');
      root.querySelector('[data-feature-navigation]')?.remove();
      dialog.append(navigation);
      root.querySelectorAll('[data-feature-card]').forEach((element) => element.remove());
      root.querySelectorAll('[data-feature-slide]').forEach((element) => element.remove());
      for (let index = 0; index < count; index++) {
        const card = cardTemplate.cloneNode(true), slide = slideTemplate.cloneNode(true);
        const opener = card.querySelector('[data-feature-open]');
        opener.dataset.featureOpen = String(index); opener.setAttribute('href', `#feature-description-${index}`);
        opener.setAttribute('aria-labelledby', `feature-title-${index}`);
        card.querySelector('[id^="feature-title-"]').id = `feature-title-${index}`;
        card.querySelector('[id^="feature-description-"]').id = `feature-description-${index}`;
        slide.querySelector('[id^="feature-dialog-title-"]').id = `feature-dialog-title-${index}`;
        slide.querySelector('[id^="feature-dialog-description-"]').id = `feature-dialog-description-${index}`;
        slide.id = `feature-slide-${index}`;
        slide.dataset.featureSlide = String(index);
        slide.hidden = index !== 0;
        const title = `Published feature ${index + 1}`;
        slide.querySelector('[id^="feature-dialog-title-"]').textContent = title;
        const description = longCopy ? 'Published feature context with enough detail to require scrolling. '.repeat(40).slice(0, 2000) : `Published feature description ${index + 1}`;
        slide.querySelector('[id^="feature-dialog-description-"]').textContent = description;
        card.querySelector('[id^="feature-description-"]').textContent = description;
        cards.append(card); slides.append(slide);
      }
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
      await expect.poll(() => dialog(fixture.page).evaluate((element) => element.getAnimations({ subtree: true })
        .filter((animation) => animation.constructor.name === 'Animation' && ['running', 'paused'].includes(animation.playState)).length)).toBe(0);
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
        await expect(dialog(fixture.page).locator('[data-feature-navigation]')).toBeHidden();
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
        await fixture.page.keyboard.press('Home');
        await selected(fixture.page, 0, count, 'Published feature 1');
        await fixture.page.keyboard.press('End');
        await selected(fixture.page, count - 1, count, `Published feature ${count}`);
        await fixture.page.keyboard.press('ArrowRight');
        await selected(fixture.page, 0, count, 'Published feature 1');
        await fixture.page.keyboard.press('ArrowLeft');
        await selected(fixture.page, count - 1, count, `Published feature ${count}`);
        await hitTestEdgeNavigation(fixture.page, count - 1, count);
      }
      if (count > 1 && !longCopy) await fixture.page.keyboard.press('Home');
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
  console.log(`Passed (${browserType.name()}): whole-dialog card-origin entry/exit and interrupted opening on desktop/mobile, all feature cards, accessible names/descriptions, wrapping arrows and Home/End keyboard navigation, fixed edge controls with outer-half hit testing, directional whole-feature swipes with image/copy in lockstep, bounded latest-intent queue, reverse/resize/reduced-motion/close cleanup, rapid input and reopen, native focus containment/Escape/backdrop, focus and scroll restoration, portrait/landscape modal geometry, CMS 1/12 items and long copy, no-JS fallback, local app captures, no overflow and axe.`);
} finally {
  await browser.close();
}
