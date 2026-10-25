import { chromium, webkit, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

const origin = process.env.VERIFY_URL || 'http://127.0.0.1:48740';
const browserType = process.env.VERIFY_BROWSER === 'webkit' ? webkit : chromium;
const browser = await browserType.launch();
const errors = [];

async function open({ width = 1440, height = 1000, javaScriptEnabled = true } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    javaScriptEnabled,
    reducedMotion: 'reduce',
  });
  await context.addInitScript(() => {
    try { localStorage.setItem('lomi.cookie-consent', JSON.stringify({ version: 1, externalMedia: true, savedAt: Date.now() })); } catch { /* Storage may be unavailable during fallback checks. */ }
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  return { context, page };
}

function menuFor(page, width) {
  return page.locator(width < 768 ? '#mobile-product' : '#product-menu');
}

async function openProductMenu(page, width) {
  if (width < 768) {
    const mobile = page.locator('#mobile-navigation');
    if (!(await mobile.evaluate((element) => element.open))) {
      await mobile.locator(':scope > summary').click();
    }
  }
  const product = menuFor(page, width);
  if (!(await product.evaluate((element) => element.open))) {
    await product.locator(':scope > summary').click();
  }
  await expect(product).toHaveAttribute('open', '');
  return product;
}

async function verifyProductMenu(page, width, { active = false } = {}) {
  const product = await openProductMenu(page, width);
  const links = product.locator('.product-link');
  await expect(links).not.toHaveCount(0);
  await expect(links.first()).toContainText('Features');
  await expect(product.getByRole('link', { name: /^Overview$/i })).toHaveCount(0);
  await expect(product.getByRole('link', { name: 'Remote', exact: true })).toHaveAttribute('href', '/remote/');
  const mobileLink = product.getByRole('link', { name: 'Mobile App', exact: true });
  await expect(mobileLink).toHaveAttribute('href', '/mobile-app/');
  if (active) await expect(mobileLink).toHaveAttribute('aria-current', 'page');
  return product;
}

async function verifyOverflow(page, width, height) {
  await page.setViewportSize({ width, height });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth), `${width}px: document does not scroll horizontally`).toBe(width);
}

