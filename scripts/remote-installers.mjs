import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const platforms = ['linux', 'macos', 'windows'].flatMap((os) =>
  ['x86_64', 'aarch64'].map((arch) => `${os}-${arch}`));
const digestPattern = /^[0-9a-f]{64}$/;
const maxArchiveBytes = 512 * 1024 * 1024;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function reject() {
  throw new Error('Remote installation catalog rejected: supply the exact reviewed catalog and its independent SHA-256 pin.');
}

function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) reject();
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

/** Read only independently pinned, canonical output of build_installation_catalog.py. */
export function parseCatalog(raw, pin) {
  if (!raw && !pin) return null;
  if (typeof raw !== 'string' || typeof pin !== 'string' || !digestPattern.test(pin)
    || raw.length > 128 * 1024 || /[^\x20-\x7e]/.test(raw) || sha256(raw) !== pin) reject();
  let catalog;
  try { catalog = JSON.parse(raw); } catch { reject(); }
  // Besides preserving reviewed bytes, canonical form rejects duplicate JSON keys.
  if (JSON.stringify(canonical(catalog)) !== raw) reject();
  object(catalog, ['format', 'version', 'releaseOrigin', 'releaseSet', 'publicRoot', 'targets']);
  if (catalog.format !== 1 || typeof catalog.version !== 'string' || catalog.version.length > 128
    || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[A-Za-z0-9.-]+)?$/.test(catalog.version)) reject();

  const origin = catalog.releaseOrigin;
  if (typeof origin !== 'string' || !/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]+)?\/[A-Za-z0-9._~/-]*$/.test(origin)
    || !origin.endsWith('/')) reject();
  let parsed;
  try { parsed = new URL(origin); } catch { reject(); }
  if (!parsed.hostname || parsed.href !== origin || parsed.username || parsed.password) reject();

  function artifact(value, filename, limit = maxArchiveBytes) {
    object(value, ['url', 'sha256', 'size']);
    if (value.url !== origin + filename || typeof value.sha256 !== 'string' || !digestPattern.test(value.sha256)
      || !Number.isSafeInteger(value.size) || value.size < 1 || value.size > limit) reject();
  }

  artifact(catalog.releaseSet, 'release-set.json', 1024 * 1024);
  artifact(catalog.publicRoot, `release-root-${catalog.publicRoot?.sha256}.json`, 1024 * 1024);
  if (!Array.isArray(catalog.targets) || catalog.targets.length !== platforms.length) reject();
  const seen = new Set();
  for (const target of catalog.targets) {
    const linux = target?.platform?.startsWith?.('linux-');
    object(target, ['platform', 'archive', ...(linux ? ['linuxBootstrap'] : [])]);
    if (!platforms.includes(target.platform) || seen.has(target.platform)) reject();
    seen.add(target.platform);
    const base = `lomi-remote-${target.platform}-${catalog.version}`;
    artifact(target.archive, `${base}.zip`);
    if (linux) {
      const bootstrap = object(target.linuxBootstrap,
        ['preflight', 'manifest', 'signature', 'publicKey', 'command', 'commandSha256']);
      artifact(bootstrap.preflight, `${base}.install.sh`, 64 * 1024);
      artifact(bootstrap.manifest, `${base}.bootstrap-manifest`, 16 * 1024);
      artifact(bootstrap.signature, `${base}.sig`, 64);
      artifact(bootstrap.publicKey, `${base}.der`, 44);
      if (bootstrap.signature.size !== 64 || bootstrap.publicKey.size !== 44
        || typeof bootstrap.command !== 'string' || bootstrap.command.length > 24 * 1024
        || typeof bootstrap.commandSha256 !== 'string' || !digestPattern.test(bootstrap.commandSha256)
        || sha256(bootstrap.command) !== bootstrap.commandSha256
        || !bootstrap.command.includes(bootstrap.preflight.url)
        || !bootstrap.command.includes(bootstrap.preflight.sha256)) reject();
    }
  }
  return catalog;
}

// Catalog strings are restricted above; quote them even though none can contain a quote.
const shQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const psQuote = (value) => `'${value.replaceAll("'", "''")}'`;

/** Generate static first stages; no metadata or executable is fetched during the build. */
export async function renderInstallers(env = {}) {
  const catalog = parseCatalog(env.LOMI_REMOTE_INSTALLATION_CATALOG_JSON,
    env.LOMI_REMOTE_INSTALLATION_CATALOG_SHA256);
  if (!catalog) {
    const message = 'Lomi Remote: no signed release is published for installation yet. See https://lomi.dev/remote/.';
    return {
      'install.sh': `#!/bin/sh\nprintf '%s\\n' '${message}' >&2\nexit 1\n`,
      'install.ps1': `throw '${message}'\n`,
    };
  }
  const templates = await Promise.all(['install.sh.in', 'install.ps1.in'].map((name) =>
    readFile(new URL(`./remote-installers/${name}`, import.meta.url), 'utf8')));
  const shTargets = catalog.targets.filter((target) => !target.platform.startsWith('windows-')).map((target) => {
    const asset = target.linuxBootstrap?.preflight ?? target.archive;
    return `        ${target.platform}) asset_url=${shQuote(asset.url)}; asset_sha256=${shQuote(asset.sha256)}; asset_size=${asset.size} ;;`;
  }).join('\n');
  const psTargets = catalog.targets.filter((target) => target.platform.startsWith('windows-')).map((target) => {
    const asset = target.archive;
    return `        ${psQuote(target.platform.slice('windows-'.length))} = @{ Url = ${psQuote(asset.url)}; Sha256 = ${psQuote(asset.sha256)}; Size = ${asset.size} }`;
  }).join('\n');
  const scripts = {
    'install.sh': templates[0].replaceAll('@@RELEASE_VERSION_SH@@', shQuote(catalog.version)).replaceAll('@@TARGETS_SH@@', shTargets),
    'install.ps1': templates[1].replaceAll('@@RELEASE_VERSION_PS@@', psQuote(catalog.version)).replaceAll('@@TARGETS_PS@@', psTargets),
  };
  if (Object.values(scripts).some((script) => /@@[A-Z_]+@@/.test(script))) {
    throw new Error('Remote installer template has an unresolved placeholder.');
  }
  return scripts;
}

export function remoteInstallers() {
  let scripts;
  return {
    name: 'lomi-remote-installers',
    hooks: {
      // Validate before an expensive build, and expose the same files in local dev.
      'astro:config:setup': async () => { scripts = await renderInstallers(process.env); },
      'astro:server:setup': ({ server }) => {
        server.middlewares.use((request, response, next) => {
          const name = request.url?.split('?')[0]?.match(/^\/remote\/(install\.(?:sh|ps1))$/)?.[1];
          if (!name) return next();
          response.setHeader('Content-Type', 'text/plain; charset=utf-8');
          response.setHeader('Cache-Control', 'no-store');
          response.setHeader('X-Content-Type-Options', 'nosniff');
          response.end(scripts[name]);
        });
      },
      'astro:build:done': async ({ dir }) => {
        const directory = new URL('remote/', dir);
        await mkdir(directory, { recursive: true });
        await Promise.all(Object.entries(scripts).map(([name, content]) =>
          writeFile(new URL(name, directory), content, { mode: 0o644 })));
        // Log readiness without printing the catalog, commands, or build environment.
        console.info(`Remote installers written to ${fileURLToPath(directory)}`);
      },
    },
  };
}
