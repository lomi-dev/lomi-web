import type { Landing } from '../../content/landing-schema';
import { pageDefaults } from '../../content/page-defaults';

export const remoteLaunch = {
  newsletter: {
    title: 'Follow Remote releases.',
    description: 'Get an email when a new Lomi Remote release ships, Windows included.',
    submitLabel: 'Keep me posted',
    successLabel: 'You’re on the list',
    successMessage: 'You’re subscribed. Look out for Lomi Remote release news in your inbox.',
  },
} as const;

// The real installers (lomi-remote/README.md, release/README.md), served by this site at /remote/.
export const remoteInstall = {
  unix: { id: 'unix', label: 'macOS & Linux', command: 'curl -fsSL https://lomi.dev/remote/install.sh | sh', live: true },
  windows: { id: 'windows', label: 'Windows', command: 'powershell -ExecutionPolicy Bypass -c "irm https://lomi.dev/remote/install.ps1 | iex"', live: false },
} as const;

const legacyDescription = new Map([
  ['Host your workspaces and terminals on your computer or server, then pick them up from another screen.', pageDefaults.remote.description[0].text],
  ['Your workspaces and terminals, ready for another screen.', pageDefaults.remote.description[0].text],
  ['Run a workspace host on your computer or server.', pageDefaults.remote.description[0].text],
]);
const legacySeoDescriptions = new Set(['Get the lomi remote installation command for macOS, Linux or Windows. A native host in development for your computer or server.', 'Lomi Remote is an upcoming CLI host for your workspaces and terminals. Join the newsletter for launch news about macOS, Windows and Linux.']);

// Older published CMS defaults must not keep advertising an unavailable installer.
// Authored page copy, uploads, visibility flags and legacy field data stay intact.
export function remoteLaunchContent(content: Landing['pages']['remote']): Landing['pages']['remote'] {
  return {
    ...content,
    title: content.title === 'Get lomi remote.' ? pageDefaults.remote.title : content.title,
    // the old "coming soon" line no longer holds on macOS and Linux
    description: content.description.filter((line) => line.text !== 'Coming soon for your computer or server.' && line.text !== 'Lomi Remote is still in development.')
      .map((line) => ({ ...line, text: legacyDescription.get(line.text) ?? line.text })),
    seo: {
      ...content.seo,
      title: /^lomi remote\s*[|—]\s*A host for your workspace$/i.test(content.seo.title)
        ? pageDefaults.remote.seo.title : content.seo.title,
      description: legacySeoDescriptions.has(content.seo.description)
        ? pageDefaults.remote.seo.description : content.seo.description,
    },
  };
}