try {
  const { context, page } = await open();
  await page.goto(`${origin}/mobile-app/`);
  await expect(page.locator('[data-mobile-app-page]')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1, name: 'Lomi Mobile.' })).toBeVisible();
  await expect(page.locator('.mobile-app-status, .mobile-app-actions')).toHaveCount(0);
  const stores = page.locator('.mobile-store-badge');
  await expect(stores).toHaveCount(2);
  const play = page.getByRole('button', { name: /Google Play.*Coming soon/ });
  const appStore = page.getByRole('button', { name: /App Store.*Coming soon/ });
  await expect(play).toBeDisabled();
  await expect(appStore).toBeDisabled();
  await expect(play).not.toHaveAttribute('href', /.+/);
  await expect(appStore).not.toHaveAttribute('href', /.+/);
  await expect(page.locator('#mobile-play-coming-soon')).toBeVisible();
  await expect(page.locator('#mobile-app-store-coming-soon')).toBeVisible();
  for (const button of [play, appStore]) await expect(button).toHaveCSS('background-color', 'rgb(229, 232, 226)');
  await expect(page.getByRole('link', { name: /Get launch updates|Explore Lomi Remote/ })).toHaveCount(0);
  await expect(page.locator('#mobile-newsletter')).toHaveCount(1);
  await expect(page.locator('#mobile-newsletter .newsletter')).toHaveAttribute('data-state', 'unavailable');
  await expect(page.locator('#mobile-newsletter input')).toBeDisabled();
  await expect(page.locator('#mobile-newsletter button')).toBeDisabled();
  await expect(page.locator('#newsletter-status')).toContainText('temporarily unavailable');

  for (const width of [320, 390, 768, 1440, 1920]) {
    await verifyOverflow(page, width, width < 768 ? 844 : 1000);
    if (width === 320 || width === 390) {
      const badgeBoxes = await page.locator('.mobile-store-badge-wrap').evaluateAll((items) => items.map((item) => {
        const { x, y, width, height } = item.getBoundingClientRect();
        return { x, y, width, height };
      }));
      expect(badgeBoxes).toHaveLength(2);
      expect(Math.abs(badgeBoxes[0].y - badgeBoxes[1].y), `${width}px: store badges share a row`).toBeLessThanOrEqual(1);
      expect(badgeBoxes[0].x + badgeBoxes[0].width).toBeLessThanOrEqual(width);
      expect(badgeBoxes[1].x + badgeBoxes[1].width).toBeLessThanOrEqual(width);
    }
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  const preview = page.locator('[data-mobile-primary-preview]');
  await preview.scrollIntoViewIfNeeded();
  await expect.poll(() => preview.evaluate((image) => image.complete && image.naturalWidth > 0), 'The real workspace UI loads in the main phone').toBe(true);
  await expect.poll(() => page.locator('[data-mobile-phone-preview] img').evaluateAll((images) => images.length === 3 && images.every((image) => image.complete && image.naturalWidth > 0)), 'All three phones show rendered app screens').toBe(true);
  const phones = page.locator('[data-mobile-phone-preview] .phone');
  await expect(phones).toHaveCount(3);
  const phoneBoxes = await Promise.all(['.phone-left', '.phone-main', '.phone-right'].map((selector) =>
    page.locator(`[data-mobile-phone-preview] ${selector}`).boundingBox()));
  expect(phoneBoxes.every(Boolean), 'All three rendered phone frames have geometry').toBe(true);
  const [left, main, right] = phoneBoxes;
  const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  expect(overlaps(left, main) && overlaps(main, right), 'The three phones overlap as a layered device composition').toBe(true);
  const previewBox = await page.locator('[data-mobile-phone-preview]').boundingBox();
  expect(previewBox.x).toBeGreaterThanOrEqual(0);
  expect(previewBox.x + previewBox.width).toBeLessThanOrEqual(1440);
  const mainScreenBox = await preview.boundingBox();
  expect(mainScreenBox.width).toBeGreaterThan(150);
  expect(mainScreenBox.x).toBeGreaterThanOrEqual(0);
  expect(mainScreenBox.x + mainScreenBox.width).toBeLessThanOrEqual(1440);
  await verifyProductMenu(page, 1440, { active: true });
  const desktopSummary = page.locator('#product-menu > summary');
  await desktopSummary.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#product-menu')).not.toHaveAttribute('open', '');
  await page.keyboard.press('Space');
  await expect(page.locator('#product-menu')).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(page.locator('#product-menu')).not.toHaveAttribute('open', '');
  await expect(desktopSummary).toBeFocused();

  await page.goto(`${origin}/`);
  await verifyProductMenu(page, 1440);
  await page.getByRole('link', { name: 'Mobile App', exact: true }).click();
  await expect(page).toHaveURL(`${origin}/mobile-app/`);
  await expect(page.getByRole('heading', { level: 1, name: 'Lomi Mobile.' })).toBeVisible();

  await page.evaluate(() => { document.activeElement?.blur(); scrollTo({ top: 0, behavior: 'instant' }); });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: `artifacts/mobile-app-${browserType.name()}-desktop.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await verifyProductMenu(page, 390, { active: true });
  await page.locator('#mobile-navigation > summary').click();
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: `artifacts/mobile-app-${browserType.name()}-mobile.png`, fullPage: true });

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(audit.violations, `${width}px: mobile page accessibility`).toEqual([]);
  }
  await context.close();

  const noJs = await open({ width: 390, height: 844, javaScriptEnabled: false });
  await noJs.page.goto(`${origin}/mobile-app/`);
  await expect(noJs.page.getByRole('heading', { level: 1, name: 'Lomi Mobile.' })).toBeVisible();
  await expect(noJs.page.locator('.mobile-app-status, .mobile-app-actions')).toHaveCount(0);
  await expect(noJs.page.locator('#mobile-newsletter input')).toBeDisabled();
  await expect(noJs.page.locator('#mobile-newsletter button')).toBeDisabled();
  await expect(noJs.page.locator('#mobile-newsletter .newsletter-noscript')).toBeVisible();
  await expect(noJs.page.getByRole('button', { name: /Google Play.*Coming soon/ })).toBeDisabled();
  await expect(noJs.page.getByRole('button', { name: /App Store.*Coming soon/ })).toBeDisabled();
  await noJs.context.close();

  expect(errors, 'Runtime errors').toEqual([]);
  console.log(`Mobile App page and Product navigation verified in ${browserType.name()}: removed opening actions/status, disabled store buttons, inline newsletter, 3 overlapping phone frames with loaded real UI, five viewport widths, keyboard/mobile menus, no-JS fallback and WCAG 2.1 AA.`);
} finally {
  await browser.close();
}
