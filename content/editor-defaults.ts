/** Additional editable website settings; legacy landing fields retain their defaults. */
export const editorDefaults = {
  site: {
    brand: { name: 'lomi', logo: null, logoAlt: 'lomi home', favicon: null, socialImage: null },
    theme: { accent: '#c8ff3d', accentHover: '#b6ef2b', accentPressed: '#a5d822', ink: '#0b0d0c', background: '#f7f8f3', paper: '#ffffff', muted: '#535c56', line: '#ccd2c7', focus: '#345600', dark: '#111610', darkText: '#f3f6ed' },
    githubUrl: 'https://github.com/lomi-dev/lomi', docsUrl: 'https://docs.lomi.dev', language: 'en', skipLabel: 'Skip to content',
    cookie: {
      title: 'Cookie settings', closeLabel: 'Close cookie settings', introduction: 'We remember your choice on this device. YouTube videos only load with your permission. Read our', informationLabel: 'cookie information', informationHref: '/cookies/', introductionSuffix: '.', customizeLabel: 'Customize', acceptLabel: 'Accept all', rejectLabel: 'Reject optional', necessaryLabel: 'Necessary', alwaysOnLabel: 'Always on', necessaryDescription: 'Remembers your privacy choice on this device. Always on.', mediaLabel: 'External media', mediaDescription: 'Allows embedded YouTube videos to connect your browser to YouTube.', retention: 'Your choice lasts 180 days. You can change it anytime in Cookie settings.', saveLabel: 'Save preferences', dismissLabel: 'Dismiss privacy notice', storageError: 'Your choice applies to this visit. Your browser couldn’t save it for next time.',
    },
  },
  navigation: {
    productLabel: 'Product', menuLabel: 'Menu', backLabel: 'Back', sourceLabel: 'GitHub', sourceAriaLabel: 'lomi source on GitHub', primaryAriaLabel: 'Primary navigation', mobileAriaLabel: 'Mobile navigation', actionHref: '/download/',
    productGroups: [
      { label: 'Workspace', links: [{ label: 'Features', href: '#features' }, { label: 'Remote', href: '/remote/' }, { label: 'Mobile App', href: '/mobile-app/' }] },
      { label: 'Project', links: [{ label: 'Documentation', href: 'https://docs.lomi.dev' }, { label: 'Source code', href: 'https://github.com/lomi-dev/lomi' }] },
      { label: 'Get started', links: [{ label: 'Download lomi', href: '/download/' }, { label: 'Release notes', href: 'https://github.com/lomi-dev/lomi/releases' }] },
    ],
  },
  footer: {
    socials: [{ label: 'LinkedIn', icon: 'linkedin', href: 'https://www.linkedin.com/company/lomidev/' }, { label: 'YouTube', icon: 'youtube', href: 'https://www.youtube.com/@lomidev' }],
    licenseHref: 'https://github.com/lomi-dev/lomi/blob/main/LICENSE', copyrightLabel: '© {year} lomi', cookieSettingsLabel: 'Cookie settings', ariaLabel: 'lomi footer', contentAriaLabel: 'Footer content', navigationAriaLabel: 'Footer navigation', socialsAriaLabel: 'Social media',
  },
  newsletter: {
    form: { ariaLabel: 'Newsletter signup', emailLabel: 'Email address', placeholder: 'you@example.com', submitLabel: 'Keep me posted', pendingLabel: 'Subscribing', successLabel: 'Subscribed', unavailableMessage: 'Newsletter signup is temporarily unavailable.', pendingMessage: 'Sending your signup', successMessage: 'Subscribed. Thanks for joining.', rateLimitMessage: 'Too many attempts. Please wait a moment and try again.', errorMessage: 'We couldn’t complete your signup. Please try again.', note: 'Occasional updates. Unsubscribe anytime.', noscript: 'Enable JavaScript to subscribe to the newsletter.' }, stampLabel: 'You’re on the list',
  },
  hero: { poster: null, video: null, mediaMode: 'youtube', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', primaryHref: '/download/', secondaryHref: '#newsletter', player: {
    videoTitle: 'Lomi product walkthrough', privacyLabel: 'Video privacy settings', watchLabel: 'Watch the Lomi walkthrough on YouTube', loadingLabel: 'Loading video.', readyLabel: 'Video controls are ready.', errorLabel: 'The video could not load.',
    controlsLabel: 'Video controls', playLabel: 'Play video', pauseLabel: 'Pause video', replayLabel: 'Replay video', muteLabel: 'Mute video', unmuteLabel: 'Unmute video', volumeLabel: 'Volume', seekLabel: 'Seek video', fullscreenLabel: 'Enter fullscreen', exitFullscreenLabel: 'Exit fullscreen', retryLabel: 'Try again', timeLabel: '{current} of {duration}',
  } },
  features: { controls: { closeLabel: 'Close feature details', previousLabel: 'Previous feature', nextLabel: 'Next feature', chooseLabel: 'Choose a feature', showLabel: 'Show {title}', pausePreviewsLabel: 'Pause previews', resumePreviewsLabel: 'Play previews' } },
  roadmap: { href: 'https://github.com/lomi-dev/lomi/issues', ui: { legendCompleted: 'Completed', legendProgress: 'In progress', legendPlanned: 'Not started', legendLabel: 'Task statuses', progressTemplate: '{completed} of {total} completed', progressLabel: '{phase} progress', scrollHint: 'Scroll to explore', previousLabel: 'Previous stage', nextLabel: 'Next stage', stagesLabel: 'Roadmap stages', exploreLabel: 'Explore {phase}' } },
  layout: [{ section: 'hero', enabled: true }, { section: 'features', enabled: true }, { section: 'roadmap', enabled: true }, { section: 'newsletter', enabled: true }],
};
