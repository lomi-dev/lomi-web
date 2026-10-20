/// <reference types="bun" />
import { afterEach, describe, it, spyOn } from 'bun:test';
import assert from 'node:assert/strict';
import { downloadPlatforms, fetchLatestRelease, findPackage, releaseApi, resolveLatestRelease } from '../src/lib/downloads';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const filenames = [
  'Lomi_0.6.1_aarch64.dmg', 'Lomi_0.6.1_x64.dmg',
  'Lomi_0.6.1_x64-setup.exe', 'Lomi_0.6.1_x64_en-US.msi',
  'Lomi_0.6.1_amd64.AppImage', 'Lomi_0.6.1_amd64.deb', 'Lomi-0.6.1-1.x86_64.rpm',
];

function fixture(tag = 'v0.6.1', publishedAt = '2026-10-10T12:00:00Z', names = filenames) {
  return {
    draft: false, prerelease: false, tag_name: tag, published_at: publishedAt,
    html_url: `https://github.com/lomi-dev/lomi/releases/tag/${tag}`,
    assets: names.map((name) => ({ name, size: 1024, browser_download_url: `https://github.com/lomi-dev/lomi/releases/download/${tag}/${name}` })),
  };
}

describe('release selection and packages', () => {
  it('matches exactly the seven supported platform packages', () => {
    const release = resolveLatestRelease([fixture()]);
    assert.ok(release);
    let index = 0;
    for (const platform of downloadPlatforms) {
      for (const item of platform.packages) {
        const asset = findPackage(release, platform.id, item.id);
        assert.equal(asset?.name, filenames[index++]);
        assert.equal(asset?.size, 1024);
      }
    }
    assert.equal(index, 7);
    assert.equal(findPackage(release, 'windows', 'apple-silicon'), null);
    assert.equal(findPackage(null, 'macos', 'intel'), null);
  });

  it('selects by publication date without mutating the API list', () => {
    const payload = [fixture('v0.8.0', '2026-09-01'), fixture('v0.6.1'), fixture('v0.7.0', '2026-10-01')];
    const before = structuredClone(payload);
    assert.equal(resolveLatestRelease(payload)?.tag, 'v0.6.1');
    assert.deepEqual(payload, before);
  });

  it('excludes drafts, prereleases and unpublished or malformed entries', () => {
    const invalid: unknown[] = [
      null, [], 'release', 42, {},
      { ...fixture(), draft: true }, { ...fixture(), draft: undefined },
      { ...fixture(), prerelease: true }, { ...fixture(), prerelease: 'false' },
      { ...fixture(), prerelease: undefined },
      { ...fixture(), published_at: null }, { ...fixture(), published_at: '' },
      { ...fixture(), published_at: 'invalid' }, { ...fixture(), published_at: 123 },
      { ...fixture(), assets: null }, { ...fixture(), tag_name: '' },
    ];
    for (const candidate of invalid) assert.equal(resolveLatestRelease([candidate]), null, JSON.stringify(candidate));
    for (const payload of [null, {}, 'invalid', []]) assert.equal(resolveLatestRelease(payload), null);
    assert.equal(resolveLatestRelease([...invalid, fixture('v0.5.0', '2026-09-01')])?.tag, 'v0.5.0');
  });

  it('never substitutes an older release when the latest has a missing package', () => {
    const release = resolveLatestRelease([fixture('v0.5.0', '2026-09-01'), fixture('v0.6.1', undefined, [])]);
    assert.equal(release?.tag, 'v0.6.1');
    assert.equal(findPackage(release, 'macos', 'apple-silicon'), null);
    assert.equal(release?.url, 'https://github.com/lomi-dev/lomi/releases/tag/v0.6.1');
  });

  it('keeps anchored filename matching and accepts version suffixes', () => {
    for (const suffix of ['-beta.2', '+build.1']) {
      const release = resolveLatestRelease([fixture('v0.6.1', undefined, filenames.map((name) => name.replace('0.6.1', `0.6.1${suffix}`)))]);
      for (const platform of downloadPlatforms) {
        for (const item of platform.packages) assert.ok(findPackage(release, platform.id, item.id));
      }
    }
    const release = resolveLatestRelease([fixture('v0.6.1', undefined, [
      'prefix_Lomi_0.6.1_aarch64.dmg', 'Lomi_0.6.1_aarch64.dmg.sig',
      'Lomi_0.6.1_arm64-setup.exe', 'Lomi_0.6.1_aarch64.AppImage', 'Lomi_0.6.1_aarch64.deb',
    ])]);
    for (const platform of downloadPlatforms) {
      for (const item of platform.packages) assert.equal(findPackage(release, platform.id, item.id), null);
    }
  });
});

