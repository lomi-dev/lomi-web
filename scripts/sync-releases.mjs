// Snapshot the app's release notes (../lomi/releases) into content/releases.json for the devlog.
// Run from lomi-web: node scripts/sync-releases.mjs [path-to-lomi-repo]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const repo = process.argv[2] ?? '../lomi';
const dir = join(repo, 'releases');
const releases = readdirSync(dir).filter((f) => /^v\d+\.\d+\.\d+\.md$/.test(f)).map((file) => {
  const version = file.slice(1, -3);
  const text = readFileSync(join(dir, file), 'utf8').replace(/\*\*/g, '');
  const [summary] = text.split('\n').filter(Boolean);
  const highlights = [...text.matchAll(/^- (.+)$/gm)].map((m) => m[1]).filter((line) => !/installer|package|AUR|AppImage/i.test(line)).slice(0, 4);
  const date = execFileSync('git', ['-C', repo, 'log', '-1', '--format=%cs', `v${version}`], { encoding: 'utf8' }).trim();
  return { version, date, summary, highlights, href: `https://github.com/lomi-dev/lomi/releases/tag/v${version}` };
}).sort((a, b) => b.date.localeCompare(a.date) || b.version.localeCompare(a.version, undefined, { numeric: true }));
if (!releases.length) throw new Error(`no release notes in ${dir}`);
writeFileSync('content/releases.json', JSON.stringify(releases, null, 2) + '\n');
console.log(`${releases.length} releases, latest ${releases[0].version} (${releases[0].date})`);
