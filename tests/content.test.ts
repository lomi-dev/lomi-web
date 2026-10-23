/// <reference types="bun" />
import { afterEach, describe, it, spyOn } from 'bun:test';
import assert from 'node:assert/strict';
import seed from '../content/landing.json';
import { landingSchema, safeHref } from '../content/landing-schema';
import { editorDefaults } from '../content/editor-defaults';
import { pageDefaults } from '../content/page-defaults';
import { loadLanding } from '../content/load-landing';
import { summarizeRoadmapStage } from '../content/roadmap-progress';
import { activeLandingLinks } from '../src/data/navigation';

afterEach(() => { globalThis.fetch = originalFetch; });
const originalFetch = globalThis.fetch;

describe('roadmap task progress', () => {
  const stage = seed.roadmap.items[0];

  it('uses authored statuses and counts only completed tasks', () => {
    const parsed = landingSchema.parse({ ...seed, roadmap: { ...seed.roadmap, items: [{
      ...stage, status: 'available', points: [
        { label: 'Done', status: 'completed' },
        { label: 'Building', status: 'in-progress' },
        { label: 'Planned', status: 'not-started' },
      ],
    }] } });
    assert.deepEqual(summarizeRoadmapStage(parsed.roadmap.items[0]), {
      tasks: parsed.roadmap.items[0].points,
      completed: 1, total: 3, percent: 33,
    });
  });

  it('inherits milestone status for missing and null task statuses', () => {
    for (const status of ['available', 'next', 'later'] as const) {
      const result = summarizeRoadmapStage({ ...stage, status, points: [{ label: 'Legacy' }, { label: 'Unset', status: null }] });
      const expected = status === 'available' ? 'completed' : 'not-started';
      assert.deepEqual(result.tasks, [{ label: 'Legacy', status: expected }, { label: 'Unset', status: expected }]);
      assert.equal(result.completed, status === 'available' ? 2 : 0);
      assert.equal(result.total, 2);
      assert.equal(result.percent, status === 'available' ? 100 : 0);
      assert.equal(landingSchema.safeParse({ ...seed, roadmap: { ...seed.roadmap, items: [{ ...stage, status, points: [{ label: 'Unset', status: null }] }] } }).success, true);
    }
  });

  it('rejects unsupported task statuses', () => {
    assert.equal(landingSchema.safeParse({ ...seed, roadmap: { ...seed.roadmap, items: [{
      ...stage, points: [{ label: 'Invalid', status: 'done' }],
    }] } }).success, false);
  });
});

