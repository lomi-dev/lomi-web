export const mobileAppPage = {
  seo: {
    title: 'Lomi Mobile | Lomi',
    description: 'A mobile companion for Lomi Remote is in development for iOS and Android. Get updates and explore the Lomi Remote workflow.',
  },
  title: 'Lomi Mobile.',
  description: 'A companion for Lomi Remote, designed to bring your shared desktop workspaces and terminals to your phone.',
  showcase: {
    eyebrow: 'A remote view of your workspace',
    title: 'Pick up the thread from your phone.',
    description: 'Browse workspaces shared by your desktop, follow terminal output and use your phone keyboard to guide a session.',
    capabilities: [
      { title: 'Browse shared workspaces', description: 'Find the workspace you want to check in on.' },
      { title: 'Follow a terminal', description: 'Read the current output from a running desktop session.' },
      { title: 'Type from your phone', description: 'Use your keyboard to send input to the active terminal.' },
    ],
    imageAlt: 'Lomi Mobile development preview showing sample workspaces and recent terminal sessions.',
    imageCaption: 'Development preview · sample workspaces',
  },
  newsletter: {
    title: 'Be first to know.',
    description: 'Join the newsletter and get an email when Lomi Mobile is available for iOS and Android.',
    submitLabel: 'Notify me at launch',
    successLabel: 'You’re on the list',
    successMessage: 'You’re subscribed. Look out for Lomi Mobile launch news in your inbox.',
  },
} as const;
