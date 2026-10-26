import { chromium, firefox, webkit, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const url = new URL(process.env.VERIFY_URL || 'http://127.0.0.1:4322/');
const browserType = { chromium, firefox, webkit }[process.env.VERIFY_BROWSER || 'chromium'];
if (!browserType) throw new Error(`Unknown VERIFY_BROWSER: ${process.env.VERIFY_BROWSER}`);
const browser = await browserType.launch();
const errors = [];
const viewports = [
  { width: 320, height: 568 },
  { width: 320, height: 480 },
  { width: 360, height: 568 },
  { width: 360, height: 640 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1024, height: 1366 },
  { width: 560, height: 315 },
  { width: 568, height: 320 },
  { width: 640, height: 360 },
  { width: 844, height: 390 },
  { width: 1024, height: 576 },
  { width: 560, height: 600 },
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1440, height: 810 },
  { width: 1536, height: 864 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 3840, height: 2160 },
];
const wallpaperAsset = /clouds/i;
const productAsset = /laptop-concrete/i;
await mkdir('artifacts/hero-scene', { recursive: true });

async function open({ query = '', fragment = '', javaScriptEnabled = true, viewport = { width: 1440, height: 1100 } } = {}) {
  const context = await browser.newContext({ viewport, javaScriptEnabled });
  await context.addInitScript(() => {
    try { localStorage.setItem('lomi.cookie-consent', JSON.stringify({ version: 1, externalMedia: false, savedAt: Date.now() })); } catch { /* Storage can be unavailable in restricted browsers. */ }
  });
  const page = await context.newPage();
  const pageErrors = [];
  const requests = [];
  page.on('pageerror', (error) => { errors.push(error.message); pageErrors.push(error.message); });
  page.on('request', (request) => requests.push(request.url()));
  await page.route('https://api.github.com/**', (route) => route.fulfill({ contentType: 'application/json', body: '[]' }));
  await page.goto(new URL(`${query}${fragment}`, url).href, { waitUntil: 'networkidle' });
  if (javaScriptEnabled) await page.evaluate(() => document.fonts.ready);
  return { context, page, pageErrors, requests };
}

async function imageState(locator) {
  return locator.evaluate(async (image) => {
    await image.decode();
    const picture = image.closest('picture');
    return {
      alt: image.alt,
      width: image.naturalWidth,
      height: image.naturalHeight,
      currentSrc: image.currentSrc,
      sourceHint: `${image.getAttribute('src') ?? ''} ${image.getAttribute('srcset') ?? ''} ${picture?.querySelector('source')?.getAttribute('srcset') ?? ''}`,
    };
  });
}

async function assertImageAsset(locator, expectedAsset, label) {
  const image = await imageState(locator);
  expect(image.width, `${label}: decoded image width`).toBeGreaterThan(0);
  expect(image.height, `${label}: decoded image height`).toBeGreaterThan(0);
  expect(new URL(image.currentSrc).origin, `${label}: image is hosted locally`).toBe(url.origin);
  expect(image.sourceHint, `${label}: uses the approved source asset`).toMatch(expectedAsset);
  return image;
}

async function projectedScreenGeometry(page) {
  return page.locator('#workspace svg.laptop-display polygon[data-screen-boundary]').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const matrix = element.getScreenCTM();
    const points = Array.from({ length: element.points.numberOfItems }, (_, index) => {
      const point = element.points.getItem(index);
      const projected = new DOMPoint(point.x, point.y).matrixTransform(matrix);
      return { x: projected.x, y: projected.y };
    });
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, right: bounds.right, bottom: bounds.bottom, points };
  });
}

async function assertProjectedScreen(page, label) {
  const source = page.locator('#workspace svg.laptop-display image[data-screen-source]');
  await expect(source, `${label}: projected screen source exists`).toHaveCount(1);
  const href = await source.getAttribute('href');
  expect(href, `${label}: projected screen has a source`).toBeTruthy();
  const absoluteHref = new URL(href, page.url()).href;
  if (/workbench/i.test(href)) expect(new URL(absoluteHref).origin, `${label}: fallback screen asset is local`).toBe(url.origin);
  const decoded = await page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight, currentSrc: image.currentSrc };
  }, absoluteHref);
  expect(decoded.width, `${label}: projected screenshot decodes`).toBeGreaterThan(0);
  expect(decoded.height, `${label}: projected screenshot decodes`).toBeGreaterThan(0);
  const boundary = page.locator('#workspace svg.laptop-display polygon[data-screen-boundary]');
  await expect(boundary, `${label}: screen boundary mesh exists`).toHaveCount(1);
  const geometry = await projectedScreenGeometry(page);
  expect(geometry.points.length, `${label}: screen mesh has polygon points`).toBeGreaterThanOrEqual(3);
  expect(geometry.width, `${label}: projected screen has visible width`).toBeGreaterThan(80);
  expect(geometry.height, `${label}: projected screen has visible height`).toBeGreaterThan(40);
  return { href, absoluteHref, geometry };
}

