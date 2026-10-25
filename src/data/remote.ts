import type { Landing } from '../../content/landing-schema';
import { pageDefaults } from '../../content/page-defaults';

export const remoteLaunch = {
  newsletter: {
    title: 'Get Remote launch news.',
    description: 'Join the newsletter and get an email when Lomi Remote is available.',
    submitLabel: 'Notify me at launch',
    successLabel: 'You’re on the list',
    successMessage: 'You’re subscribed. Look out for Lomi Remote launch news in your inbox.',
  },
} as const;

const legacyDescription = new Map([
  ['Run a workspace host on your computer or server.', pageDefaults.remote.description[0].text],
  ['Lomi Remote is still in development.', pageDefaults.remote.description[1].text],
]);
const legacySeoDescription = 'Get the lomi remote installation command for macOS, Linux or Windows. A native host in development for your computer or server.';

// Older published CMS defaults must not keep advertising an unavailable installer.
// Authored page copy, uploads, visibility flags and legacy field data stay intact.
export function remoteLaunchContent(content: Landing['pages']['remote']): Landing['pages']['remote'] {
  return {
    ...content,
    title: content.title === 'Get lomi remote.' ? pageDefaults.remote.title : content.title,
    description: content.description.map((line) => ({ ...line, text: legacyDescription.get(line.text) ?? line.text })),
    seo: {
      ...content.seo,
      title: /^lomi remote\s*[|—]\s*A host for your workspace$/i.test(content.seo.title)
        ? pageDefaults.remote.seo.title : content.seo.title,
      description: content.seo.description === legacySeoDescription
        ? pageDefaults.remote.seo.description : content.seo.description,
    },
  };
}
