import { chromium, firefox, webkit, expect } from '@playwright/test';
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const url = process.env.VERIFY_URL || 'http://127.0.0.1:4322';
const browserType = { chromium, firefox, webkit }[process.env.VERIFY_BROWSER || 'chromium'];
const browser = await browserType.launch();
await mkdir('artifacts', { recursive: true });

async function center(page, selector) {
  await page.locator(selector).evaluate((element) => {
    const box = element.getBoundingClientRect();
    scrollTo({ top: scrollY + box.top + box.height / 2 - innerHeight / 2, behavior: 'instant' });
  });
}

async function assertCanvas(page, color) {
  await expect(page.locator('html')).toHaveCSS('background-color', `rgb(${color.join(', ')})`);
  await expect(page.locator('html')).toHaveCSS('background-image', 'none');
  await expect(page.locator('html')).toHaveCSS('overscroll-behavior-x', 'auto');
  await expect(page.locator('html')).toHaveCSS('overscroll-behavior-y', 'auto');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(await page.evaluate(() => document.documentElement.clientWidth));
}

async function exposedEdge(page, edge, color, label) {
  // Reveal the backing canvas to check rendered pixels. This is a paint probe,
  // not a simulation of the operating system's native momentum gesture.
  const transform = { left: 'translateX(36px)', right: 'translateX(-36px)',
    top: 'translateY(36px)', bottom: 'translateY(-36px)' }[edge];
  await page.evaluate((value) => { document.body.style.transform = value; }, transform);
  try {
    const png = await page.screenshot({ path: `artifacts/page-canvas-${browserType.name()}-${label}-${edge}.png` });
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    const x = edge === 'left' ? 8 : edge === 'right' ? info.width - 10 : Math.floor(info.width / 2);
    const y = edge === 'top' ? 8 : edge === 'bottom' ? info.height - 10 : Math.floor(info.height / 2);
    const offset = (y * info.width + x) * info.channels;
    expect([...data.subarray(offset, offset + 3)], `${label}: exposed ${edge} canvas pixels`).toEqual(color);
  } finally {
    await page.evaluate(() => { document.body.style.removeProperty('transform'); });
  }
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://api.github.com/**', (route) => route.fulfill({
    contentType: 'application/json', body: '[]',
  }));
  await page.goto(url, { waitUntil: 'networkidle' });
  await assertCanvas(page, [255, 255, 255]);
  await exposedEdge(page, 'top', [255, 255, 255], 'hero');
  for (const [name, selector, color] of [
    ['hero', '.hero', [255, 255, 255]],
    ['features', '#features', [247, 248, 243]],
    ['roadmap', '#roadmap', [17, 22, 16]],
    ['newsletter', '#newsletter', [247, 248, 243]],
    ['footer', '.site-footer', [200, 255, 61]],
  ]) {
    await center(page, selector);
    await assertCanvas(page, color);
    await exposedEdge(page, 'left', color, name);
    await exposedEdge(page, 'right', color, name);
  }
  await exposedEdge(page, 'bottom', [200, 255, 61], 'footer');

  // An early glimpse of the footer must not repaint the newsletter edges.
  // Use a shorter viewport so the compact newsletter spans its midpoint.
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.locator('.site-footer').evaluate((element) => {
    scrollTo({ top: scrollY + element.getBoundingClientRect().top - innerHeight + 20, behavior: 'instant' });
  });
  await assertCanvas(page, [247, 248, 243]);
  await page.setViewportSize({ width: 1440, height: 900 });

  // A top-layer dialog must not replace the underlying section's edge color.
  for (const [selector, color] of [['#roadmap', [17, 22, 16]], ['.hero', [255, 255, 255]]]) {
    await center(page, selector);
    await assertCanvas(page, color);
    await page.evaluate(() => { const dialog = document.createElement('dialog'); dialog.id = 'verify-native-dialog'; dialog.textContent = 'Native modal probe'; document.body.append(dialog); dialog.showModal(); });
    await expect(page.locator('#verify-native-dialog')).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 901 });
    await page.mouse.move(8, 450);
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(250);
    await assertCanvas(page, color);
    await page.keyboard.press('Escape');
    await expect(page.locator('#verify-native-dialog')).not.toBeVisible();
    await page.locator('#verify-native-dialog').evaluate((element) => element.remove());
    await page.waitForTimeout(100);
    await assertCanvas(page, color);
    await page.setViewportSize({ width: 1440, height: 900 });
  }

  await page.locator('[data-feature-open="0"]').evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await assertCanvas(page, [247, 248, 243]);
  await page.locator('[data-feature-open="0"]').click();
  await expect(page.locator('#feature-dialog')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 901 });
  await assertCanvas(page, [247, 248, 243]);
  await page.keyboard.press('Escape');
  await expect(page.locator('#feature-dialog')).not.toBeVisible();
  await assertCanvas(page, [247, 248, 243]);

  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 200 }]) {
    await page.setViewportSize(viewport);
    for (const [selector, color] of [
      ['.hero', [255, 255, 255]], ['#features', [247, 248, 243]], ['#roadmap', [17, 22, 16]],
      ['#newsletter', [247, 248, 243]],
      ['.site-footer', [200, 255, 61]],
    ]) {
      await center(page, selector);
      await assertCanvas(page, color);
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${url}/#roadmap`, { waitUntil: 'networkidle' });
  await assertCanvas(page, [17, 22, 16]);
  await page.goto(`${url}/devlog/`, { waitUntil: 'networkidle' });
  await assertCanvas(page, [16, 21, 15]);
  for (const edge of ['top', 'left', 'right', 'bottom']) await exposedEdge(page, edge, [16, 21, 15], 'devlog');
  await page.goBack({ waitUntil: 'networkidle' });
  await assertCanvas(page, [17, 22, 16]);
  await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await assertCanvas(page, [200, 255, 61]);
  await page.keyboard.press('Control+Home');
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await assertCanvas(page, [255, 255, 255]);
  await page.waitForTimeout(500);
  expect(await page.evaluate(async () => {
    let writes = 0;
    const observer = new MutationObserver(() => writes++);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    await new Promise((resolve) => setTimeout(resolve, 300));
    observer.disconnect();
    return writes;
  }), 'No idle canvas style updates').toBe(0);
  expect(errors, 'No runtime errors across page and route changes').toEqual([]);
  await context.close();

  const staticContext = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(url, { waitUntil: 'networkidle' });
  await assertCanvas(staticPage, [200, 255, 61]);
  await staticPage.goto(`${url}/devlog/`, { waitUntil: 'networkidle' });
  await assertCanvas(staticPage, [16, 21, 15]);
  await staticContext.close();
  console.log(`Passed (${browserType.name()}): matching canvas at top/bottom/left/right, all section colors, early footer entry, modal/resize/backdrop-wheel/close, desktop/mobile/short windows, direct anchors, history restore, Devlog, no-JS fallbacks, no horizontal overflow and no idle style writes. OS-native trackpad momentum requires manual QA.`);
} finally {
  await browser.close();
}
