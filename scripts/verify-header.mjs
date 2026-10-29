import { chromium, firefox, webkit, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const url = process.env.VERIFY_URL || 'http://127.0.0.1:4322';
const browserTypes = { chromium, webkit, firefox };
const requested = process.env.VERIFY_BROWSERS?.split(',').map((name) => name.trim()).filter(Boolean)
  ?? ['chromium', 'webkit'];
const browsers = requested.map((name) => {
  if (!browserTypes[name]) throw new Error(`Unsupported browser in VERIFY_BROWSERS: ${name}`);
  return browserTypes[name];
});
const darkSurface = '#102b46';
const lightSurface = '#f1ddc2';
const graySurface = (channel) => `rgb(${channel}, ${channel}, ${channel})`;
const targets = '.wordmark, .product-fallback, .navigation-link, .product-menu > summary, .header-source, .mobile-navigation > summary';

await mkdir('artifacts', { recursive: true });

const rgb = (value) => {
  if (/^#[\da-f]{3}$/i.test(value)) return value.slice(1).split('').map((channel) => Number.parseInt(channel.repeat(2), 16));
  if (/^#[\da-f]{6}$/i.test(value)) return value.slice(1).match(/.{2}/g).map((channel) => Number.parseInt(channel, 16));
  const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length < 3) throw new Error(`Could not read RGB color: ${value}`);
  return value.startsWith('color(srgb ') ? channels.map((channel) => channel * 255) : channels;
};
const luminance = (color) => rgb(color).reduce((sum, channel, index) => {
  const value = channel / 255;
  return sum + (value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][index];
}, 0);
const contrastRatio = (foreground, background) => {
  const first = luminance(foreground), second = luminance(background);
  return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
};
const toneOf = (color) => {
  if (typeof color !== 'string' || !/^(?:#|rgb|color\(srgb )/i.test(color.trim())) return null;
  color = color.trim();
  const body = color.slice(color.indexOf('(') + 1, color.lastIndexOf(')'));
  const alphaValue = body.includes('/') ? body.split('/').at(-1).trim()
    : color.startsWith('rgba(') ? body.split(',').at(-1).trim() : '1';
  const alpha = Number(alphaValue.replace('%', '')) / (alphaValue.endsWith('%') ? 100 : 1);
  if (alpha < .999) return null;
  const channels = rgb(color);
  if (channels.every((channel) => channel === 0)) return 'dark';
  if (channels.every((channel) => channel === 255)) return 'light';
  return null;
};
const colorAlpha = (color) => {
  if (color === 'transparent') return 0;
  const body = color.slice(color.indexOf('(') + 1, color.lastIndexOf(')'));
  const alphaValue = body.includes('/') ? body.split('/').at(-1).trim()
    : color.startsWith('rgba(') ? body.split(',').at(-1).trim() : '1';
  const alpha = Number(alphaValue.replace('%', ''));
  return alpha / (alphaValue.endsWith('%') ? 100 : 1);
};
const compositeColor = (foreground, background) => {
  const alpha = colorAlpha(foreground);
  const front = rgb(foreground), back = rgb(background);
  return `rgb(${front.map((channel, index) => channel * alpha + back[index] * (1 - alpha)).join(' ')})`;
};
const effectiveSurface = (color, scrolled) => scrolled
  ? `rgb(${rgb(color).map((channel) => channel * .94 + 255 * .06).join(' ')})` : color;
const effectiveGray = (channel, scrolled) => scrolled ? channel * .94 + 255 * .06 : channel;

async function installFrameProbe(page) {
  await page.addInitScript(() => {
    const native = window.requestAnimationFrame.bind(window);
    window.__headerAnimationRequests = [];
    window.requestAnimationFrame = (callback) => {
      const stack = new Error().stack || '';
      if (stack.includes('/src/components/header-contrast.ts')) {
        window.__headerAnimationRequests.push({ at: performance.now(), stack });
      }
      return native(callback);
    };
  });
}

async function twoFrames(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function setSurfaces(page, colors) {
  await page.evaluate((values) => {
    const fixture = document.querySelector('#verify-header-surfaces');
    if (!fixture) throw new Error('Header background fixture is missing');
    [...fixture.children].forEach((surface, index) => { surface.style.backgroundColor = values[index]; });
    window.dispatchEvent(new Event('scroll'));
  }, colors);
}

async function addSurfaces(page) {
  await page.locator('.site-header').evaluate((header) => {
    const fixture = document.createElement('div');
    fixture.id = 'verify-header-surfaces';
    fixture.setAttribute('aria-hidden', 'true');
    fixture.style.cssText = `position:fixed;inset:0 0 auto;height:${header.getBoundingClientRect().height + 12}px;display:grid;grid-template-columns:1fr 1fr;z-index:${Number(getComputedStyle(header).zIndex) - 1}`;
    for (const color of ['#102b46', '#f1ddc2']) {
      const surface = document.createElement('div');
      surface.style.backgroundColor = color;
      fixture.append(surface);
    }
    document.body.append(fixture);
    window.dispatchEvent(new Event('scroll'));
  });
  await twoFrames(page);
}

async function visibleControls(page) {
  return page.locator(`.site-header ${targets}`).evaluateAll((elements) => elements
    .filter((element) => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden')
    .map((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        selector: element.className || element.tagName.toLowerCase(),
        x: bounds.left + bounds.width / 2,
        style: getComputedStyle(element).getPropertyValue('--adaptive-ink').trim(),
        color: getComputedStyle(element).color,
        contrast: element.dataset.contrast,
      };
    }));
}

function expectBinaryContrast(color, background, message) {
  expect(toneOf(color), `${message}: rendered ink is pure black or white`).not.toBeNull();
  expect(contrastRatio(color, background), `${message}: rendered ink meets 4.5:1`).toBeGreaterThanOrEqual(4.5);
}

async function waitForSideTones(page, width, expectedLeft, expectedRight) {
  const leftTone = luminance(expectedLeft) < .5 ? 'light' : 'dark';
  const rightTone = luminance(expectedRight) < .5 ? 'light' : 'dark';
  await expect.poll(async () => {
    const controls = await visibleControls(page);
    const left = controls.filter((control) => control.x < width / 2 - 64);
    const right = controls.filter((control) => control.x > width / 2 + 64);
    return {
      leftCount: left.length,
      rightCount: right.length,
      leftTone: left.length > 0 && left.every((control) => toneOf(control.color) === leftTone
        && toneOf(control.style) === leftTone && control.contrast === leftTone),
      rightTone: right.length > 0 && right.every((control) => toneOf(control.color) === rightTone
        && toneOf(control.style) === rightTone && control.contrast === rightTone),
    };
  }, { message: `Visible controls locally adapt to ${expectedLeft} on the left and ${expectedRight} on the right` })
    .toEqual({ leftCount: expect.any(Number), rightCount: expect.any(Number), leftTone: true, rightTone: true });
  const controls = await visibleControls(page);
  const left = controls.filter((control) => control.x < width / 2 - 64);
  const right = controls.filter((control) => control.x > width / 2 + 64);
  expect(left.length, 'At least one control is sampled over the left surface').toBeGreaterThan(0);
  expect(right.length, 'At least one control is sampled over the right surface').toBeGreaterThan(0);
  for (const control of left) expectBinaryContrast(control.color, expectedLeft, 'Left fixture');
  for (const control of right) expectBinaryContrast(control.color, expectedRight, 'Right fixture');
}

async function readControl(page, selector) {
  return page.locator(selector).first().evaluate((element) => ({
    style: getComputedStyle(element).getPropertyValue('--adaptive-ink').trim(),
    color: getComputedStyle(element).color,
    contrast: element.dataset.contrast,
  }));
}

function expectControlContrast(control, background, message) {
  expectBinaryContrast(control.color, background, message);
  expect(toneOf(control.style), `${message}: computed --adaptive-ink matches a pure tone`).toBe(toneOf(control.color));
  expect(control.contrast, `${message}: data-contrast matches the rendered tone`).toBe(toneOf(control.color));
}

async function checkNoGlyphEffects(page) {
  const effects = await page.locator(`.site-header ${targets}`).evaluateAll((roots) => roots.flatMap((root) => {
    const elements = [root, ...root.querySelectorAll('*')];
    return elements.flatMap((element) => ['', '::before', '::after'].map((pseudo) => {
      const style = getComputedStyle(element, pseudo || null);
      return {
        selector: `${element.className || element.tagName.toLowerCase()}${pseudo}`,
        stroke: style.webkitTextStrokeWidth,
        shadow: style.textShadow,
        filter: style.filter,
      };
    }));
  }));
  expect(effects.filter((effect) => Number.parseFloat(effect.stroke) > 0
    || effect.shadow !== 'none' || effect.filter !== 'none'), 'Header glyphs have no adaptive strokes, shadows, or filters').toEqual([]);
}

async function checkGraySweep(page, browserName, surfaceName) {
  const scrolled = await page.locator('.site-header').evaluate((header) => header.hasAttribute('data-scrolled'));
  const channels = [...Array.from({ length: 51 }, (_, index) => index * 5), 255];
  for (const channel of channels) {
    await setSurfaces(page, [graySurface(channel), graySurface(channel)]);
    await twoFrames(page);
    const backdrop = graySurface(effectiveGray(channel, scrolled));
    const controls = await visibleControls(page);
    expect(controls.length, `Gray ${channel} has visible ${surfaceName} controls`).toBeGreaterThan(0);
    for (const control of controls) expectControlContrast(control, backdrop, `${surfaceName} gray ${channel}`);
  }
  await setSurfaces(page, [graySurface(99), graySurface(99)]);
  await twoFrames(page);
  await page.screenshot({ path: `artifacts/header-contrast-${browserName}-${surfaceName}-gray-099.png` });
  await checkNoGlyphEffects(page);
}

async function checkRealLaptopSurface(page, browserName) {
  await page.evaluate(() => document.querySelector('#verify-header-surfaces')?.remove());
  await page.locator('#workspace').evaluate((workspace) => {
    const bounds = workspace.getBoundingClientRect();
    const header = document.querySelector('.site-header').getBoundingClientRect();
    scrollTo({ top: scrollY + bounds.top + bounds.height / 2 - header.height / 2, behavior: 'instant' });
  });
  const github = '.site-header .header-source';
  await expect.poll(async () => {
    const control = await page.locator(github).evaluate((element) => ({
      contrast: element.dataset.contrast,
      ink: getComputedStyle(element).getPropertyValue('--adaptive-ink').trim(),
    }));
    return control.contrast === 'light' && toneOf(control.ink) === 'light';
  }, { message: 'GitHub control uses bright ink over the real laptop display after scrolling' }).toBe(true);

  const point = await page.locator(github).evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { x: Math.round(bounds.left + bounds.width / 2), y: Math.round(bounds.top + bounds.height / 2) };
  });
  const foreground = (await page.locator(github).evaluate((element) => getComputedStyle(element).color));
  await page.locator('.header-inner').evaluate((inner) => { inner.style.opacity = '0'; });
  let background;
  try {
    const screenshot = await page.screenshot();
    const { data, info } = await sharp(screenshot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const channels = [];
    for (let y = point.y - 2; y <= point.y + 2; y++) for (let x = point.x - 2; x <= point.x + 2; x++) {
      const offset = (y * info.width + x) * info.channels;
      channels.push([...data.subarray(offset, offset + 3)]);
    }
    background = [0, 1, 2].map((index) => channels.reduce((sum, pixel) => sum + pixel[index], 0) / channels.length);
  } finally {
    await page.locator('.header-inner').evaluate((inner) => { inner.style.removeProperty('opacity'); });
  }
  expect(luminance(`rgb(${background.join(' ')})`), 'The underlying laptop pixels below GitHub are dark').toBeLessThan(.12);
  expect(contrastRatio(foreground, `rgb(${background.join(' ')})`), 'Rendered GitHub foreground contrasts with the actual laptop pixels').toBeGreaterThanOrEqual(4.5);
  await page.screenshot({ path: `artifacts/header-contrast-${browserName}-real-laptop-under-github.png` });
  console.log(`  real laptop at GitHub: pixel RGB ${background.map(Math.round).join(', ')}, foreground ${foreground}`);
}

async function checkRealFeatureSurface(page, browserName) {
  await page.evaluate(() => document.getElementById('verify-header-surfaces')?.remove());
  await page.setViewportSize({ width: 1440, height: 1000 });
  const selected = await page.evaluate(() => {
    const controls = [...document.querySelectorAll('.site-header .wordmark, .site-header .navigation-link, .site-header .header-source')]
      .filter((element) => element.getClientRects().length);
    const images = [...document.querySelectorAll('.feature-desktop')];
    const pairs = controls.flatMap((control, controlIndex) => {
      const controlBounds = control.getBoundingClientRect();
      const x = controlBounds.left + controlBounds.width / 2;
      return images.flatMap((image, imageIndex) => {
        const imageBounds = image.getBoundingClientRect();
        if (x < imageBounds.left || x > imageBounds.right || !imageBounds.width || !imageBounds.height) return [];
        const windowBounds = image.closest('.feature-capture').querySelector('.feature-window').getBoundingClientRect();
        const outsideWindow = x < windowBounds.left || x > windowBounds.right;
        return [{ controlIndex, imageIndex, outsideWindow, wordmark: control.matches('.wordmark'), xRatio: (x - imageBounds.left) / imageBounds.width }];
      });
    });
    const pair = pairs.sort((left, right) => Number(right.outsideWindow) - Number(left.outsideWindow)
      || Number(right.wordmark) - Number(left.wordmark))[0];
    if (!pair) throw new Error('No visible header control overlaps a real feature desktop image');
    const control = controls[pair.controlIndex];
    const image = images[pair.imageIndex];
    const navigationIndex = [...document.querySelectorAll('.site-header .navigation-link')].indexOf(control);
    const controlBounds = control.getBoundingClientRect();
    const imageBounds = image.getBoundingClientRect();
    const localY = pair.outsideWindow ? .74 : .12;
    const pointY = controlBounds.top + controlBounds.height / 2;
    const documentImageTop = scrollY + imageBounds.top;
    scrollTo({ top: documentImageTop + imageBounds.height * localY - pointY, behavior: 'instant' });
    return {
      kind: pair.wordmark ? 'wordmark' : navigationIndex >= 0 ? 'navigation' : 'source',
      navigationIndex,
      imageIndex: pair.imageIndex,
    };
  });
  const wallpaper = page.locator('.feature-desktop').nth(selected.imageIndex);
  await expect.poll(() => wallpaper.evaluate((image) => image.complete && image.naturalWidth > 0), { message: 'Feature desktop wallpaper is loaded for pixel sampling' }).toBe(true);
  await twoFrames(page);
  const target = selected.kind === 'wordmark' ? page.locator('.site-header .wordmark')
    : selected.kind === 'navigation' ? page.locator('.site-header .navigation-link').nth(selected.navigationIndex)
      : page.locator('.site-header .header-source');
  const point = await target.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { x: Math.round(bounds.left + bounds.width / 2), y: Math.round(bounds.top + bounds.height / 2) };
  });
  const foreground = await target.evaluate((element) => getComputedStyle(element).color);
  const wallpaperFrame = await wallpaper.evaluate((image) => {
    const imageBounds = image.getBoundingClientRect();
    const panelBounds = image.closest('.feature-capture').querySelector('.feature-window').getBoundingClientRect();
    return {
      imageTop: imageBounds.top,
      imageBottom: imageBounds.bottom,
      panelTop: panelBounds.top,
      panelBottom: panelBounds.bottom,
      panelLeft: panelBounds.left,
      panelRight: panelBounds.right,
    };
  });
  expect(point.y, 'Header pixel sample is vertically over the feature wallpaper').toBeGreaterThan(wallpaperFrame.imageTop);
  expect(point.y, 'Header pixel sample is below the feature wallpaper').toBeLessThan(wallpaperFrame.imageBottom);
  expect(point.x >= wallpaperFrame.panelLeft && point.x <= wallpaperFrame.panelRight
    && point.y >= wallpaperFrame.panelTop && point.y <= wallpaperFrame.panelBottom,
  'Header pixel sample avoids the feature window').toBe(false);

  await page.locator('.header-inner').evaluate((inner) => { inner.style.opacity = '0'; });
  let background;
  try {
    const screenshot = await page.screenshot();
    const { data, info } = await sharp(screenshot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const channels = [];
    for (let y = point.y - 2; y <= point.y + 2; y++) for (let x = point.x - 2; x <= point.x + 2; x++) {
      const offset = (y * info.width + x) * info.channels;
      channels.push([...data.subarray(offset, offset + 3)]);
    }
    background = [0, 1, 2].map((index) => channels.reduce((sum, pixel) => sum + pixel[index], 0) / channels.length);
  } finally {
    await page.locator('.header-inner').evaluate((inner) => { inner.style.removeProperty('opacity'); });
  }
  const sampledSurface = `rgb(${background.join(' ')})`;
  await page.screenshot({ path: `artifacts/header-contrast-${browserName}-real-feature-wallpaper.png` });
  const featureContrast = contrastRatio(foreground, sampledSurface);
  console.log(`  feature wallpaper glass: pixel RGB ${background.map(Math.round).join(', ')}, foreground ${foreground}, contrast ${featureContrast.toFixed(2)}:1`);
  expect(luminance(sampledSurface), 'The feature wallpaper glass sample is a dark blue surface').toBeLessThan(.25);
  expect(featureContrast, 'Rendered header foreground contrasts with actual feature wallpaper glass pixels').toBeGreaterThanOrEqual(4.5);
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function waitForTone(page, selector, expectedTone, message) {
  await expect.poll(async () => {
    const frame = await readControl(page, selector);
    return toneOf(frame.color) === expectedTone && toneOf(frame.style) === expectedTone && frame.contrast === expectedTone;
  }, { message }).toBe(true);
}

async function checkImmediateReversal(page, selector, mode) {
  const scrolled = await page.locator('.site-header').evaluate((header) => header.hasAttribute('data-scrolled'));
  const sequence = [
    [darkSurface, 'light'],
    [lightSurface, 'dark'],
    [darkSurface, 'light'],
  ];
  for (const [surface, tone] of sequence) {
    await setSurfaces(page, [surface, surface]);
    await twoFrames(page);
    const control = await readControl(page, selector);
    expectControlContrast(control, effectiveSurface(surface, scrolled), `${mode} reversal on ${surface}`);
    expect(toneOf(control.color), `${mode} reversal reaches ${tone} ink within two frames`).toBe(tone);
  }
}

async function checkHoverContrast(page) {
  const scrolled = await page.locator('.site-header').evaluate((header) => header.hasAttribute('data-scrolled'));
  const link = page.locator('.site-header .navigation-link').first();
  for (const channel of [116, 118]) {
    await setSurfaces(page, [graySurface(channel), graySurface(channel)]);
    await twoFrames(page);
    await link.hover();
    await page.waitForTimeout(180);
    const control = await link.evaluate((element) => ({
      style: getComputedStyle(element).getPropertyValue('--adaptive-ink').trim(),
      color: getComputedStyle(element).color,
      contrast: element.dataset.contrast,
      background: getComputedStyle(element).backgroundColor,
    }));
    const backdrop = graySurface(effectiveGray(channel, scrolled));
    expectControlContrast(control, compositeColor(control.background, backdrop), `Hovered gray ${channel}`);
  }
  await page.mouse.move(0, 0);
  await checkNoGlyphEffects(page);
}

async function checkMenus(page, mobile) {
  const open = async () => {
    if (mobile) {
      const root = page.locator('#mobile-navigation > summary');
      await root.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#mobile-navigation')).toHaveAttribute('open', '');
      const product = page.locator('#mobile-product > summary');
      await product.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#mobile-product')).toHaveAttribute('open', '');
    } else {
      const summary = page.locator('#product-menu > summary');
      await summary.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#product-menu')).toHaveAttribute('open', '');
    }
  };
  const close = async () => {
    await page.keyboard.press('Escape');
    await expect(page.locator(mobile ? '#mobile-product' : '#product-menu')).not.toHaveAttribute('open', '');
    if (mobile) {
      await page.keyboard.press('Escape');
      await expect(page.locator('#mobile-navigation')).not.toHaveAttribute('open', '');
    }
  };
  const measure = async () => {
    const selector = mobile ? '.mobile-product-panel .product-link-title' : '.product-panel .product-link-title';
    const label = page.locator(selector).first();
    await expect(label).toBeVisible();
    return label.evaluate((element, isMobile) => {
      const foreground = getComputedStyle(element).color;
      const panel = element.closest(isMobile ? '.mobile-panel' : '.product-panel');
      return { foreground, background: getComputedStyle(panel).backgroundColor };
    }, mobile);
  };

  await open();
  const initial = await measure();
  const initialRatio = contrastRatio(initial.foreground, initial.background);
  expect(initialRatio, `${mobile ? 'Mobile' : 'Desktop'} product menu text meets 4.5:1 in its theme`).toBeGreaterThanOrEqual(4.5);
  await page.evaluate(() => scrollTo({ top: Math.min(420, document.documentElement.scrollHeight - innerHeight), behavior: 'instant' }));
  await twoFrames(page);
  expect(contrastRatio((await measure()).foreground, (await measure()).background), 'Open menu remains readable as page content scrolls behind it').toBeGreaterThanOrEqual(4.5);
  await close();
  await page.evaluate(() => scrollTo({ top: Math.min(240, document.documentElement.scrollHeight - innerHeight), behavior: 'instant' }));
  await twoFrames(page);
  await open();
  const reopened = await measure();
  expect(contrastRatio(reopened.foreground, reopened.background), 'Reopened menu retains its theme after scrolling').toBeGreaterThanOrEqual(4.5);
  await close();
}

async function checkMenuCloseContrast(page) {
  const target = '.site-header .navigation-link';
  await setSurfaces(page, [darkSurface, darkSurface]);
  await waitForTone(page, target, 'light', 'Dark backing surface selects white ink before opening the menu');
  const summary = page.locator('#product-menu > summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#product-menu')).toHaveAttribute('open', '');
  const menuInk = await page.locator('.site-header').evaluate((header) => getComputedStyle(header).color);
  await expect.poll(async () => {
    const actual = await page.locator(target).first().evaluate((element) => getComputedStyle(element).color);
    return Math.max(...rgb(actual).map((value, index) => Math.abs(value - rgb(menuInk)[index]))) < 2;
  }, { message: 'Open menu uses its authored theme color' }).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#product-menu')).not.toHaveAttribute('open', '');

  const frames = [await readControl(page, target)];
  for (let index = 0; index < 2; index++) {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    frames.push(await readControl(page, target));
  }
  for (const frame of frames) {
    expect(toneOf(frame.color), 'Closing the menu never renders intermediate gray ink').not.toBeNull();
    expect(toneOf(frame.style), 'Closing the menu keeps --adaptive-ink on a binary tone').toBe(toneOf(frame.color));
  }
  const scrolled = await page.locator('.site-header').evaluate((header) => header.hasAttribute('data-scrolled'));
  expectControlContrast(frames.at(-1), effectiveSurface(darkSurface, scrolled), 'Closed menu restores backdrop contrast within two frames');
  expect(toneOf(frames.at(-1).color), 'Closed menu returns to white ink within two frames').toBe('light');
}

async function verifyBrowser(browserType) {
  const browser = await browserType.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await installFrameProbe(page);
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await expect(page.locator('.site-header[data-navigation-ready]')).toBeVisible();
    await page.mouse.move(0, 0);
    await addSurfaces(page);
    const header = page.locator('.site-header');
    const desktopControl = '.navigation-link';
    const mobileControl = '#mobile-navigation > summary';

    // Two distant controls see opposite surfaces at the same time; swapping
    // the fixture proves the foreground follows each control's own backdrop.
    await waitForSideTones(page, 1440, darkSurface, lightSurface);
    await page.screenshot({ path: `artifacts/header-contrast-${browserType.name()}-desktop-local.png` });
    const desktopSides = await visibleControls(page);
    expect(desktopSides.some((control) => control.x < 650 && control.contrast === 'light'), 'Dark local surface updates the diagnostic label').toBe(true);
    expect(desktopSides.some((control) => control.x > 800 && control.contrast === 'dark'), 'Light local surface updates the diagnostic label').toBe(true);
    for (const control of desktopSides.filter((item) => item.x < 650)) expectControlContrast(control, darkSurface, 'Desktop dark fixture');
    for (const control of desktopSides.filter((item) => item.x > 800)) expectControlContrast(control, lightSurface, 'Desktop light fixture');
    await setSurfaces(page, [lightSurface, darkSurface]);
    await expect.poll(async () => {
      const controls = await visibleControls(page);
      const left = controls.filter((control) => control.x < 650);
      const right = controls.filter((control) => control.x > 800);
      return left.length > 0 && right.length > 0
        && left.every((control) => toneOf(control.color) === 'dark' && toneOf(control.style) === 'dark' && control.contrast === 'dark')
        && right.every((control) => toneOf(control.color) === 'light' && toneOf(control.style) === 'light' && control.contrast === 'light');
    }, { message: 'Swapping the desktop fixture reverses each local foreground response' }).toBe(true);

    await checkGraySweep(page, browserType.name(), 'desktop');
    await checkHoverContrast(page);
    await checkImmediateReversal(page, desktopControl, 'Normal motion');

    // A modal freezes surface sampling and ink writes until it closes.
    const beforeDialog = await visibleControls(page);
    await page.evaluate(() => {
      const dialog = document.createElement('dialog');
      dialog.id = 'verify-header-dialog';
      dialog.textContent = 'Modal sampling pause';
      document.body.append(dialog);
      dialog.showModal();
    });
    await setSurfaces(page, [darkSurface, darkSurface]);
    await page.waitForTimeout(180);
    const duringDialog = await visibleControls(page);
    expect(duringDialog.map(({ style, contrast }) => ({ style, contrast })), 'Foreground state is frozen while a native dialog is open')
      .toEqual(beforeDialog.map(({ style, contrast }) => ({ style, contrast })));
    await page.evaluate(() => document.querySelector('#verify-header-dialog').close());
    await waitForTone(page, desktopControl, 'light', 'Header resumes adapting after the native dialog closes');
    await page.locator('#verify-header-dialog').evaluate((element) => element.remove());

    // Menu surfaces use their authored theme instead of the page behind them.
    await setSurfaces(page, [lightSurface, darkSurface]);
    await checkMenus(page, false);
    await checkMenuCloseContrast(page);
    await checkRealFeatureSurface(page, browserType.name());
    await checkRealLaptopSurface(page, browserType.name());

    // Settled state should have neither ink style writes nor another header
    // animation frame queued. Other page animation frames are excluded by
    // source stack so the probe stays specific to this component.
    await waitForTone(page, desktopControl, 'dark', 'Desktop surface settles before idle observation');
    await page.evaluate(async () => {
      const header = document.querySelector('.site-header');
      let writes = 0, requests = window.__headerAnimationRequests.length;
      let lastActivity = performance.now();
      const observer = new MutationObserver((records) => { writes += records.length; lastActivity = performance.now(); });
      observer.observe(header, { subtree: true, attributes: true, attributeFilter: ['style'] });
      const started = performance.now();
      try {
        while (performance.now() - started < 3000) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          const currentRequests = window.__headerAnimationRequests.length;
          if (currentRequests !== requests) { requests = currentRequests; lastActivity = performance.now(); }
          if (performance.now() - lastActivity >= 220) return;
        }
        throw new Error(`Header did not settle within 3000ms (frames ${requests}, style writes ${writes})`);
      } finally {
        observer.disconnect();
      }
    });
    await page.evaluate(() => {
      const header = document.querySelector('.site-header');
      window.__headerStyleWrites = 0;
      window.__headerAnimationRequests.length = 0;
      window.__headerStyleObserver = new MutationObserver((records) => { window.__headerStyleWrites += records.length; });
      window.__headerStyleObserver.observe(header, { subtree: true, attributes: true, attributeFilter: ['style'] });
    });
    await page.waitForTimeout(350);
    const idle = await page.evaluate(() => {
      window.__headerStyleObserver.disconnect();
      return { frames: window.__headerAnimationRequests.length, writes: window.__headerStyleWrites, sources: window.__headerAnimationRequests.map((request) => request.stack) };
    });
    if (idle.frames) console.log('  idle header frame sources:', JSON.stringify(idle.sources));
    expect(idle.frames, 'No header-owned animation frames are requested while settled').toBe(0);
    expect(idle.writes, 'No header descendant styles are rewritten while settled').toBe(0);

    // Mobile controls independently adapt across the same split and the menu
    // retains its paper theme when reopened after scrolling.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.mouse.move(0, 0);
    await addSurfaces(page);
    await twoFrames(page);
    await setSurfaces(page, [darkSurface, lightSurface]);
    await waitForSideTones(page, 390, darkSurface, lightSurface);
    await page.screenshot({ path: `artifacts/header-contrast-${browserType.name()}-mobile-local.png` });
    const mobileSummaryInk = await readControl(page, mobileControl);
    const mobileScrolled = await header.evaluate((element) => element.hasAttribute('data-scrolled'));
    expectControlContrast(mobileSummaryInk, effectiveSurface(lightSurface, mobileScrolled), 'Mobile menu over its local light surface');
    expect(toneOf(mobileSummaryInk.color), 'Mobile menu control on the right uses black ink over the light fixture').toBe('dark');
    await checkGraySweep(page, browserType.name(), 'mobile');
    await setSurfaces(page, [lightSurface, darkSurface]);
    await waitForTone(page, mobileControl, 'light', 'Mobile menu control switches to white ink over its local dark surface');
    await checkMenus(page, true);

    // Reduced motion keeps the same immediate, binary response and reversal.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await checkImmediateReversal(page, mobileControl, 'Reduced motion');
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    expect(errors, 'Page has no uncaught JavaScript errors').toEqual([]);
    console.log(`PASS ${browserType.name()}: local binary desktop/mobile tone, gray contrast sweep, hover contrast, two-frame reversals, glyph-effect absence, native dialog freeze/resume, themed menu scroll/reopen and close, real wallpaper/laptop pixels, reduced motion, and idle frame/style-write checks (${JSON.stringify(idle)})`);
  } finally {
    await context.close();
    await browser.close();
  }
}

let failures = 0;
for (const browserType of browsers) {
  try {
    await verifyBrowser(browserType);
  } catch (error) {
    failures++;
    console.error(`FAIL ${browserType.name()}: ${error.stack || error}`);
  }
}
if (failures) process.exitCode = 1;
if (!requested.includes('firefox')) console.log('SKIP firefox: not requested (set VERIFY_BROWSERS=chromium,webkit,firefox to include it)');
