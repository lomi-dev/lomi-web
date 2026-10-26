import { mkdir, readFile } from 'node:fs/promises';
import { chromium, webkit } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const baseURL = (process.env.BASE_URL || 'http://127.0.0.1:48740').replace(/\/$/, '');
const browserName = process.env.NL_BROWSER || process.env.VERIFY_BROWSER || 'chromium';
const browserType = { chromium, webkit }[browserName];
if (!browserType) throw new Error('NL_BROWSER must be chromium or webkit');

const viewportWidths = [320, 390, 600, 768, 1024, 1440, 1920];
const publicRoutes = [
  '/', '/claude-code/', '/claude-code-and-codex/', '/codex/', '/compare/',
  '/cookies/', '/devlog/', '/download/', '/mobile-app/', '/privacy/',
  '/remote/', '/security/', '/terms/', '/warp-alternative/',
];
const retiredQueries = [
  '?roadmap=all', '?newsletter=3', '?newsletter=4', '?newsletter=all',
  '?roadmap=all&newsletter=3', '?newsletter=4&roadmap=all',
];
const artifactDir = `artifacts/newsletter-section/${browserName}`;
const findings = [];
let passed = 0;
let browser;
let context;

function record(condition, label, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`PASS ${label}`);
    return;
  }
  const message = detail ? `${label}: ${detail}` : label;
  findings.push(message);
  console.error(`FAIL ${message}`);
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function parseRgb(value) {
  const match = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  return match ? match.slice(1, 4).map(Number) : null;
}

function contrastRatio(first, second) {
  const luminance = ([red, green, blue]) => {
    const channels = [red, green, blue].map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

async function openPage(page, target, { waitForFonts = true } = {}) {
  const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 20000 });
  if (waitForFonts) {
    await page.evaluate(() => Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]));
  }
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return response;
}

