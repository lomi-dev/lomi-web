export type PlatformId = 'macos' | 'windows' | 'linux';
export type PackageId = 'apple-silicon' | 'intel' | 'exe' | 'msi' | 'appimage' | 'deb' | 'rpm';

export const downloadPlatforms: Array<{
  id: PlatformId;
  label: string;
  description: string;
  packages: Array<{ id: PackageId; label: string; detail: string }>;
}> = [
  {
    id: 'macos', label: 'macOS', description: 'Choose the chip in your Mac.',
    packages: [
      { id: 'apple-silicon', label: 'Apple Silicon', detail: 'DMG for Macs with an Apple M-series chip.' },
      { id: 'intel', label: 'Intel', detail: 'DMG for Macs with an Intel processor.' },
    ],
  },
  {
    id: 'windows', label: 'Windows', description: 'Installers for Windows on x64 processors.',
    packages: [
      { id: 'exe', label: 'EXE installer', detail: 'Standard setup installer for Windows x64.' },
      { id: 'msi', label: 'MSI installer', detail: 'Windows Installer package for Windows x64.' },
    ],
  },
  {
    id: 'linux', label: 'Linux', description: 'Packages for Linux on x86_64 processors.',
    packages: [
      { id: 'appimage', label: 'AppImage', detail: 'Portable application package for Linux x86_64.' },
      { id: 'deb', label: 'Debian/Ubuntu', detail: 'DEB package for Debian-based distributions on amd64.' },
      { id: 'rpm', label: 'Fedora/RHEL', detail: 'RPM package for RPM-based distributions on x86_64.' },
    ],
  },
];

export const releaseApi = 'https://api.github.com/repos/lomi-dev/lomi/releases?per_page=10';
export const releaseFallback = 'https://github.com/lomi-dev/lomi/releases';

export type Release = {
  tag: string;
  url: string;
  publishedAt: string;
  assets: Array<{ name: string; url: string; size: number | null }>;
};

const version = String.raw`\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?`;
const assetPatterns: Partial<Record<`${PlatformId}:${PackageId}`, RegExp>> = {
  'macos:apple-silicon': new RegExp(`^Lomi_${version}_aarch64\\.dmg$`),
  'macos:intel': new RegExp(`^Lomi_${version}_x64\\.dmg$`),
  'windows:exe': new RegExp(`^Lomi_${version}_x64-setup\\.exe$`),
  'windows:msi': new RegExp(`^Lomi_${version}_x64_en-US\\.msi$`),
  'linux:appimage': new RegExp(`^Lomi_${version}_amd64\\.AppImage$`),
  'linux:deb': new RegExp(`^Lomi_${version}_amd64\\.deb$`),
  'linux:rpm': new RegExp(`^Lomi-${version}-\\d+\\.x86_64\\.rpm$`),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPathSegment(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
    && value !== '.' && value !== '..' && !/[\s/\\\u0000-\u001f\u007f]/.test(value);
}

// Check the origin and each decoded path component before exposing an API URL
// as a link. A download must belong to this repository and this release.
function isReleaseUrl(value: unknown, path: string[]): value is string {
  if (typeof value !== 'string' || !value.startsWith('https://github.com/')
    || /[\s\\?#\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.origin === 'https://github.com' && !url.username && !url.password
      && !url.search && !url.hash && url.href === value
      && samePath(url.pathname, path);
  } catch {
    return false;
  }
}

function samePath(pathname: string, expected: string[]): boolean {
  const segments = pathname.split('/').slice(1).map(decodeURIComponent);
  return segments.length === expected.length && segments.every((segment, index) => segment === expected[index]);
}

function parseRelease(value: unknown): Release | null {
  if (!isRecord(value) || value.draft !== false || value.prerelease !== false
    || !isPathSegment(value.tag_name) || typeof value.published_at !== 'string'
    || !Number.isFinite(Date.parse(value.published_at)) || !Array.isArray(value.assets)
    || !isReleaseUrl(value.html_url, ['lomi-dev', 'lomi', 'releases', 'tag', value.tag_name])) return null;

  const tag = value.tag_name;
  const assets: Release['assets'] = [];
  for (const asset of value.assets) {
    if (!isRecord(asset) || !isPathSegment(asset.name)
      || !isReleaseUrl(asset.browser_download_url, ['lomi-dev', 'lomi', 'releases', 'download', tag, asset.name])) continue;
    assets.push({
      name: asset.name,
      url: asset.browser_download_url,
      size: typeof asset.size === 'number' && Number.isSafeInteger(asset.size) && asset.size >= 0 ? asset.size : null,
    });
  }
  return { tag, url: value.html_url, publishedAt: value.published_at, assets };
}

export function resolveLatestRelease(payload: unknown): Release | null {
  if (!Array.isArray(payload)) return null;
  let latest: Release | null = null;
  for (const candidate of payload) {
    const release = parseRelease(candidate);
    if (release && (!latest || Date.parse(release.publishedAt) > Date.parse(latest.publishedAt))) latest = release;
  }
  return latest;
}

export function findPackage(release: Release | null, platform: PlatformId, packageId: PackageId): Release['assets'][number] | null {
  const pattern = assetPatterns[`${platform}:${packageId}`];
  return release && pattern ? release.assets.find((asset) => pattern.test(asset.name)) ?? null : null;
}

export async function fetchLatestRelease(signal?: AbortSignal): Promise<Release> {
  const response = await fetch(releaseApi, {
    headers: { Accept: 'application/vnd.github+json' },
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
  const release = resolveLatestRelease(await response.json());
  if (!release) throw new Error('No valid published stable release found');
  return release;
}