async function projectedScreenPixelDifference(page, label) {
  const group = page.locator('#workspace [data-laptop-screen]');
  const workspace = page.locator('#workspace');
  await expect(group, `${label}: projected screen group is present`).toHaveCount(1);
  const visible = await workspace.screenshot({ animations: 'disabled' });
  const originalVisibility = await group.evaluate((element) => element.style.visibility);
  await group.evaluate((element) => { element.style.visibility = 'hidden'; });
  let hidden;
  try {
    hidden = await workspace.screenshot({ animations: 'disabled' });
  } finally {
    await group.evaluate((element, visibility) => {
      if (visibility) element.style.visibility = visibility;
      else element.style.removeProperty('visibility');
    }, originalVisibility);
  }
  const first = await sharp(visible).resize(180, 120, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
  const second = await sharp(hidden).resize(180, 120, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
  let changed = 0;
  for (let offset = 0; offset < first.length; offset += 4) {
    const difference = Math.abs(first[offset] - second[offset])
      + Math.abs(first[offset + 1] - second[offset + 1])
      + Math.abs(first[offset + 2] - second[offset + 2]);
    if (difference > 30) changed++;
  }
  expect(changed, `${label}: decoded screenshot paints inside the laptop screen`).toBeGreaterThan(20);
}

async function heroSignature(page) {
  const hero = page.locator('section.hero.desktop-hero[aria-labelledby="hero-title"]');
  const wallpaper = await imageState(hero.locator('.hero-wallpaper img'));
  const product = await imageState(hero.locator('#workspace img'));
  const screenHref = await hero.locator('#workspace image[data-screen-source]').getAttribute('href');
  return page.evaluate(({ wallpaperSrc, productSrc, screenHref }) => {
    const heroElement = document.querySelector('section.hero.desktop-hero[aria-labelledby="hero-title"]');
    const normalize = (text) => text.replace(/\s+/g, ' ').trim();
    const link = (selector) => {
      const element = heroElement.querySelector(selector);
      return { text: normalize(element.textContent), href: element.getAttribute('href') };
    };
    return {
      heading: normalize(heroElement.querySelector('#hero-title').innerText),
      description: normalize(heroElement.querySelector('.hero-copy > p').textContent),
      primary: link('.hero-primary'),
      secondary: link('.hero-secondary'),
      wallpaper: wallpaperSrc,
      product: productSrc,
      productAlt: heroElement.querySelector('#workspace img').alt,
      workspaceRole: heroElement.querySelector('#workspace').getAttribute('role'),
      workspaceName: heroElement.querySelector('#workspace').getAttribute('aria-label'),
      screen: new URL(screenHref, location.href).pathname,
    };
  }, {
    wallpaperSrc: wallpaper.sourceHint.match(wallpaperAsset)?.[0].toLowerCase(),
    productSrc: product.sourceHint.match(productAsset)?.[0].toLowerCase(),
    screenHref,
  });
}

async function assertNoHeroLabArtifacts(run, label) {
  const counts = await run.page.evaluate(() => {
    const templates = Array.from(document.querySelectorAll('template'))
      .filter((template) => /hero|lab/i.test(`${template.id} ${template.className} ${template.getAttribute('data-hero') ?? ''}`)).length;
    return {
      concepts: document.querySelectorAll('[data-hero-concept], [data-hero-variant], [data-hero-lab], [class*="hero-lab"]').length,
      templates,
      pickers: document.querySelectorAll('[data-hero-picker], [data-hero-variant-switch], .hero-picker, #hero-picker, select[name*="hero"]').length,
      legacyLabUi: document.querySelectorAll('lomi-hero-lab, .hl-review-toolbar, .hl-picker, template[data-hero-template]').length,
      agents: document.querySelectorAll('.hero-dock, .hero-agent, [aria-label="Coding agents"]').length,
    };
  });
  expect(counts, `${label}: no dormant concepts, lab templates, pickers, review UI, or agent dock`).toEqual({ concepts: 0, templates: 0, pickers: 0, legacyLabUi: 0, agents: 0 });
  expect(run.requests.filter((request) => /hero-lab/i.test(new URL(request).pathname)), `${label}: no hero lab requests`).toEqual([]);
  expect(run.requests.filter((request) => /\/agents\//i.test(new URL(request).pathname)), `${label}: no agent icon requests`).toEqual([]);
}

async function assertHeroPage(run, label) {
  const { page } = run;
  const hero = page.locator('section.hero.desktop-hero[aria-labelledby="hero-title"]');
  await expect(page.locator('section.hero'), `${label}: one homepage hero`).toHaveCount(1);
  await expect(hero, `${label}: approved desktop hero`).toBeVisible();
  await expect(hero).toHaveAttribute('data-scroll-surface', '');
  await expect(hero.locator('#hero-title')).toBeVisible();
  await expect(hero.locator('#hero-title')).toHaveText(/Your agents\.\s*One home base\./);
  await expect(hero.locator('.hero-copy > p')).toHaveText('Run any CLI agent in one desktop app, with terminals, an editor, source control and more.');
  await expect(hero.locator('.hero-primary')).toHaveAttribute('href', '/download/');
  await expect(hero.locator('.hero-primary')).toHaveText('Download lomi');
  await expect(hero.locator('.hero-secondary')).toHaveAttribute('href', '#newsletter');
  await expect(hero.locator('.hero-secondary')).toHaveText('Join newsletter');
  await expect(hero.locator('.hero-primary')).toBeVisible();
  await expect(hero.locator('.hero-secondary')).toBeVisible();
  await expect(hero.locator('canvas, video, iframe, script')).toHaveCount(0);

  const wallpaper = await assertImageAsset(hero.locator('.hero-wallpaper img'), wallpaperAsset, `${label}: cloud wallpaper`);
  expect(wallpaper.alt, `${label}: wallpaper is decorative`).toBe('');
  const showcase = hero.locator('figure#workspace.workspace-showcase');
  await expect(showcase).toHaveAttribute('role', 'img');
  await expect(showcase).toHaveAccessibleName("Lomi's workspace with its project explorer, TypeScript editor and integrated terminal.");
  const product = await assertImageAsset(showcase.locator('picture img.laptop-render'), productAsset, `${label}: concrete laptop render`);
  expect(product.alt, `${label}: physical laptop render is decorative`).toBe('');
  await expect(showcase.locator('svg.laptop-display')).toBeAttached();
  await assertProjectedScreen(page, label);
  await expect(page.locator('#newsletter')).toBeAttached();
  await assertNoHeroLabArtifacts(run, label);
  return heroSignature(page);
}

async function rects(page) {
  return page.evaluate(() => {
    const bounds = (selector) => {
      const element = document.querySelector(selector);
      const { x, y, width, height, right, bottom } = element.getBoundingClientRect();
      return { x, y, width, height, right, bottom };
    };
    const header = bounds('.site-header');
    const features = bounds('#features');
    const workspaceContainer = document.querySelector('.hero-desktop');
    const overflowing = ['section.hero', '.hero-copy', '#hero-title', '.hero-primary', '.hero-secondary', '#workspace'].map((selector) => {
      const element = document.querySelector(selector);
      const style = getComputedStyle(element);
      return {
        selector,
        extraX: element.scrollWidth - element.clientWidth,
        extraY: element.scrollHeight - element.clientHeight,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
      };
    });
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: document.documentElement.scrollWidth,
      hero: bounds('section.hero'),
      features,
      header,
      copy: bounds('.hero-copy'),
      heading: bounds('#hero-title'),
      headingLines: Array.from(document.querySelectorAll('#hero-title > span'), (line) => {
        const { x, y, width, height, right, bottom } = line.getBoundingClientRect();
        return { x, y, width, height, right, bottom };
      }),
      primary: bounds('.hero-primary'),
      secondary: bounds('.hero-secondary'),
      product: bounds('#workspace'),
      image: bounds('#workspace img'),
      showcasePosition: getComputedStyle(workspaceContainer).position,
      overflowing,
    };
  });
}

function assertWithin(box, parent, label) {
  expect(box.x, `${label}: left edge is not clipped`).toBeGreaterThanOrEqual(parent.x - 1);
  expect(box.right, `${label}: right edge is not clipped`).toBeLessThanOrEqual(parent.right + 1);
  expect(box.y, `${label}: top edge stays within the hero`).toBeGreaterThanOrEqual(parent.y - 1);
  expect(box.bottom, `${label}: bottom edge stays within the hero`).toBeLessThanOrEqual(parent.bottom + 1);
}

function pointInRect(point, rect) {
  return point.x >= rect.x && point.x <= rect.right && point.y >= rect.y && point.y <= rect.bottom;
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const first = polygon[i];
    const second = polygon[j];
    const crosses = (first.y > point.y) !== (second.y > point.y)
      && point.x < ((second.x - first.x) * (point.y - first.y)) / (second.y - first.y) + first.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(a, b, c, d) {
  const cross = (first, second, third) => (second.x - first.x) * (third.y - first.y) - (second.y - first.y) * (third.x - first.x);
  const onSegment = (first, second, point) => point.x >= Math.min(first.x, second.x) - 1e-6
    && point.x <= Math.max(first.x, second.x) + 1e-6
    && point.y >= Math.min(first.y, second.y) - 1e-6
    && point.y <= Math.max(first.y, second.y) + 1e-6;
  const first = cross(a, b, c);
  const second = cross(a, b, d);
  const third = cross(c, d, a);
  const fourth = cross(c, d, b);
  if (Math.abs(first) < 1e-6 && onSegment(a, b, c)) return true;
  if (Math.abs(second) < 1e-6 && onSegment(a, b, d)) return true;
  if (Math.abs(third) < 1e-6 && onSegment(c, d, a)) return true;
  if (Math.abs(fourth) < 1e-6 && onSegment(c, d, b)) return true;
  return (first > 0) !== (second > 0) && (third > 0) !== (fourth > 0);
}

function polygonIntersectsRect(polygon, rect) {
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.right, y: rect.y },
    { x: rect.right, y: rect.bottom },
    { x: rect.x, y: rect.bottom },
  ];
  if (polygon.some((point) => pointInRect(point, rect))) return true;
  if (corners.some((point) => pointInPolygon(point, polygon))) return true;
  const edges = corners.map((point, index) => [point, corners[(index + 1) % corners.length]]);
  return polygon.some((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return edges.some(([start, end]) => segmentsIntersect(point, next, start, end));
  });
}

function expectedSideBySide({ width, height }) {
  return (width >= 900 && width / height >= 4 / 3) || (width >= 560 && width > height && height <= 600);
}

async function assertResponsiveLayout(page, viewport, { capture = true } = {}) {
  const { width, height } = viewport;
  const label = `${width}x${height}`;
  await page.setViewportSize(viewport);
  const layout = await rects(page);
  const screen = await projectedScreenGeometry(page);
  expect(layout.viewport, `${label}: viewport dimensions applied`).toEqual(viewport);
  expect(layout.document, `${label}: no horizontal page overflow`).toBe(width);
  expect(layout.hero.y, `${label}: hero starts at viewport top`).toBeCloseTo(0, 0);
  expect(layout.hero.height, `${label}: default hero fills the viewport`).toBeGreaterThanOrEqual(height - 1);
  expect(layout.hero.height, `${label}: default hero does not grow past the viewport`).toBeLessThanOrEqual(height + 1);
  expect(layout.features.y, `${label}: next section starts at viewport bottom`).toBeGreaterThanOrEqual(height - 1);
  expect(layout.features.y, `${label}: next section starts at viewport bottom`).toBeLessThanOrEqual(height + 1);
  expect(Math.abs(layout.product.bottom - layout.hero.bottom), `${label}: laptop is grounded at the hero bottom`).toBeLessThanOrEqual(1);
  expect(layout.copy.y, `${label}: hero copy clears the fixed header`).toBeGreaterThanOrEqual(layout.header.bottom - 1);
  const sideBySide = expectedSideBySide(viewport);
  expect(layout.showcasePosition, `${label}: expected ${sideBySide ? 'side-by-side' : 'stacked'} layout`).toBe(sideBySide ? 'absolute' : 'relative');
  for (const [name, box] of Object.entries({
    copy: layout.copy,
    heading: layout.heading,
    primary: layout.primary,
    secondary: layout.secondary,
    workspace: layout.product,
    'laptop image': layout.image,
  })) assertWithin(box, layout.hero, `${label} ${name}`);
  layout.headingLines.forEach((line, index) => assertWithin(line, layout.heading, `${label} heading line ${index + 1}`));
  assertWithin(screen, layout.hero, `${label} projected laptop screen`);
  for (const [name, copyArea] of [['copy', layout.copy], ['heading', layout.heading], ['primary CTA', layout.primary], ['secondary CTA', layout.secondary]]) {
    expect(polygonIntersectsRect(screen.points, copyArea), `${label}: projected laptop screen does not cover ${name}`).toBe(false);
  }
  layout.overflowing.forEach(({ selector, extraX, extraY, overflowY }) => {
    expect(extraX, `${label}: ${selector} contents do not clip horizontally`).toBeLessThanOrEqual(1);
    if (overflowY !== 'visible') expect(extraY, `${label}: ${selector} contents do not clip vertically`).toBeLessThanOrEqual(1);
  });
  expect(layout.product.width, `${label}: laptop showcase remains legible`).toBeGreaterThan(220);
  if (!sideBySide) {
    expect(layout.product.x, `${label}: stacked laptop stays inside the hero`).toBeGreaterThanOrEqual(layout.hero.x - 1);
    expect(layout.product.right, `${label}: stacked laptop stays inside the hero`).toBeLessThanOrEqual(layout.hero.right + 1);
    expect(layout.product.y, `${label}: stacked laptop follows the copy`).toBeGreaterThanOrEqual(layout.copy.bottom - 1);
    const transforms = await page.locator('#workspace').evaluate((element) => {
      const hero = document.querySelector('section.hero');
      const active = [];
      for (let current = element; current && current !== hero; current = current.parentElement) {
        const transform = getComputedStyle(current).transform;
        if (transform !== 'none') active.push({ element: current.tagName, className: current.className?.baseVal ?? current.className, transform });
      }
      return active;
    });
    expect(transforms, `${label}: stacked laptop has no offset rotation`).toEqual([]);
  }
  if (capture && ['320x568', '390x844', '640x360', '1024x576', '1440x810', '1920x1080'].includes(label)) {
    await page.locator('section.hero').screenshot({ path: `artifacts/hero-scene/${browserType.name()}-${label}.png`, animations: 'disabled' });
  }
}

async function assertAccessibleGrowth(page) {
  const viewport = { width: 320, height: 240 };
  const label = '320x240 long-copy fallback';
  await page.setViewportSize(viewport);
  await page.evaluate(() => {
    const heading = document.querySelector('#hero-title');
    const description = document.querySelector('.hero-copy > p');
    if (heading) heading.textContent = 'Your agents. One home base. A workspace built for every project and every team.';
    if (description) description.textContent = `${description.textContent} ${'Keep your project files, editor, terminals, source control and local preview together while your agents work. '.repeat(7)}`;
  });

  const layout = await rects(page);
  const screen = await projectedScreenGeometry(page);
  expect(layout.viewport, `${label}: short viewport dimensions applied`).toEqual(viewport);
  expect(layout.document, `${label}: no horizontal page overflow`).toBe(viewport.width);
  expect(layout.hero.height, `${label}: hero grows for readable content`).toBeGreaterThan(viewport.height + 1);
  expect(layout.features.y, `${label}: following content moves below the grown hero`).toBeGreaterThan(layout.viewport.height);
  expect(Math.abs(layout.product.bottom - layout.hero.bottom), `${label}: laptop is grounded at the grown hero bottom`).toBeLessThanOrEqual(1);
  expect(layout.copy.y, `${label}: hero copy clears the fixed header`).toBeGreaterThanOrEqual(layout.header.bottom - 1);
  for (const [name, box] of Object.entries({
    copy: layout.copy,
    heading: layout.heading,
    primary: layout.primary,
    secondary: layout.secondary,
    workspace: layout.product,
    'laptop image': layout.image,
  })) assertWithin(box, layout.hero, `${label} ${name}`);
  layout.headingLines.forEach((line, index) => assertWithin(line, layout.heading, `${label} heading line ${index + 1}`));
  assertWithin(screen, layout.hero, `${label} projected laptop screen`);
  for (const [name, copyArea] of [['copy', layout.copy], ['heading', layout.heading], ['primary CTA', layout.primary], ['secondary CTA', layout.secondary]]) {
    expect(polygonIntersectsRect(screen.points, copyArea), `${label}: projected laptop screen does not cover ${name}`).toBe(false);
  }
  layout.overflowing.forEach(({ selector, extraX, extraY, overflowY }) => {
    expect(extraX, `${label}: ${selector} contents do not clip horizontally`).toBeLessThanOrEqual(1);
    if (overflowY !== 'visible') expect(extraY, `${label}: ${selector} contents do not clip vertically`).toBeLessThanOrEqual(1);
  });

  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(scrollHeight, `${label}: page has scrollable content`).toBeGreaterThan(viewport.height);
  const primary = page.locator('.hero-primary');
  await primary.scrollIntoViewIfNeeded();
  await expect(primary, `${label}: primary action remains reachable while scrolling`).toBeInViewport({ ratio: 1 });
  const scrolled = await page.evaluate(() => window.scrollY);
  expect(scrolled, `${label}: reaching the primary action scrolls the page`).toBeGreaterThan(0);
}

try {
  const base = await open();
  const { page } = base;
  const signature = await assertHeroPage(base, 'homepage');
  await projectedScreenPixelDifference(page, '1440px workspace');

  for (const query of ['?id=15', '?id=1', '?id=all']) {
    const variant = await open({ query });
    try {
      const variantSignature = await assertHeroPage(variant, query);
      expect(variantSignature, `${query}: URL query does not change the approved hero`).toEqual(signature);
    } finally {
      await variant.context.close();
    }
  }

  for (const viewport of viewports) await assertResponsiveLayout(page, viewport);
  await assertAccessibleGrowth(page);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileAxe = await new AxeBuilder({ page }).include('.hero').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(mobileAxe.violations, 'Hero accessibility at 390x844').toEqual([]);

  await page.setViewportSize({ width: 1440, height: 810 });
  const desktopAxe = await new AxeBuilder({ page }).include('.hero').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(desktopAxe.violations, 'Hero accessibility at 1440x810').toEqual([]);
  const secondary = page.locator('.hero-secondary');
  await secondary.focus();
  await expect(secondary, 'Newsletter anchor is keyboard focusable').toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new URL('#newsletter', url).href);
  await expect(page.locator('#newsletter')).toBeInViewport();

  const direct = await open({ fragment: '#newsletter' });
  await expect(direct.page).toHaveURL(new URL('#newsletter', url).href);
  await expect(direct.page.locator('#newsletter')).toBeInViewport();
  await direct.context.close();

  const noJs = await open({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const noJsSignature = await assertHeroPage(noJs, 'no-JS');
  expect(noJsSignature, 'Server-rendered hero matches the interactive hero').toEqual(signature);
  expect(noJs.pageErrors, 'No-JS hero has no runtime errors').toEqual([]);
  await assertResponsiveLayout(noJs.page, { width: 320, height: 568 }, { capture: false });
  await assertResponsiveLayout(noJs.page, { width: 390, height: 844 }, { capture: false });
  await noJs.page.setViewportSize({ width: 390, height: 844 });
  const noJsSecondary = noJs.page.locator('.hero-secondary');
  await noJsSecondary.click();
  await expect(noJs.page).toHaveURL(new URL('#newsletter', url).href);
  await expect(noJs.page.locator('#newsletter')).toBeInViewport();
  await noJs.context.close();

  expect(errors, 'Hero/query/no-JS scenarios have no page errors').toEqual([]);
  console.log(`Passed (${browserType.name()}): approved SSR cloud hero and concrete laptop/screen assets, unchanged CMS copy/actions for base and ?id=15/1/all, decoded projected screen with visible screenshot pixels, no hero scripts/canvas/media/agent requests or lab UI, ${viewports.length} width/height viewports with full-height hero and unclipped content, expected stacked/side-by-side layouts, short-screen long-copy growth and scrolling, keyboard/native newsletter anchors, no-JS parity, and axe at 390x844/1440x810.`);
} finally {
  await browser.close();
}