async function main() {
  const landing = JSON.parse(await readFile(new URL('../content/landing.json', import.meta.url), 'utf8'));
  await mkdir(artifactDir, { recursive: true });
  browser = await browserType.launch({ headless: true });
  context = await browser.newContext({
    // Keep the compact section at the viewport midpoint for the canvas probe.
    viewport: { width: 1440, height: 600 },
    reducedMotion: 'reduce',
    colorScheme: 'light',
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem('lomi.cookie-consent', JSON.stringify({
        version: 1,
        externalMedia: false,
        savedAt: Date.now(),
      }));
    } catch { /* The page still works when storage is unavailable. */ }
  });

  const page = await context.newPage();
  const pageErrors = [];
  const labAssets = new Set();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    const url = request.url();
    if (/\/(?:roadmap|newsletter)-lab\//i.test(url) || /(?:roadmap|newsletter)-concepts/i.test(url)) {
      labAssets.add(url);
    }
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(baseURL).origin) return route.continue();
    if (url.hostname === 'api.github.com') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    // Keep this visual/content check deterministic and prevent any external POST.
    return route.abort();
  });

  const homeURL = `${baseURL}/#newsletter`;
  let response;
  try {
    response = await openPage(page, homeURL);
  } catch (error) {
    record(false, `Homepage loads at ${homeURL}`, errorText(error));
    return;
  }
  record(Boolean(response?.ok()), 'Homepage returns a successful response', `status ${response?.status()}`);

  const homeFacts = await page.locator('body').evaluate((body) => {
    const newsletter = document.querySelector('#newsletter');
    const header = document.querySelector('.site-header');
    const form = newsletter?.querySelector('#newsletter-form');
    const field = form?.querySelector('#newsletter-email');
    const button = form?.querySelector('button[type="submit"]');
    const rectangle = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height };
    };
    const color = (element) => element ? getComputedStyle(element).color : null;
    const title = newsletter?.querySelector('#newsletter-title');
    const description = newsletter?.querySelector('.release-description');
    const label = newsletter?.querySelector('label[for="newsletter-email"]');
    const note = newsletter?.querySelector('#newsletter-note');
    const status = newsletter?.querySelector('#newsletter-status');
    const symbol = newsletter?.querySelector('.address-symbol');
    const htmlColor = getComputedStyle(document.documentElement).backgroundColor;
    const sectionColor = newsletter ? getComputedStyle(newsletter).backgroundColor : null;
    const headerLink = header?.querySelector('.desktop-navigation a') || header?.querySelector('.mobile-navigation > summary');
    const headerTextColor = color(headerLink);
    const routeAnchors = [...document.querySelectorAll('a[href]')].map((anchor) => {
      try {
        const url = new URL(anchor.getAttribute('href'), location.href);
        return { href: anchor.getAttribute('href'), hash: url.hash, path: url.pathname };
      } catch { return { href: anchor.getAttribute('href'), hash: '', path: '' }; }
    });
    return {
      title: title?.textContent?.trim() || '',
      description: description?.textContent?.trim() || '',
      sectionCount: document.querySelectorAll('#newsletter').length,
      hasRoadmap: Boolean(document.querySelector('#roadmap')),
      roadmapLinks: routeAnchors.filter(({ hash, path }) => hash === '#roadmap' || /\/roadmap\/?$/.test(path)),
      hasLabElements: Boolean(document.querySelector('newsletter-lab, roadmap-lab, [data-newsletter-lab], [data-roadmap-lab], .newsletter-lab, .roadmap-lab')),
      hasLabTemplates: Boolean([...document.querySelectorAll('template')].some((template) => /newsletter|roadmap|variant|preview/i.test(`${template.id} ${template.className} ${template.innerHTML}`))),
      hasPreviewToolbar: Boolean(document.querySelector('[data-preview-toolbar], [data-lab-toolbar], .preview-toolbar, .lab-toolbar, #lab-switcher')),
      headingCount: newsletter?.querySelectorAll('h1,h2,h3,h4,h5,h6').length || 0,
      emailLabel: label?.textContent?.trim() || '',
      note: note?.textContent?.trim() || '',
      status: status?.textContent?.trim() || '',
      noteVisible: Boolean(note && note.getClientRects().length && getComputedStyle(note).visibility !== 'hidden' && getComputedStyle(note).display !== 'none'),
      statusVisible: Boolean(status && status.getClientRects().length && getComputedStyle(status).visibility !== 'hidden' && getComputedStyle(status).display !== 'none'),
      emailDisabled: field?.disabled ?? null,
      submitDisabled: button?.disabled ?? null,
      endpoint: form?.getAttribute('data-endpoint'),
      emailRect: rectangle(field),
      buttonRect: rectangle(button),
      noteRect: rectangle(note),
      sectionRect: rectangle(newsletter),
      headerRect: rectangle(header),
      sectionTopGap: newsletter && header ? newsletter.getBoundingClientRect().top - header.getBoundingClientRect().bottom : null,
      sectionColor,
      htmlColor,
      headerTheme: header?.getAttribute('data-theme') || '',
      headerTextColor,
      controlFontSize: field ? Number.parseFloat(getComputedStyle(field).fontSize) : null,
      iconOnlyMark: Boolean(symbol),
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
    };
  });

  record(homeFacts.sectionCount === 1, 'Homepage has exactly one newsletter section', `found ${homeFacts.sectionCount}`);
  record(homeFacts.title === landing.newsletter.title, 'Newsletter title matches CMS content', `expected ${JSON.stringify(landing.newsletter.title)}, received ${JSON.stringify(homeFacts.title)}`);
  record(homeFacts.description === landing.newsletter.description, 'Newsletter description matches CMS content', `expected ${JSON.stringify(landing.newsletter.description)}, received ${JSON.stringify(homeFacts.description)}`);
  record(homeFacts.headingCount === 1, 'Newsletter has one semantic heading', `found ${homeFacts.headingCount}`);
  record(homeFacts.emailLabel.length > 0, 'Newsletter email field has a visible label');
  record(homeFacts.noteVisible && homeFacts.note.length > 0, 'Newsletter note is present and visible', `note=${JSON.stringify(homeFacts.note)}`);
  record(homeFacts.statusVisible && homeFacts.status.length > 0, 'Newsletter status/unavailable guidance is present and visible');
  record(homeFacts.emailDisabled === true && homeFacts.submitDisabled === true, 'Public newsletter controls stay disabled without a configured endpoint');
  record(homeFacts.endpoint === '' || homeFacts.endpoint === null, 'Homepage contains no configured submission endpoint', `data-endpoint=${JSON.stringify(homeFacts.endpoint)}`);
  record(!homeFacts.iconOnlyMark, 'Newsletter has no decorative @ mark');
  record(!homeFacts.hasRoadmap, 'Homepage has no #roadmap section');
  record(homeFacts.roadmapLinks.length === 0, 'Homepage has no links to the retired roadmap', JSON.stringify(homeFacts.roadmapLinks));
  record(!homeFacts.hasLabElements, 'Homepage has no roadmap/newsletter preview elements');
  record(!homeFacts.hasLabTemplates, 'Homepage has no experiment or variant templates');
  record(!homeFacts.hasPreviewToolbar, 'Homepage has no preview toolbar or variant selector');
  record(labAssets.size === 0, 'Homepage loads no retired lab assets', [...labAssets].join(', '));

  const homeBackground = parseRgb(homeFacts.htmlColor);
  const sectionBackground = parseRgb(homeFacts.sectionColor);
  const backgroundDelta = homeBackground && sectionBackground
    ? Math.max(...homeBackground.map((value, index) => Math.abs(value - sectionBackground[index])))
    : Number.POSITIVE_INFINITY;
  record(backgroundDelta <= 4, 'Page canvas matches the light newsletter surface', `canvas ${homeFacts.htmlColor}, newsletter ${homeFacts.sectionColor}`);
  record(homeFacts.headerTheme === 'light', 'Homepage header uses its light theme', `data-theme=${homeFacts.headerTheme}`);
  const headerRgb = parseRgb(homeFacts.headerTextColor || '');
  const sectionRgb = sectionBackground || [247, 248, 243];
  const headerContrast = headerRgb ? contrastRatio(headerRgb, sectionRgb) : 0;
  record(headerContrast >= 4.5, 'Header navigation remains readable over the light page surface', `contrast ${headerContrast.toFixed(2)}:1 (${homeFacts.headerTextColor})`);

  for (const width of viewportWidths) {
    await page.setViewportSize({ width, height: 900 });
    try {
      await openPage(page, homeURL);
    } catch (error) {
      record(false, `${width}px viewport loads`, errorText(error));
      continue;
    }

    const layout = await page.locator('#newsletter').evaluate((section) => {
      const field = section.querySelector('#newsletter-email');
      const button = section.querySelector('button[type="submit"]');
      const label = section.querySelector('label[for="newsletter-email"]');
      const note = section.querySelector('#newsletter-note');
      const status = section.querySelector('#newsletter-status');
      const header = document.querySelector('.site-header');
      const boxes = Object.fromEntries(Object.entries({ field, button, label, note, status, section, header }).map(([key, element]) => {
        if (!element) return [key, null];
        const rect = element.getBoundingClientRect();
        return [key, { x: rect.x, y: rect.y, top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height }];
      }));
      const noOverlap = boxes.field && boxes.button && (
        boxes.field.right <= boxes.button.left + 1 || boxes.button.right <= boxes.field.left + 1 ||
        boxes.field.bottom <= boxes.button.top + 1 || boxes.button.bottom <= boxes.field.top + 1
      );
      const clips = [field, button].map((element) => {
        if (!element) return true;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0 || rect.left < -1 || rect.right > innerWidth + 1) return true;
        if (element.scrollWidth > element.clientWidth + 1) return true;
        for (let ancestor = element.parentElement; ancestor && ancestor !== section; ancestor = ancestor.parentElement) {
          const overflowX = getComputedStyle(ancestor).overflowX;
          if ((overflowX === 'hidden' || overflowX === 'clip' || overflowX === 'auto') && (rect.left < ancestor.getBoundingClientRect().left - 1 || rect.right > ancestor.getBoundingClientRect().right + 1)) return true;
        }
        return false;
      });
      return {
        viewportWidth: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        boxes,
        fontSize: field ? Number.parseFloat(getComputedStyle(field).fontSize) : null,
        noOverlap: Boolean(noOverlap),
        clipped: clips.some(Boolean),
        labelVisible: Boolean(label?.getClientRects().length && getComputedStyle(label).visibility !== 'hidden'),
        noteVisible: Boolean(note?.getClientRects().length && getComputedStyle(note).visibility !== 'hidden' && getComputedStyle(note).display !== 'none'),
        statusVisible: Boolean(status?.getClientRects().length && getComputedStyle(status).visibility !== 'hidden' && getComputedStyle(status).display !== 'none'),
        sectionTopGap: header ? section.getBoundingClientRect().top - header.getBoundingClientRect().bottom : null,
        cssHeaderHeight: getComputedStyle(document.documentElement).getPropertyValue('--site-header-height').trim(),
        buttonBackground: button ? getComputedStyle(button).backgroundColor : null,
        buttonColor: button ? getComputedStyle(button).color : null,
        downloadBackground: getComputedStyle(document.querySelector('.header-action, .mobile-download')).backgroundColor,
        downloadColor: getComputedStyle(document.querySelector('.header-action, .mobile-download')).color,
      };
    });

    record(layout.boxes.section.height <= (width > 900 ? 380 : 520), `${width}px: newsletter stays compact`, `${layout.boxes.section.height}px`);
    record(layout.buttonBackground === layout.downloadBackground && layout.buttonColor === layout.downloadColor, `${width}px: newsletter and Download lomi share their colors`);
    record(layout.documentWidth === width, `${width}px: no horizontal document overflow`, `document ${layout.documentWidth}px`);
    record(layout.fontSize >= 16, `${width}px: email text stays at least 16px`, `${layout.fontSize}px`);
    record((layout.boxes.field?.height || 0) >= 56, `${width}px: email field is at least 56px tall`, `${layout.boxes.field?.height}px`);
    record((layout.boxes.button?.height || 0) >= 52, `${width}px: submit control is at least 52px tall`, `${layout.boxes.button?.height}px`);
    record(layout.noOverlap, `${width}px: email field and submit control do not overlap`, JSON.stringify(layout.boxes));
    record(!layout.clipped, `${width}px: email field and submit control are not clipped`, JSON.stringify(layout.boxes));
    record(layout.labelVisible && layout.noteVisible && layout.statusVisible, `${width}px: form label, status and note remain visible`);
    record(layout.sectionTopGap >= 8 && layout.sectionTopGap <= 44, `${width}px: newsletter anchor clears the fixed header`, `gap ${layout.sectionTopGap}px, header token ${layout.cssHeaderHeight}`);
  }

  const querySignature = async (target) => {
    const result = await openPage(page, `${baseURL}/${target}`);
    if (!result?.ok()) return { status: result?.status(), sectionCount: 0 };
    return page.locator('body').evaluate(() => {
      const section = document.querySelector('#newsletter');
      return {
        status: 200,
        title: section?.querySelector('#newsletter-title')?.textContent?.trim() || '',
        description: section?.querySelector('.release-description')?.textContent?.trim() || '',
        sectionCount: document.querySelectorAll('#newsletter').length,
        headingCount: section?.querySelectorAll('h1,h2,h3,h4,h5,h6').length || 0,
        fieldCount: section?.querySelectorAll('input[type="email"]').length || 0,
        submitCount: section?.querySelectorAll('button[type="submit"]').length || 0,
        customLabs: document.querySelectorAll('newsletter-lab, roadmap-lab, [data-newsletter-lab], [data-roadmap-lab]').length,
        toolbars: document.querySelectorAll('[data-preview-toolbar], [data-lab-toolbar], .preview-toolbar, .lab-toolbar, #lab-switcher').length,
      };
    });
  };
  await page.setViewportSize({ width: 1440, height: 900 });
  const canonical = await querySignature('');
  for (const query of retiredQueries) {
    const signature = await querySignature(query);
    const comparable = { ...signature, status: canonical.status };
    record(JSON.stringify(comparable) === JSON.stringify(canonical), `Retired URL ${query} renders the same single newsletter`, JSON.stringify(signature));
  }

  // All 14 routes contain desktop and mobile navigation markup plus the shared footer.
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const routePath of publicRoutes) {
    try {
      const routeResponse = await openPage(page, `${baseURL}${routePath}`);
      if (!routeResponse?.ok()) {
        record(false, `${routePath}: route loads`, `status ${routeResponse?.status()}`);
        continue;
      }
      const routeLinks = await page.locator('body').evaluate(() => {
        const anchors = [...document.querySelectorAll('.site-header nav a, footer a')];
        return anchors.map((anchor) => {
          const url = new URL(anchor.getAttribute('href'), location.href);
          return { scope: anchor.closest('footer') ? 'footer' : 'header', href: anchor.getAttribute('href'), path: url.pathname, hash: url.hash };
        }).filter(({ hash, path }) => hash === '#roadmap' || /\/roadmap\/?$/.test(path));
      });
      record(routeLinks.length === 0, `${routePath}: desktop/mobile/footer have no roadmap links`, JSON.stringify(routeLinks));
    } catch (error) {
      record(false, `${routePath}: navigation inspection completes`, errorText(error));
    }
  }

  // At a narrow viewport, open the real menu and inspect its rendered link set.
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    await openPage(page, `${baseURL}/`);
    const mobileMenu = page.locator('#mobile-navigation');
    if (await mobileMenu.count()) {
      await mobileMenu.locator(':scope > summary').click();
      const mobileLinks = await mobileMenu.locator('nav a').evaluateAll((anchors) => anchors.map((anchor) => {
        const url = new URL(anchor.getAttribute('href'), location.href);
        return { href: anchor.getAttribute('href'), path: url.pathname, hash: url.hash };
      }).filter(({ hash, path }) => hash === '#roadmap' || /\/roadmap\/?$/.test(path)));
      record(mobileLinks.length === 0, 'Opened mobile menu has no roadmap link', JSON.stringify(mobileLinks));
    } else {
      record(false, 'Mobile menu exists on the homepage');
    }
  } catch (error) {
    record(false, 'Mobile menu can be inspected', errorText(error));
  }

  // The page is static and intentionally disabled when JavaScript is unavailable.
  try {
    const noJsContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      javaScriptEnabled: false,
      reducedMotion: 'reduce',
      colorScheme: 'light',
    });
    const noJsPage = await noJsContext.newPage();
    await noJsPage.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      return url.origin === new URL(baseURL).origin ? route.continue() : route.abort();
    });
    const noJsResponse = await noJsPage.goto(`${baseURL}/#newsletter`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const noJsFacts = await noJsPage.locator('#newsletter').evaluate((section) => ({
      emailDisabled: section.querySelector('#newsletter-email')?.disabled ?? null,
      submitDisabled: section.querySelector('button[type="submit"]')?.disabled ?? null,
      noScriptText: section.querySelector('noscript')?.textContent?.trim() || '',
      noScriptVisible: Boolean(section.querySelector('noscript')?.getClientRects().length),
    }));
    record(Boolean(noJsResponse?.ok()), 'No-JavaScript homepage loads');
    record(noJsFacts.emailDisabled && noJsFacts.submitDisabled, 'Newsletter stays disabled without JavaScript');
    record(noJsFacts.noScriptVisible && noJsFacts.noScriptText.length > 0, 'No-JavaScript fallback explains how to subscribe');
    await noJsContext.close();
  } catch (error) {
    record(false, 'No-JavaScript fallback can be verified', errorText(error));
  }

  // Axe checks the section itself; the full site has unrelated legacy content.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openPage(page, homeURL);
  try {
    const axe = await new AxeBuilder({ page })
      .include('#newsletter')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    record(axe.violations.length === 0, 'Newsletter section passes axe WCAG 2.1 AA checks', axe.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`).join('; '));
  } catch (error) {
    record(false, 'Axe can analyze newsletter section', errorText(error));
  }

  // Expand the viewport before locator screenshots to avoid Chromium clipping beyond
  // the original viewport when the page root uses overflow-x: clip.
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await openPage(page, homeURL);
    const sectionHeight = await page.locator('#newsletter').evaluate((element) => Math.ceil(element.getBoundingClientRect().height));
    await page.setViewportSize({ width, height: sectionHeight + 240 });
    await page.evaluate(() => Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]));
    try {
      await page.locator('#newsletter').screenshot({ path: `${artifactDir}/newsletter-${width}.png`, animations: 'disabled' });
      record(true, `Saved ${width}px newsletter screenshot`);
    } catch (error) {
      record(false, `Saved ${width}px newsletter screenshot`, errorText(error));
    }
  }

  // Capture the end of Features, the full Newsletter, and the start of the footer.
  await page.setViewportSize({ width: 1440, height: 1100 });
  await openPage(page, `${baseURL}/`);
  const newsletterGeometry = await page.locator('#newsletter').evaluate((element) => ({
    top: window.scrollY + element.getBoundingClientRect().top,
    height: Math.ceil(element.getBoundingClientRect().height),
  }));
  const transitionHeight = newsletterGeometry.height + 650;
  await page.setViewportSize({ width: 1440, height: transitionHeight });
  const transitionY = Math.max(0, newsletterGeometry.top - 400);
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), transitionY);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  try {
    await page.screenshot({ path: `${artifactDir}/features-newsletter-footer-1440.png`, animations: 'disabled' });
    record(true, 'Saved Features/newsletter/footer transition screenshot');
  } catch (error) {
    record(false, 'Saved Features/newsletter/footer transition screenshot', errorText(error));
  }

  record(pageErrors.length === 0, 'Homepage and route checks produce no browser page errors', pageErrors.join('; '));
  record(labAssets.size === 0, 'No retired lab assets requested during route checks', [...labAssets].join(', '));

  await context.close();
  await browser.close();
  browser = null;

  console.log(`\nNewsletter section verification (${browserName}): ${passed} passed, ${findings.length} failed.`);
  console.log(`Artifacts: ${artifactDir}/`);
  if (findings.length) {
    for (const finding of findings) console.error(`- ${finding}`);
    process.exitCode = 1;
  }
}

try {
  await main();
} finally {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
}
