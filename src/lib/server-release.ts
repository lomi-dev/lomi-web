import { createHash } from 'node:crypto';

const platforms = ['linux-x86_64', 'linux-aarch64', 'macos-x86_64', 'macos-aarch64', 'windows-x86_64', 'windows-aarch64'] as const;
export type ServerPlatform = typeof platforms[number];
type Artifact = { url: string; sha256: string; size: number };
export type ServerTarget = {
  platform: ServerPlatform;
  archive: Artifact;
  linuxBootstrap?: {
    preflight: Artifact;
    manifest: Artifact;
    signature: Artifact;
    publicKey: Artifact;
    command: string;
    commandSha256: string;
  };
};
export type ServerRelease = {
  format: 1;
  version: string;
  releaseOrigin: string;
  releaseSet: Artifact;
  publicRoot: Artifact;
  targets: ServerTarget[];
};

function invalid(): never { throw new Error('The Remote installation catalog is invalid or differs from its independent digest pin.'); }
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const item = value as Record<string, unknown>;
  if (Object.keys(item).sort().join('\0') !== [...keys].sort().join('\0')) invalid();
  return item;
}
function digest(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) invalid();
  return value;
}
function https(value: unknown): URL {
  if (typeof value !== 'string' || value.length > 2048 || /[^\x21-\x7e]|[\\%]/.test(value)) invalid();
  let url: URL;
  try { url = new URL(value); } catch { return invalid(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.href !== value) invalid();
  return url;
}
function artifact(value: unknown, origin: URL): Artifact {
  const item = record(value, ['url', 'sha256', 'size']);
  const url = https(item.url);
  if (url.origin !== origin.origin || !url.pathname.startsWith(origin.pathname)
    || url.pathname.endsWith('/')
    || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(url.pathname.slice(origin.pathname.length))
    || url.pathname.split('/').some((part) => part === '.' || part === '..')
    || typeof item.size !== 'number' || !Number.isSafeInteger(item.size) || item.size < 1 || item.size > 2 ** 34) invalid();
  return { url: url.href, sha256: digest(item.sha256), size: item.size };
}

/** Public, independently reviewed build input. Never fetch executable commands
 * from a release host or the CMS while rendering the installation page. */
export function loadServerRelease(raw: string | undefined, expectedSha256: string | undefined): ServerRelease | null {
  if (!raw && !expectedSha256) return null;
  if (!raw || !expectedSha256 || Buffer.byteLength(raw, 'utf8') > 128 * 1024
    || createHash('sha256').update(raw).digest('hex') !== digest(expectedSha256)) invalid();
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return invalid(); }
  const item = record(parsed, ['format', 'version', 'releaseOrigin', 'releaseSet', 'publicRoot', 'targets']);
  if (item.format !== 1 || typeof item.version !== 'string'
    || !/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/.test(item.version) || item.version.length > 128) invalid();
  const origin = https(item.releaseOrigin);
  if (!origin.pathname.endsWith('/')) invalid();
  if (!Array.isArray(item.targets) || item.targets.length !== platforms.length) invalid();
  const seen = new Set<string>();
  const targets = item.targets.map((value): ServerTarget => {
    const initial = value as Record<string, unknown> | null;
    const linux = typeof initial?.platform === 'string' && initial.platform.startsWith('linux-');
    const target = record(value, linux ? ['platform', 'archive', 'linuxBootstrap'] : ['platform', 'archive']);
    if (typeof target.platform !== 'string' || !platforms.includes(target.platform as ServerPlatform) || seen.has(target.platform)) invalid();
    seen.add(target.platform);
    const result: ServerTarget = { platform: target.platform as ServerPlatform, archive: artifact(target.archive, origin) };
    if (linux) {
      const bootstrap = record(target.linuxBootstrap, ['preflight', 'manifest', 'signature', 'publicKey', 'command', 'commandSha256']);
      if (typeof bootstrap.command !== 'string' || bootstrap.command.length > 24 * 1024
        || !bootstrap.command.startsWith('/bin/sh -c ') || /[^\x20-\x7e\n]/.test(bootstrap.command)
        || createHash('sha256').update(bootstrap.command).digest('hex') !== digest(bootstrap.commandSha256)) invalid();
      const preflight = artifact(bootstrap.preflight, origin);
      if (!bootstrap.command.includes(preflight.url) || !bootstrap.command.includes(preflight.sha256)) invalid();
      result.linuxBootstrap = {
        preflight, manifest: artifact(bootstrap.manifest, origin), signature: artifact(bootstrap.signature, origin),
        publicKey: artifact(bootstrap.publicKey, origin), command: bootstrap.command, commandSha256: digest(bootstrap.commandSha256),
      };
    }
    return result;
  });
  return { format: 1, version: item.version, releaseOrigin: origin.href,
    releaseSet: artifact(item.releaseSet, origin), publicRoot: artifact(item.publicRoot, origin), targets };
}

export const serverTargetLabels: Record<ServerPlatform, string> = {
  'linux-x86_64': 'Linux · x86_64', 'linux-aarch64': 'Linux · ARM64',
  'macos-x86_64': 'macOS · Intel', 'macos-aarch64': 'macOS · Apple silicon',
  'windows-x86_64': 'Windows · x64', 'windows-aarch64': 'Windows · ARM64',
};
