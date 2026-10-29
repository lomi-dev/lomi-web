import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseCatalog, renderInstallers } from './remote-installers.mjs';

const origin = 'https://updates.example.invalid/lomi/';
const platforms = ['linux', 'macos', 'windows'].flatMap((system) =>
  ['x86_64', 'aarch64'].map((architecture) => `${system}-${architecture}`));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const pin = (raw) => hash(raw);
const pwshExecutable = process.env.LOMI_TEST_PWSH || 'pwsh';
const pwshProbe = spawnSync(pwshExecutable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'], { encoding: 'utf8' });
const powershellSkip = pwshProbe.status === 0 ? false : `${pwshExecutable} is unavailable`;
const envFor = (catalog) => {
  const raw = JSON.stringify(sortObject(catalog));
  return {
    LOMI_REMOTE_INSTALLATION_CATALOG_JSON: raw,
    LOMI_REMOTE_INSTALLATION_CATALOG_SHA256: pin(raw),
  };
};

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
  }
  return value;
}

function makeCatalog({ version = '0.1.0', preflightBytes = '#!/bin/sh\nexit 0\n',
  preflightSize, commandMarker = 'UNIQUE_COMMAND_MUST_NOT_BE_EVALUATED' } = {}) {
  const releaseSetHash = hash('release-set');
  const publicRootHash = hash('public-root');
  const targets = platforms.map((platform) => {
    const base = `lomi-remote-${platform}-${version}`;
    const archive = {
      url: `${origin}${base}.zip`,
      sha256: hash(`archive:${platform}`),
      size: 512,
    };
    const target = { platform, archive };
    if (platform.startsWith('linux-')) {
      const preflight = {
        url: `${origin}${base}.install.sh`,
        sha256: hash(preflightBytes),
        size: preflightSize ?? Buffer.byteLength(preflightBytes),
      };
      const command = `#!/bin/sh\n# ${commandMarker}\n# ${preflight.url}\n# ${preflight.sha256}\n`;
      target.linuxBootstrap = {
        preflight,
        manifest: { url: `${origin}${base}.bootstrap-manifest`, sha256: hash(`manifest:${platform}`), size: 128 },
        signature: { url: `${origin}${base}.sig`, sha256: hash(`signature:${platform}`), size: 64 },
        publicKey: { url: `${origin}${base}.der`, sha256: hash(`public-key:${platform}`), size: 44 },
        command,
        commandSha256: hash(command),
      };
    }
    return target;
  });
  return {
    format: 1,
    version,
    releaseOrigin: origin,
    releaseSet: { url: `${origin}release-set.json`, sha256: releaseSetHash, size: 256 },
    publicRoot: { url: `${origin}release-root-${publicRootHash}.json`, sha256: publicRootHash, size: 512 },
    targets,
  };
}

function rejected(catalog, message = '') {
  const { LOMI_REMOTE_INSTALLATION_CATALOG_JSON: raw,
    LOMI_REMOTE_INSTALLATION_CATALOG_SHA256: digest } = envFor(catalog);
  assert.throws(() => parseCatalog(raw, digest), message ? new RegExp(message) : undefined);
}