describe('published landing content', () => {
  it('renders the checked-in outline without a CMS or a network request', async () => {
    const fetch = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network request'));
    assert.deepEqual(await loadLanding(), landingSchema.parse(seed));
    assert.equal(fetch.mock.calls.length, 0);
  });

  it('requests only published content and strips CMS metadata', async () => {
    const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
      ...seed, _status: 'published', id: 1, createdAt: '2026-10-19',
    }));
    assert.deepEqual(await loadLanding('http://127.0.0.1:3001'), landingSchema.parse(seed));
    assert.equal(fetch.mock.calls[0][0].toString(), 'http://127.0.0.1:3001/api/globals/landing?depth=1&draft=false');
  });

  it('rejects a draft even if a misconfigured CMS returns HTTP 200', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ ...seed, _status: 'draft' }));
    await assert.rejects(loadLanding('https://cms.example.test'), /published landing content/);
  });

  it('fails the build on CMS outages instead of silently deploying old copy', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }));
    await assert.rejects(loadLanding('https://cms.example.test'), /HTTP 503/);
  });

  it('rejects an incomplete published page', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ _status: 'published', hero: seed.hero }));
    await assert.rejects(loadLanding('https://cms.example.test'));
  });

  it('accepts the Devlog, Download, Remote, and agent guide routes, HTTPS links, and section anchors', () => {
    for (const href of ['/devlog', '/devlog/', '/download', '/download/', '/remote', '/remote/', '/claude-code', '/claude-code/', '/claude-code/#windows', '/codex', '/codex/', '/codex/#windows', '/', '/cookies/', '/cookies/#preferences', '/remote#section', '/#features', 'mailto:hello@example.test', 'https://docs.lomi.dev', '#roadmap']) {
      assert.equal(landingSchema.safeParse({ ...seed, navigation: { ...seed.navigation, links: [{ label: 'Link', href }] } }).success, true, href);
    }
  });

  it('rejects executable, credentialed, malformed, and unknown internal links from the CMS', () => {
    for (const href of [
      'javascript:alert(1)', 'data:text/html,test', '//example.com',
      'http://example.com', 'https://user:password@example.com',
      'https:example.com', 'https:///example.com', 'https://example.com\\@evil.test',
      'https://exam\nple.com', '/unknown', '/devlog/../admin',
      '/devlog?draft=true', '/devlog//', '/%64evlog',
      '/download/../admin', '/download?draft=true', '/download//', '/%64ownload',
      '/remote/../admin', '/remote?draft=true', '/remote/?draft=true',
      '/remote//', '/%72emote', '/remote/%2e%2e/admin',
      '/claude-code/../admin', '/claude-code?draft=true', '/claude-code//', '/%63laude-code',
      '/codex/../admin', '/codex?draft=true', '/codex//', '/%63odex',
    ]) {
      assert.equal(landingSchema.safeParse({ ...seed, navigation: { ...seed.navigation, links: [{ label: 'Unsafe', href }] } }).success, false, href);
    }
  });

  it('keeps published CMS links usable after removing landing sections', () => {
    const publishedLinks = [
      ...['workflow', 'features', 'principles', 'faq', 'newsletter'].map((id) => ({ label: id, href: `#${id}` })),
      { label: 'Overview', href: '#workspace' },
      { label: 'Roadmap', href: '#roadmap' },
      { label: 'Download', href: '#download' },
      { label: 'Devlog', href: '/devlog/' },
      { label: 'Docs', href: 'https://docs.lomi.dev' },
    ];
    const original = structuredClone(publishedLinks);
    assert.deepEqual(activeLandingLinks(publishedLinks), [
      { label: 'features', href: '#features' },
      { label: 'newsletter', href: '#newsletter' },
      { label: 'Overview', href: '#workspace' },
      { label: 'Roadmap', href: '#roadmap' },
      { label: 'Download', href: '/download/' },
      { label: 'Devlog', href: '/devlog/' },
      { label: 'Docs', href: 'https://docs.lomi.dev' },
    ]);
    assert.deepEqual(publishedLinks, original);
  });

  it('normalizes legacy download destinations without changing release notes', () => {
    const releases = 'https://github.com/lomi-dev/lomi/releases';
    const links = [
      { label: 'Download', href: '/#download' },
      { label: 'Download', href: releases },
      { label: 'Download lomi', href: `${releases}/` },
      { label: 'Release notes', href: releases },
      { label: 'Releases', href: `${releases}/` },
      { label: 'Download', href: 'https://example.test/releases' },
      { label: 'Download', href: '/download/' },
    ];
    assert.deepEqual(activeLandingLinks(links), [
      { label: 'Download', href: '/download/' },
      { label: 'Download', href: '/download/' },
      { label: 'Download lomi', href: '/download/' },
      ...links.slice(3),
    ]);
  });

  it('trims an authored download URL before exposing it to the page', () => {
    assert.equal(safeHref.parse('  /download/  '), '/download/');
  });

  it('preserves feature links that point back to the landing page', () => {
    assert.deepEqual(activeLandingLinks([{ label: 'Features', href: '/#features' }]), [
      { label: 'Features', href: '/#features' },
    ]);
  });

  it('preserves newsletter links that point back to the landing page', () => {
    assert.deepEqual(activeLandingLinks([{ label: 'Newsletter', href: '/#newsletter' }]), [
      { label: 'Newsletter', href: '/#newsletter' },
    ]);
  });

  it('rejects unencrypted remote origins, credentials, and unexpected paths', async () => {
    for (const url of ['http://cms.example.test', 'https://user:password@cms.example.test', 'https://cms.example.test/other', 'https://cms.example.test/?draft=true']) {
      await assert.rejects(loadLanding(url), /CMS_URL/);
    }
  });
});


