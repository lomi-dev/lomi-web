import type { Field, GlobalConfig } from 'payload'

const validateText = (value: string | null | undefined) =>
  typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 2000
    ? true : 'Enter between 1 and 2000 characters (excluding surrounding whitespace).'
const text = (name: string): Field => ({ name, type: 'text', required: true, minLength: 1, maxLength: 2000, validate: validateText })
const prose = (name: string): Field => ({ name, type: 'textarea', required: true, minLength: 1, maxLength: 2000, validate: validateText })
const group = (name: string, fields: Field[]): Field => ({ name, type: 'group', fields })
const rows = (name: string, fields: Field[], maxRows = 6): Field => ({
  name, type: 'array', required: true, minRows: 1, maxRows, fields,
})
const intro = (): Field[] => [text('eyebrow'), text('title'), prose('description')]
const item = (): Field[] => [text('title'), prose('description')]
const link = (): Field[] => [
  text('label'),
  {
    name: 'href', type: 'text', required: true, minLength: 1, maxLength: 2000,
    validate: (value: string | null | undefined) => {
      if (validateText(value) !== true || typeof value !== 'string') return 'Enter an HTTPS URL or a #section anchor.'
      if (/^#[a-z][a-z0-9-]*$/.test(value)) return true
      try {
        const url = new URL(value)
        if (value.startsWith('https://') && url.protocol === 'https:' && url.hostname && !url.username && !url.password) return true
      } catch { /* Show the same concise error for invalid URLs. */ }
      return 'Enter an HTTPS URL or a #section anchor.'
    },
  },
]

export const Landing: GlobalConfig = {
  slug: 'landing',
  label: 'Launch landing page',
  access: {
    read: ({ req }) => req.user ? true : { _status: { equals: 'published' } },
    update: ({ req }) => Boolean(req.user),
    readVersions: ({ req }) => Boolean(req.user),
  },
  versions: { drafts: true, max: 20 },
  fields: [
    group('seo', [text('title'), prose('description')]),
    group('navigation', [rows('links', link()), text('actionLabel')]),
    group('hero', [
      ...intro(), text('accent'), text('primaryLabel'), text('secondaryLabel'),
      text('note'), text('previewCaption'), prose('previewAlt'),
    ]),
    group('workflow', [...intro(), rows('items', item())]),
    group('features', [
      ...intro(), text('accent'),
      rows('items', [
        { name: 'icon', type: 'select', required: true, options: ['terminal', 'panels', 'code', 'expand', 'git', 'spark'] },
        ...item(), text('detail'),
      ], 12),
    ]),
    group('principles', [...intro(), rows('items', item())]),
    group('roadmap', [
      ...intro(),
      rows('items', [
        text('phase'),
        { name: 'status', type: 'select', required: true, options: ['available', 'next', 'later'] },
        ...item(), rows('points', [text('label')], 8),
      ]),
      text('linkLabel'),
    ]),
    group('faq', [text('eyebrow'), text('title'), rows('items', [text('question'), prose('answer')], 16)]),
    group('download', [...intro(), text('accent'), text('primaryLabel'), text('secondaryLabel'), text('note')]),
    group('newsletter', intro()),
    group('footer', [
      text('tagline'), text('githubLabel'), rows('groups', [text('title'), rows('links', link(), 8)], 4),
      text('signoff'), text('backToTopLabel'), text('licenseLabel'), text('colophon'),
    ]),
  ],
}