async function withTempDirectory(callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lomi-remote-installers-'));
  try {
    await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function makeFakeCommands(directory) {
  const bin = path.join(directory, 'bin');
  await mkdir(bin);
  const curlPath = path.join(bin, 'curl');
  const unamePath = path.join(bin, 'uname');
  await writeFile(curlPath, `#!/bin/sh
printf '%s\\n' "$*" >> "$CURL_LOG"
if [ "\${CURL_FAIL:-0}" = 1 ]; then exit 22; fi
url=
output=
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o|--output) output=$2; shift 2 ;;
    http://*|https://*) url=$1; shift ;;
    *) shift ;;
  esac
done
[ "$url" = "$PREFLIGHT_URL" ] || exit 7
if [ -n "$output" ]; then cp "$PREFLIGHT_SOURCE" "$output"; else cat "$PREFLIGHT_SOURCE"; fi
copy_status=$?
[ "$copy_status" = 0 ] || exit "$copy_status"
if [ "\${CURL_FAIL_AFTER_WRITE:-0}" = 1 ]; then exit 22; fi
`, { mode: 0o755 });
  await writeFile(unamePath, `#!/bin/sh
case "$1" in
  -s) printf '%s\\n' "$FAKE_UNAME_S" ;;
  -m) printf '%s\\n' "$FAKE_UNAME_M" ;;
  *) exit 2 ;;
esac
`, { mode: 0o755 });
  return { bin, path: `${bin}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin` };
}

function runShell(scriptPath, args, env) {
  return spawnSync('/bin/sh', [scriptPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function runPowerShell(args, env = {}) {
  return spawnSync(pwshExecutable, ['-NoLogo', '-NoProfile', '-NonInteractive', ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

async function shellFixture(directory, { bytes = `#!/bin/sh
{
  printf '%s\\n' "$#"
  printf '<%s>\\n' "$@"
} > "$PREFLIGHT_CAPTURE"
`, expectedSize = Buffer.byteLength(bytes) } = {}) {
  const catalog = makeCatalog({ preflightBytes: bytes, preflightSize: expectedSize });
  const installers = await renderInstallers(envFor(catalog));
  const scriptPath = path.join(directory, 'install.sh');
  await writeFile(scriptPath, installers['install.sh'], { mode: 0o755 });
  const fake = await makeFakeCommands(directory);
  const preflightPath = path.join(directory, 'preflight.sh');
  const logPath = path.join(directory, 'curl.log');
  const capturePath = path.join(directory, 'preflight-args.txt');
  await writeFile(preflightPath, bytes);
  const preflightUrl = catalog.targets.find((target) => target.platform === 'linux-x86_64').linuxBootstrap.preflight.url;
  const commonEnv = {
    PATH: fake.path,
    HOME: directory,
    TMPDIR: directory,
    CURL_LOG: logPath,
    PREFLIGHT_URL: preflightUrl,
    PREFLIGHT_SOURCE: preflightPath,
    PREFLIGHT_CAPTURE: capturePath,
    FAKE_UNAME_S: 'Linux',
    FAKE_UNAME_M: 'x86_64',
  };
  return { catalog, installers, scriptPath, logPath, capturePath, commonEnv, preflightBytes: bytes };
}

async function macOSFixture(directory, architecture) {
  const archiveBytes = Buffer.from('synthetic macOS bundle; never installed or executed\n');
  const catalog = makeCatalog();
  const platform = architecture === 'arm64' ? 'macos-aarch64' : 'macos-x86_64';
  const target = catalog.targets.find((entry) => entry.platform === platform);
  target.archive.sha256 = hash(archiveBytes);
  target.archive.size = archiveBytes.length;
  const installers = await renderInstallers(envFor(catalog));
  const scriptPath = path.join(directory, 'install.sh');
  await writeFile(scriptPath, installers['install.sh'], { mode: 0o755 });

  const bin = path.join(directory, 'bin');
  await mkdir(bin);
  const writeExecutable = (name, body) => writeFile(path.join(bin, name), body, { mode: 0o755 });
  await writeExecutable('uname', String.raw`#!/bin/sh
printf '%s %s\n' "$1" "$FAKE_UNAME_M" >> "$MACOS_UNAME_LOG"
case "$1" in
  -s) printf '%s\n' "$FAKE_UNAME_S" ;;
  -m) printf '%s\n' "$FAKE_UNAME_M" ;;
  *) exit 2 ;;
esac
`);
  await writeExecutable('curl', String.raw`#!/bin/sh
printf '%s\n' "$*" >> "$MACOS_CURL_LOG"
output=
url=
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o|--output) output=$2; shift 2 ;;
    http://*|https://*) url=$1; shift ;;
    *) shift ;;
  esac
done
[ "$url" = "$MACOS_ARCHIVE_URL" ] || exit 7
if [ -n "$output" ]; then cp "$MACOS_ARCHIVE_SOURCE" "$output"; else cat "$MACOS_ARCHIVE_SOURCE"; fi
`);
  await writeExecutable('ditto', String.raw`#!/bin/sh
[ "$#" -eq 4 ] && [ "$1" = -x ] && [ "$2" = -k ] || exit 2
printf '%s\n' "$4" >> "$MACOS_EXTRACT_LOG"
mkdir -p "$4/bundle" || exit 3
printf '%s\n' '# synthetic signed installer; never run by this mock' > "$4/bundle/install.sh"
printf '%s\n' 'synthetic updater' > "$4/bundle/lomi-update-trust"
`);
  await writeExecutable('codesign', String.raw`#!/bin/sh
[ "$#" -eq 3 ] && [ "$1" = --verify ] && [ "$2" = --strict ] || exit 2
[ -f "$3" ] || exit 3
printf '%s\n' "$3" >> "$MACOS_CODESIGN_LOG"
`);
  await writeExecutable('sudo', String.raw`#!/bin/sh
for argument do printf '<%s>\n' "$argument" >> "$MACOS_SUDO_LOG"; done
`);
  await writeExecutable('id', String.raw`#!/bin/sh
case "$1" in
  -u) printf '%s\n' 501 ;;
  -un) printf '%s\n' ignored-user ;;
  *) exit 2 ;;
esac
`);
  await writeExecutable('sysctl', String.raw`#!/bin/sh
[ "$#" -eq 2 ] && [ "$1" = -n ] && [ "$2" = hw.optional.arm64 ] || exit 2
printf '%s\n' "$FAKE_SYSCTL_NATIVE_ARM64"
`);

  const archivePath = path.join(directory, 'archive.zip');
  const logPath = path.join(directory, 'curl.log');
  const extractLogPath = path.join(directory, 'ditto.log');
  const codesignLogPath = path.join(directory, 'codesign.log');
  const sudoLogPath = path.join(directory, 'sudo.log');
  const unameLogPath = path.join(directory, 'uname.log');
  await writeFile(archivePath, archiveBytes);
  return {
    catalog,
    scriptPath,
    target,
    env: {
      PATH: `${bin}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
      HOME: directory,
      TMPDIR: directory,
      FAKE_UNAME_S: 'Darwin',
      FAKE_UNAME_M: architecture,
      FAKE_SYSCTL_NATIVE_ARM64: '0',
      MACOS_ARCHIVE_SOURCE: archivePath,
      MACOS_ARCHIVE_URL: target.archive.url,
      MACOS_CURL_LOG: logPath,
      MACOS_EXTRACT_LOG: extractLogPath,
      MACOS_CODESIGN_LOG: codesignLogPath,
      MACOS_SUDO_LOG: sudoLogPath,
      MACOS_UNAME_LOG: unameLogPath,
      LOMI_REMOTE_ACCOUNT: 'installer-test-account',
      LOMI_REMOTE_HOST_MODE: 'manual',
    },
    logPath,
    extractLogPath,
    codesignLogPath,
    sudoLogPath,
    unameLogPath,
  };
}

test('parseCatalog accepts a canonical independently pinned catalog', () => {
  const { LOMI_REMOTE_INSTALLATION_CATALOG_JSON: raw,
    LOMI_REMOTE_INSTALLATION_CATALOG_SHA256: digest } = envFor(makeCatalog());
  const parsed = parseCatalog(raw, digest);
  assert.equal(parsed.version, '0.1.0');
  assert.deepEqual(parsed.targets.map((target) => target.platform), platforms);
});
test('parseCatalog permits the unconfigured state only when both inputs are absent', () => {
  assert.equal(parseCatalog(undefined, undefined), null);
  assert.equal(parseCatalog('', ''), null);
  assert.throws(() => parseCatalog(envFor(makeCatalog()).LOMI_REMOTE_INSTALLATION_CATALOG_JSON, undefined));
  assert.throws(() => parseCatalog(undefined, 'a'.repeat(64)));
});

test('parseCatalog rejects malformed input, noncanonical JSON, and a mismatched pin', () => {
  const { LOMI_REMOTE_INSTALLATION_CATALOG_JSON: raw,
    LOMI_REMOTE_INSTALLATION_CATALOG_SHA256: digest } = envFor(makeCatalog());
  assert.throws(() => parseCatalog('{not json', pin('{not json')));
  assert.throws(() => parseCatalog(` ${raw}`, pin(` ${raw}`)));
  assert.throws(() => parseCatalog(raw, '0'.repeat(64)));
  assert.throws(() => parseCatalog('{"format":1,"format":1}', pin('{"format":1,"format":1}')));
  assert.equal(parseCatalog(raw, digest).format, 1);
});

test('parseCatalog rejects unknown schema keys at catalog, artifact, and target levels', () => {
  const catalog = makeCatalog();
  catalog.unrecognized = true;
  rejected(catalog);

  const artifactCatalog = makeCatalog();
  artifactCatalog.releaseSet.extra = 'not allowed';
  rejected(artifactCatalog);

  const targetCatalog = makeCatalog();
  targetCatalog.targets[0].extra = 'not allowed';
  rejected(targetCatalog);
});

test('parseCatalog rejects incomplete catalogs and duplicate or missing platforms', () => {
  const catalog = makeCatalog();
  delete catalog.targets[0].linuxBootstrap.signature;
  rejected(catalog);

  const duplicate = makeCatalog();
  duplicate.targets[5] = structuredClone(duplicate.targets[4]);
  rejected(duplicate);

  const missing = makeCatalog();
  missing.targets.pop();
  rejected(missing);
});

test('parseCatalog rejects insecure or foreign URLs and oversized artifacts', () => {
  const insecure = makeCatalog();
  insecure.releaseOrigin = insecure.releaseOrigin.replace('https://', 'http://');
  insecure.releaseSet.url = insecure.releaseSet.url.replace('https://', 'http://');
  rejected(insecure);

  const foreign = makeCatalog();
  foreign.targets[0].archive.url = 'https://attacker.example/lomi-remote-linux-x86_64-0.1.0.zip';
  rejected(foreign);

  const oversized = makeCatalog();
  oversized.targets[0].archive.size = 512 * 1024 * 1024 + 1;
  rejected(oversized);
});

test('parseCatalog rejects prereleases and mismatched Linux command metadata', () => {
  rejected(makeCatalog({ version: '0.1.0-rc.1' }));

  const commandDigest = makeCatalog();
  commandDigest.targets[0].linuxBootstrap.commandSha256 = 'a'.repeat(64);
  rejected(commandDigest);

  const missingPreflightPin = makeCatalog();
  missingPreflightPin.targets[0].linuxBootstrap.command = '#!/bin/sh\n# no reviewed url or pin\n';
  missingPreflightPin.targets[0].linuxBootstrap.commandSha256 = hash(missingPreflightPin.targets[0].linuxBootstrap.command);
  rejected(missingPreflightPin);
});

test('renderInstallers bakes platform metadata without embedding the Linux command', async () => {
  const catalog = makeCatalog();
  const installers = await renderInstallers(envFor(catalog));
  const linuxTarget = catalog.targets.find((target) => target.platform === 'linux-x86_64');
  const preflight = linuxTarget.linuxBootstrap.preflight;

  assert.match(installers['install.sh'], /0\.1\.0/);
  assert.ok(installers['install.sh'].includes(preflight.url));
  assert.ok(installers['install.sh'].includes(preflight.sha256));
  assert.ok(installers['install.sh'].includes(String(preflight.size)));
  assert.ok(installers['install.sh'].includes(catalog.targets.find((target) => target.platform === 'macos-aarch64').archive.url));
  assert.ok(!installers['install.sh'].includes('UNIQUE_COMMAND_MUST_NOT_BE_EVALUATED'));
  assert.ok(installers['install.ps1'].includes(catalog.targets.find((target) => target.platform === 'windows-x86_64').archive.url));
});

test('generated Unix installer forwards all arguments to a verified Linux preflight', async () => {
  await withTempDirectory(async (directory) => {
    const fixture = await shellFixture(directory);
    const result = runShell(fixture.scriptPath,
      ['--channel', 'preview', 'two words', '-x'], fixture.commonEnv);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(await readFile(fixture.capturePath, 'utf8'),
      '4\n<--channel>\n<preview>\n<two words>\n<-x>\n');
    const log = await readFile(fixture.logPath, 'utf8');
    assert.ok(log.includes(fixture.commonEnv.PREFLIGHT_URL));
  });
});

test('generated Unix installer rejects preflight hash and size mismatches before execution', async (t) => {
  await t.test('hash mismatch', async () => {
    await withTempDirectory(async (directory) => {
      const fixture = await shellFixture(directory);
      const sameSizeButDifferentBytes = fixture.preflightBytes.replace('"$#"', '"$@"');
      assert.equal(Buffer.byteLength(sameSizeButDifferentBytes), Buffer.byteLength(fixture.preflightBytes));
      await writeFile(fixture.commonEnv.PREFLIGHT_SOURCE, sameSizeButDifferentBytes);
      const result = runShell(fixture.scriptPath, [], fixture.commonEnv);
      assert.notEqual(result.status, 0);
      await assert.rejects(readFile(fixture.capturePath));
    });
  });

  await t.test('size mismatch', async () => {
    await withTempDirectory(async (directory) => {
      const fixture = await shellFixture(directory, { expectedSize: 500 });
      const result = runShell(fixture.scriptPath, [], fixture.commonEnv);
      assert.notEqual(result.status, 0);
      await assert.rejects(readFile(fixture.capturePath));
    });
  });
});

test('generated Unix installer stops on curl failure', async () => {
  await withTempDirectory(async (directory) => {
    const fixture = await shellFixture(directory);
    const result = runShell(fixture.scriptPath, [], { ...fixture.commonEnv, CURL_FAIL: '1' });
    assert.notEqual(result.status, 0);
    await assert.rejects(readFile(fixture.capturePath));
  });
});

test('generated Unix installer rejects curl failure even after receiving all pinned bytes', async () => {
  await withTempDirectory(async (directory) => {
    const fixture = await shellFixture(directory);
    const result = runShell(fixture.scriptPath, [], { ...fixture.commonEnv, CURL_FAIL_AFTER_WRITE: '1' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /download failed/);
    await assert.rejects(readFile(fixture.capturePath));
  });
});

test('unknown-length oversized downloads are bounded before reaching the temporary file', async () => {
  await withTempDirectory(async (directory) => {
    const fixture = await shellFixture(directory);
    const capture = path.join(directory, 'bounded-download');
    await writeFile(path.join(directory, 'bin', 'head'), String.raw`#!/bin/sh
/usr/bin/head "$@" | tee "$BOUNDED_CAPTURE"
`, { mode: 0o755 });
    // The fake curl ignores --max-filesize, simulating an older curl with no Content-Length.
    await writeFile(fixture.commonEnv.PREFLIGHT_SOURCE, Buffer.alloc(2 * 1024 * 1024, 65));
    const result = runShell(fixture.scriptPath, [], { ...fixture.commonEnv, BOUNDED_CAPTURE: capture });
    assert.notEqual(result.status, 0);
    const expected = fixture.catalog.targets[0].linuxBootstrap.preflight.size;
    assert.equal((await readFile(capture)).length, expected + 1);
    await assert.rejects(readFile(fixture.capturePath));
  });
});

test('help and unsupported Unix platforms exit before any curl request', async (t) => {
  await t.test('--help', async () => {
    await withTempDirectory(async (directory) => {
      const fixture = await shellFixture(directory);
      const result = runShell(fixture.scriptPath, ['--help'], fixture.commonEnv);
      assert.equal(result.status, 0, result.stderr || result.stdout);
      await assert.rejects(readFile(fixture.logPath));
    });
  });

  for (const [system, architecture] of [['FreeBSD', 'x86_64'], ['Linux', 'armv7l']]) {
    await t.test(`${system}/${architecture}`, async () => {
      await withTempDirectory(async (directory) => {
        const fixture = await shellFixture(directory);
        const result = runShell(fixture.scriptPath, [], {
          ...fixture.commonEnv,
          FAKE_UNAME_S: system,
          FAKE_UNAME_M: architecture,
        });
        assert.notEqual(result.status, 0);
        await assert.rejects(readFile(fixture.logPath));
      });
    });
  }
});

test('macOS dispatch verifies the bundle and forwards install arguments without real sudo', async (t) => {
  for (const architecture of ['x86_64', 'arm64']) {
    await t.test(architecture, async () => {
      await withTempDirectory(async (directory) => {
        const fixture = await macOSFixture(directory, architecture);
        const result = runShell(fixture.scriptPath,
          ['install', '--version', '0.1.0', '--no-path'], fixture.env);
        const curlOutput = await readFile(fixture.logPath, 'utf8').catch(() => '<curl was not invoked>');
        const unameOutput = await readFile(fixture.unameLogPath, 'utf8').catch(() => '<uname was not invoked>');
        assert.equal(result.status, 0, `${result.stderr || result.stdout}\nuname log: ${unameOutput}\ncurl log: ${curlOutput}`);
        const curlLog = await readFile(fixture.logPath, 'utf8');
        assert.ok(curlLog.includes(fixture.target.archive.url));

        const extractionDirectory = (await readFile(fixture.extractLogPath, 'utf8')).trim();
        const signedPaths = (await readFile(fixture.codesignLogPath, 'utf8')).trim().split('\n');
        assert.deepEqual(signedPaths, [
          path.join(extractionDirectory, 'bundle', 'install.sh'),
          path.join(extractionDirectory, 'bundle', 'lomi-update-trust'),
        ]);

        const forwarded = (await readFile(fixture.sudoLogPath, 'utf8')).trim().split('\n')
          .map((line) => line.slice(1, -1));
        assert.equal(forwarded[0], '/bin/sh');
        assert.match(forwarded[1], /\/bundle\/install\.sh$/);
        assert.deepEqual(forwarded.slice(2), [
          'admin-install', 'installer-test-account', 'manual',
          '--version', '0.1.0', '--no-path',
        ]);
      });
    });
  }
});

test('generated Unix installer parses and runs with dash when available', async (t) => {
  const dash = spawnSync('dash', ['-c', 'command -v dash'], { encoding: 'utf8' });
  if (dash.status !== 0) return t.skip('dash is not installed');
  await withTempDirectory(async (directory) => {
    const fixture = await shellFixture(directory);
    const result = spawnSync('dash', ['-n', fixture.scriptPath], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const installed = spawnSync('dash', [fixture.scriptPath, '--version', '0.1.0'], {
      encoding: 'utf8', env: { ...process.env, ...fixture.commonEnv },
    });
    assert.equal(installed.status, 0, installed.stderr || installed.stdout);
    assert.equal(await readFile(fixture.capturePath, 'utf8'), '2\n<--version>\n<0.1.0>\n');
  });
});

test('unconfigured Unix installer fails without starting a download', async () => {
  await withTempDirectory(async (directory) => {
    const installers = await renderInstallers();
    const shellPath = path.join(directory, 'install.sh');
    const shellLog = path.join(directory, 'curl.log');
    const fake = await makeFakeCommands(directory);
    await writeFile(shellPath, installers['install.sh'], { mode: 0o755 });

    const shellResult = runShell(shellPath, [], {
      PATH: fake.path,
      CURL_LOG: shellLog,
    });
    assert.notEqual(shellResult.status, 0);
    assert.match(shellResult.stderr, /no signed release is published (?:for installation )?yet/i);
    await assert.rejects(readFile(shellLog));
  });
});

test('unconfigured PowerShell installer fails without a download', { skip: powershellSkip }, async () => {
  await withTempDirectory(async (directory) => {
    const installers = await renderInstallers();
    const psPath = path.join(directory, 'install.ps1');
    await writeFile(psPath, installers['install.ps1']);
    const psResult = runPowerShell(['-File', psPath]);
    assert.notEqual(psResult.status, 0);
    assert.match(`${psResult.stderr}${psResult.stdout}`, /no signed release is published (?:for installation )?yet/i);
    assert.doesNotMatch(installers['install.ps1'], /HttpWebRequest|updates\.example\.invalid/i);
  });
});

test('generated PowerShell installer parses and handles help/version/platform arguments', { skip: powershellSkip }, async (t) => {
  await withTempDirectory(async (directory) => {
    const installers = await renderInstallers(envFor(makeCatalog()));
    const scriptPath = path.join(directory, 'install.ps1');
    await writeFile(scriptPath, installers['install.ps1']);

    const parseSource = [
      '$tokens = $null',
      '$parseErrors = $null',
      '[void][System.Management.Automation.Language.Parser]::ParseFile($env:LOMI_TEST_SCRIPT_PATH, [ref]$tokens, [ref]$parseErrors)',
      'if ($parseErrors.Count -gt 0) { $parseErrors | ForEach-Object { [Console]::Error.WriteLine($_.Message) }; exit 1 }',
    ].join('; ');
    const parseResult = runPowerShell(['-Command', parseSource], { LOMI_TEST_SCRIPT_PATH: scriptPath });
    assert.equal(parseResult.status, 0, parseResult.stderr || parseResult.stdout);

    const helpResult = runPowerShell(['-File', scriptPath, '--help']);
    assert.equal(helpResult.status, 0, helpResult.stderr || helpResult.stdout);
    assert.match(helpResult.stdout, /Usage: install\.ps1/);

    const mismatchResult = runPowerShell(['-File', scriptPath, '--version', '9.9.9']);
    assert.notEqual(mismatchResult.status, 0);
    assert.match(`${mismatchResult.stderr}${mismatchResult.stdout}`, /requested version differs/i);
    assert.doesNotMatch(`${mismatchResult.stderr}${mismatchResult.stdout}`, /only on Windows/i);

    // A saved script receives several CLI arguments. Correct version binding
    // must reach the platform guard instead of reporting a missing version.
    const nonWindowsResult = runPowerShell(['-File', scriptPath,
      '--version', '0.1.0', '--no-path']);
    assert.notEqual(nonWindowsResult.status, 0);
    assert.match(`${nonWindowsResult.stderr}${nonWindowsResult.stdout}`, /this installer runs only on Windows/i);
    assert.doesNotMatch(`${nonWindowsResult.stderr}${nonWindowsResult.stdout}`, /use --version VERSION/i);
  });
});
