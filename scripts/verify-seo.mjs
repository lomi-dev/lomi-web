import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const outputDirectory = new URL('../dist/', import.meta.url);
const homepage = await readFile(new URL('index.html', outputDirectory), 'utf8');
const devlog = await readFile(new URL('devlog/index.html', outputDirectory), 'utf8');
const robots = await readFile(new URL('robots.txt', outputDirectory), 'utf8');
const sitemapIndex = await readFile(new URL('sitemap-index.xml', outputDirectory), 'utf8');

function tags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map(([tag]) => {
    const attributes = Object.fromEntries([...tag.matchAll(/([^\s=/>]+)\s*=\s*(["'])(.*?)\2/g)].map(([, key, , value]) => [key.toLowerCase(), value]));
    return { tag, attributes };
  });
}

function metadata(html, key, value) {
  const matches = tags(html, 'meta').filter(({ attributes }) => attributes[key] === value);
  return matches[0]?.attributes.content;
}

function canonical(html) {
  return tags(html, 'link').find(({ attributes }) => attributes.rel === 'canonical')?.attributes.href;
}

function robotsContent(html) {
  return metadata(html, 'name', 'robots') ?? '';
}

const expectedSite = new URL(process.env.SITE_URL || 'https://lomi.dev');
const homepageCanonical = new URL(canonical(homepage));
const devlogCanonical = new URL(canonical(devlog));
assert.equal(homepageCanonical.origin, expectedSite.origin, 'homepage canonical uses configured site origin');
assert.equal(homepageCanonical.pathname, '/', 'homepage canonical keeps its served root path');
assert.equal(devlogCanonical.origin, expectedSite.origin, 'devlog canonical uses configured site origin');
assert.equal(devlogCanonical.pathname, '/devlog/', 'devlog canonical matches its directory URL');
assert.equal(metadata(homepage, 'property', 'og:url'), homepageCanonical.href);
assert.equal(metadata(devlog, 'property', 'og:url'), devlogCanonical.href);
assert.equal(robotsContent(homepage), 'index,follow');
assert.ok(metadata(homepage, 'property', 'og:image:alt'), 'social preview has descriptive alternative text');
assert.equal(metadata(homepage, 'name', 'twitter:image:alt'), metadata(homepage, 'property', 'og:image:alt'));
const homepageTitle = homepage.match(/<title>(.*?)<\/title>/i)?.[1];
assert.equal(metadata(homepage, 'name', 'twitter:title'), homepageTitle);
assert.ok(metadata(homepage, 'name', 'twitter:description'));
assert.ok(metadata(homepage, 'name', 'twitter:image'));
assert.ok(metadata(homepage, 'name', 'twitter:image:alt'));

const emptyDevlog = /data-devlog-empty/.test(devlog);
const devlogNoindex = /\bnoindex\b/i.test(robotsContent(devlog));
assert.equal(devlogNoindex, emptyDevlog, 'the devlog is noindexed only when no published episode is rendered');

const jsonLdTags = [...homepage.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
assert.equal(jsonLdTags.length, 1, 'homepage emits a JSON-LD graph');
const graph = JSON.parse(jsonLdTags[0][1])['@graph'];
assert.ok(graph.some((node) => node['@type'] === 'Organization'));
assert.ok(graph.some((node) => node['@type'] === 'WebSite'));
const software = graph.find((node) => node['@type'] === 'SoftwareApplication');
assert.ok(software, 'homepage describes the desktop application');
assert.equal(software.applicationCategory, 'DeveloperApplication');
assert.equal(software.operatingSystem, 'macOS, Windows, Linux');
assert.equal(software.license, 'https://www.apache.org/licenses/LICENSE-2.0');
assert.equal(software.offers.price, '0');
assert.ok(!graph.some((node) => ['AggregateRating', 'Review'].includes(node['@type'])));

const sitemapLink = tags(homepage, 'link').find(({ attributes }) => attributes.rel === 'sitemap')?.attributes.href;
assert.equal(sitemapLink, new URL('sitemap-index.xml', expectedSite).href);
assert.ok(robots.split(/\r?\n/).includes(`Sitemap: ${new URL('sitemap-index.xml', expectedSite).href}`));
const sitemapUrl = sitemapIndex.match(/<loc>([^<]+)<\/loc>/)?.[1];
assert.ok(sitemapUrl, 'sitemap index points to a child sitemap');
const sitemapFilename = new URL(sitemapUrl).pathname.split('/').at(-1);
const sitemap = await readFile(new URL(join('..', 'dist', sitemapFilename), import.meta.url), 'utf8');
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, value]) => value);
assert.ok(sitemapUrls.includes(homepageCanonical.href), 'sitemap includes the homepage canonical');
assert.equal(sitemapUrls.includes(devlogCanonical.href), !devlogNoindex, 'sitemap excludes only an empty, noindexed devlog');

// A newly added route must not silently miss metadata or sitemap discovery.
const pagePaths = ['index.html', ...(await readdir(outputDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
  .map((entry) => `${entry.name}/index.html`)];
const canonicalUrls = new Set();
for (const path of pagePaths) {
  let html;
  try { html = await readFile(new URL(path, outputDirectory), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  const links = tags(html, 'link').filter(({ attributes }) => attributes.rel === 'canonical');
  assert.equal(links.length, 1, `${path}: one preferred URL`);
  const url = links[0].attributes.href;
  assert.equal(new URL(url).origin, expectedSite.origin, `${path}: canonical uses the configured origin`);
  assert.ok(!canonicalUrls.has(url), `${path}: canonical is unique`);
  canonicalUrls.add(url);
  assert.equal(metadata(html, 'property', 'og:url'), url, `${path}: social URL agrees with canonical`);
  assert.equal(sitemapUrls.includes(url), !/\bnoindex\b/i.test(robotsContent(html)), `${path}: sitemap follows indexing intent`);
}

console.log('SEO output checks passed.');