describe('website editor contract', () => {
  const document = () => structuredClone(landingSchema.parse(seed));
  const image = { id: 12, url: '/api/media/file/sentinel.png', alt: 'Uploaded image', mimeType: 'image/png', width: 640, height: 400 };

  it('hydrates legacy additions without overwriting published core copy', () => {
    const legacy = { ...seed, hero: { ...seed.hero, title: 'Authored legacy title' }, site: null, layout: [], pages: { remote: { description: [] } } };
    const parsed = landingSchema.parse(legacy);
    assert.equal(parsed.hero.title, 'Authored legacy title');
    assert.deepEqual(parsed.features.items.map(({ title }) => title), seed.features.items.map(({ title }) => title));
    assert.deepEqual(parsed.site, editorDefaults.site);
    assert.deepEqual(parsed.layout, editorDefaults.layout);
    assert.deepEqual(parsed.pages.remote.description, pageDefaults.remote.description);
    assert.equal(parsed.editorVersion, 0);
  });

  it('accepts a newly authored feature without an optional preview scene', () => {
    const value = document();
    const feature = { title: 'New CMS feature', description: 'New feature description', detail: 'Feature detail', image, video: null, alt: 'New upload alt' };
    const parsed = landingSchema.parse({ ...value, features: { ...value.features, items: [feature] } });
    assert.equal(parsed.features.items[0].title, feature.title);
    assert.equal(parsed.features.items[0].icon, 'terminal');
    assert.deepEqual(parsed.features.items[0].image, image);
  });

  it('hydrates preview controls in legacy and null content while preserving authored labels', () => {
    for (const controls of [undefined, null, { pausePreviewsLabel: null, resumePreviewsLabel: null }]) {
      const value = document();
      const parsed = landingSchema.parse({ ...value, features: { ...value.features, controls } });
      assert.equal(parsed.features.controls.pausePreviewsLabel, 'Pause previews');
      assert.equal(parsed.features.controls.resumePreviewsLabel, 'Play previews');
    }
    const value = document();
    const controls = { ...value.features.controls, pausePreviewsLabel: 'Stop previews', resumePreviewsLabel: 'Start previews' };
    assert.deepEqual(landingSchema.parse({ ...value, features: { ...value.features, controls } }).features.controls, controls);
  });

  it('defaults retired hidden fields without requiring editors to populate them', () => {
    for (const replacement of [null, undefined]) {
      const value = document();
      const legacy = {
        ...value, workflow: replacement, principles: replacement, faq: replacement, download: replacement,
        hero: { ...value.hero, eyebrow: replacement, note: replacement, previewCaption: replacement },
        features: { ...value.features, eyebrow: replacement },
        roadmap: { ...value.roadmap, eyebrow: replacement },
        newsletter: { ...value.newsletter, eyebrow: replacement },
        footer: { ...value.footer, tagline: replacement, colophon: replacement },
      };
      const parsed = landingSchema.parse(legacy);
      assert.equal(parsed.hero.title, value.hero.title);
      assert.equal(parsed.features.items[0].title, value.features.items[0].title);
      assert.equal(parsed.footer.signoff, value.footer.signoff);
    }
  });

  it('preserves intentionally empty editor arrays with the current marker', () => {
    const current = document();
    current.editorVersion = 1;
    current.layout = [];
    current.navigation.productGroups = [];
    current.footer.socials = [];
    current.pages.remote.description = [];
    const parsed = landingSchema.parse(current);
    assert.deepEqual(parsed.layout, []);
    assert.deepEqual(parsed.navigation.productGroups, []);
    assert.deepEqual(parsed.footer.socials, []);
    assert.deepEqual(parsed.pages.remote.description, []);
  });

  it('rejects duplicate and unsupported homepage sections', () => {
    for (const layout of [[{ section: 'hero', enabled: true }, { section: 'hero', enabled: false }], [{ section: 'admin', enabled: true }]]) {
      assert.equal(landingSchema.safeParse({ ...document(), layout }).success, false);
    }
  });

  it('rejects malformed settings, CSS injection, unsafe links and invalid YouTube IDs', () => {
    for (const update of [
      (value: any) => { value.site.theme.accent = '#fff;display:none'; },
      (value: any) => { value.site.theme.ink = 42; },
      (value: any) => { value.pages.download.showAur = 'true'; },
      (value: any) => { value.navigation.actionHref = 'javascript:alert(1)'; },
      (value: any) => { value.site.cookie.informationHref = '//evil.test'; },
      (value: any) => { value.hero.videoUrl = 'https://www.youtube.com/watch?v=short'; },
      (value: any) => { value.hero.videoUrl = 'https://evil.test/embed/dQw4w9WgXcQ'; },
    ]) {
      const value = document(); update(value);
      assert.equal(landingSchema.safeParse(value).success, false);
    }
  });

  it('accepts populated upload metadata and rejects unsafe or unpopulated relationships', () => {
    const valid = document();
    valid.hero.poster = image;
    valid.hero.video = { ...image, url: '/api/media/file/clip.webm', mimeType: 'video/webm' };
    valid.features.items[0].image = image;
    assert.deepEqual(landingSchema.parse(valid).hero.poster, image);
    for (const upload of [12, '12', { ...image, url: 'javascript:alert(1)' }, { ...image, url: '/api/media/file/../secret' },
      { ...image, mimeType: 'image/svg+xml' }, { ...image, mimeType: 'video/mp4' }, { ...image, width: -1 }]) {
      assert.equal(landingSchema.safeParse({ ...document(), hero: { ...document().hero, poster: upload } }).success, false);
    }
    assert.equal(landingSchema.safeParse({ ...document(), hero: { ...document().hero, video: image } }).success, false);
  });

  it('filters disabled home anchors while retaining legal-page anchors and external routes', () => {
    const links = [
      { label: 'Workspace', href: '#workspace' }, { label: 'Features', href: '/#features' },
      { label: 'Newsletter', href: '#newsletter' }, { label: 'Roadmap', href: '#roadmap' },
      { label: 'Privacy', href: '/cookies/#preferences' }, { label: 'Remote', href: '/remote/#section' },
    ];
    const layout = [{ section: 'hero', enabled: true }, { section: 'features', enabled: false }, { section: 'roadmap', enabled: true }, { section: 'newsletter', enabled: false }];
    assert.deepEqual(activeLandingLinks(links, layout), [links[0], links[3], links[4], links[5]]);
  });
});
