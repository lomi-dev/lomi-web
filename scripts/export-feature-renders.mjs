/** Export the same HTML/CSS scenes shipped on the website, without page chrome. */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { assertPlaceholder, startStaticPreview } from './verify-placeholders.mjs';

const { origin, close } = await startStaticPreview();
const browser = await chromium.launch();
const output = 'artifacts/feature-renders';
await mkdir(output, { recursive: true });

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => localStorage.setItem('lomi.cookie-consent', JSON.stringify({ version: 1, externalMedia: false, savedAt: Date.now() })));
  await context.route('https://api.github.com/**', (route) => route.fulfill({ contentType: 'application/json', body: '[]' }));
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  // A tall section screenshot alone does not trigger loading every lazy image.
  for (const scene of await page.locator('[data-feature-card] [data-feature-render]').all()) {
    await scene.scrollIntoViewIfNeeded();
    await scene.evaluate(async (element) => Promise.all([...element.querySelectorAll('img')].map((image) => image.decode())));
  }
  // Fixed navigation belongs outside a clean export of the Features section.
  await page.addStyleTag({ content: '.site-header, .skip-link { visibility: hidden !important; }' });
  await page.locator('#features').screenshot({ path: `${output}/desktop.png`, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#features').screenshot({ path: `${output}/mobile.png`, animations: 'disabled' });

  await page.setViewportSize({ width: 1920, height: 1200 });
  const kinds = ['terminal', 'panels', 'code', 'expand', 'git', 'spark'];
  for (const kind of kinds) {
    const original = page.locator(`[data-feature-card] [data-feature-preview="${kind}"]`);
    // A body-level clone escapes the tile's stacking context and clipping.
    await original.evaluate((element) => {
      const clone = element.cloneNode(true);
      clone.setAttribute('data-export-render', '');
      clone.style.cssText = 'position:fixed;inset:0;width:1920px;height:1200px;z-index:2147483647;';
      document.body.append(clone);
    });
    const render = page.locator('[data-export-render]');
    await render.evaluate(async (element) => Promise.all([...element.querySelectorAll('img')].map((image) => image.decode())));
    await assertPlaceholder(render, { variant: 'feature', aspect: '8 / 5' });
    await render.screenshot({ path: `${output}/render-${kind}.png`, animations: 'disabled' });
    await render.evaluate((element) => element.remove());
  }
  await context.close();
  console.log(`Exported six 1920×1200 renders and desktop/mobile gallery previews to ${output}.`);
} finally {
  await browser.close();
  await close();
}
