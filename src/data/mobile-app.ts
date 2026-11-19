export const mobileAppPage = {
  seo: {
    title: 'Lomi Mobile | Lomi',
    description: 'A mobile companion for Lomi Remote is in development for iOS and Android. Get updates and explore the Lomi Remote workflow.',
  },
  title: 'Lomi Mobile.',
  description: 'Your workspaces and terminals, on your phone.',
  showcase: {
    eyebrow: 'A remote view of your workspace',
    title: 'Pick up the thread from your phone.',
    description: '',
    capabilities: [
      { title: 'Browse shared workspaces', description: 'Find the workspace you want to check in on.' },
      { title: 'Follow a terminal', description: 'Read the current output from a running desktop session.' },
      { title: 'Type from your phone', description: 'Use your keyboard to send input to the active terminal.' },
    ],
    imageAlt: 'Lomi Mobile development preview showing sample workspaces and recent terminal sessions.',
  },
  newsletter: {
    title: 'Be first to know.',
    description: 'Get an email when Lomi Mobile launches.',
    submitLabel: 'Notify me at launch',
    successLabel: 'You’re on the list',
    successMessage: 'You’re subscribed. Look out for Lomi Mobile launch news in your inbox.',
  },
} as const;
