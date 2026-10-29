#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'media/remote/cli-light.html');
const artifacts = path.join(root, 'artifacts/remote-render');
const png = path.join(artifacts, 'cli-light.png');
const webp = path.join(root, 'src/assets/product/remote/cli-light.webp');
const width = 1920;
const height = 1200;

await mkdir(artifacts, { recursive: true });
await mkdir(path.dirname(webp), { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(source).href, { waitUntil: 'load' });
  await page.locator('.wallpaper').evaluate(async (image) => image.decode());

  const layout = await page.evaluate(() => {
    const stage = document.querySelector('.stage');
    const window = document.querySelector('.cli-window');
    const wallpaper = document.querySelector('.wallpaper');
    if (!stage || !window || !wallpaper) throw new Error('Preview stage is incomplete.');
    const stageBounds = stage.getBoundingClientRect();
    const windowBounds = window.getBoundingClientRect();
    const animations = [...document.querySelectorAll('*')].flatMap((element) => element.getAnimations());
    return {
      stage: { width: stageBounds.width, height: stageBounds.height },
      window: { x: windowBounds.x, y: windowBounds.y, width: windowBounds.width, height: windowBounds.height },
      wallpaper: { width: wallpaper.naturalWidth, height: wallpaper.naturalHeight, source: wallpaper.currentSrc },
      animations: animations.length,
      overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
      titlebars: document.querySelectorAll('.cli-titlebar, .window-lights, .cli-window-mark').length,
      caption: document.querySelectorAll('figcaption, .preview-caption, [data-preview-caption]').length,
    };
  });

  assert.deepEqual(layout.stage, { width, height }, 'Stage has deterministic 8:5 dimensions');
  assert.equal(layout.window.width / width, .8, 'Terminal window uses 80% of the stage width');
  assert.equal(layout.window.height / height, .8, 'Terminal window uses 80% of the stage height');
  assert.equal(layout.window.x, width * .1, 'Terminal window is horizontally centered');
  assert.equal(layout.window.y, height * .08, 'Terminal window uses the existing 48% stage center');
  assert.equal(layout.wallpaper.width, 3840, 'Original Tahoe wallpaper loaded locally');
  assert.equal(layout.wallpaper.height, 2160, 'Original Tahoe wallpaper dimensions are preserved');
  assert.equal(layout.animations, 0, 'Render source contains no running animations');
  assert.equal(layout.overflow, false, 'Render stage has no overflow');
  assert.equal(layout.titlebars, 0, 'The CLI window has no app titlebar or added chrome');
  assert.equal(layout.caption, 0, 'The static preview contains no visible caption');

  await page.screenshot({ path: png, type: 'png', animations: 'disabled' });
  await sharp(png).webp({ quality: 96, effort: 6, smartSubsample: true }).toFile(webp);
  const metadata = await sharp(webp).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, width);
  assert.equal(metadata.height, height);
  const { size } = await stat(webp);
  console.log(`cli-light.webp ${metadata.width}x${metadata.height} ${(size / 1024).toFixed(0)} KB`);
} finally {
  await browser.close();
}