describe('untrusted release data', () => {
  it('rejects release URLs outside the precise repository and tag path', () => {
    const trusted = fixture().html_url;
    for (const url of [
      'javascript:alert(1)', trusted.replace('https:', 'http:'), trusted.replace('github.com', 'github.com.evil.test'),
      trusted.replace('github.com', 'user:pass@github.com'), trusted.replace('lomi-dev', 'other'),
      trusted.replace('v0.6.1', 'v0.5.0'), `${trusted}?x=1`, `${trusted}#x`, `${trusted}?`, `${trusted}#`, `${trusted}/`,
      trusted.replace('/lomi-dev', '/other/../lomi-dev'), trusted.replace('https://', 'https:///'),
      trusted.replace('github.com', 'git\nhub.com'), trusted.replace('/tag/', '/tag\\'),
    ]) assert.equal(resolveLatestRelease([{ ...fixture(), html_url: url }]), null, url);
  });

  it('discards unsafe assets while retaining valid metadata and safe assets', () => {
    const release = fixture();
    const asset = release.assets[0];
    const urls = [
      'javascript:alert(1)', asset.browser_download_url.replace('https:', 'http:'),
      asset.browser_download_url.replace('github.com', 'evil.test'),
      asset.browser_download_url.replace('github.com', 'name@github.com'),
      asset.browser_download_url.replace('lomi-dev', 'other'),
      asset.browser_download_url.replace('/v0.6.1/', '/v0.5.0/'),
      `${asset.browser_download_url}?download=1`, `${asset.browser_download_url}#x`,
      `${asset.browser_download_url}.exe`, asset.browser_download_url.replace('/download/', '/tag/'),
    ];
    for (const url of urls) {
      const result = resolveLatestRelease([{ ...release, assets: [{ ...asset, browser_download_url: url }, release.assets[1]] }]);
      assert.equal(result?.assets.length, 1, url);
      assert.equal(findPackage(result, 'macos', 'apple-silicon'), null, url);
      assert.ok(findPackage(result, 'macos', 'intel'));
    }
    const malformed = resolveLatestRelease([{ ...release, assets: [null, {}, { ...asset, name: '../file' }] }]);
    assert.deepEqual(malformed?.assets, []);
  });

  it('uses null for missing or invalid sizes and preserves zero bytes', () => {
    for (const size of [undefined, null, '100', -1, 1.5, Infinity, NaN]) {
      const release = fixture();
      const result = resolveLatestRelease([{ ...release, assets: [{ ...release.assets[0], size }] }]);
      assert.equal(result?.assets[0].size, null);
    }
    const release = fixture();
    assert.equal(resolveLatestRelease([{ ...release, assets: [{ ...release.assets[0], size: 0 }] }])?.assets[0].size, 0);
  });
});

describe('release fetching', () => {
  it('requests the fixed API with credentials omitted and forwards cancellation', async () => {
    const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json([fixture()]));
    const controller = new AbortController();
    assert.equal((await fetchLatestRelease(controller.signal)).tag, 'v0.6.1');
    assert.deepEqual(fetch.mock.calls[0], [releaseApi, {
      headers: { Accept: 'application/vnd.github+json' }, credentials: 'omit',
      redirect: 'error', cache: 'no-store', signal: controller.signal,
    }]);
  });

  it('rejects HTTP failures, malformed JSON and empty release responses', async () => {
    const fetch = spyOn(globalThis, 'fetch');
    fetch.mockResolvedValue(new Response('', { status: 503 }));
    await assert.rejects(fetchLatestRelease(), /HTTP 503/);
    fetch.mockResolvedValue(new Response('not json'));
    await assert.rejects(fetchLatestRelease());
    for (const payload of [[], {}, [{ ...fixture(), prerelease: true }]]) {
      fetch.mockResolvedValue(Response.json(payload));
      await assert.rejects(fetchLatestRelease(), /No valid published stable release/);
    }
  });

  it('propagates network and cancellation errors', async () => {
    const error = new DOMException('Aborted', 'AbortError');
    spyOn(globalThis, 'fetch').mockRejectedValue(error);
    await assert.rejects(fetchLatestRelease(), (received) => received === error);
  });
});
