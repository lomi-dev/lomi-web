import type { Field, GlobalConfig } from 'payload'
import { editorDefaults } from '../../../content/editor-defaults'
import { pageDefaults } from '../../../content/page-defaults'
import { captureWebsitePatch, hydrateWebsiteRead, prepareWebsiteWrite } from '../hooks/editorContent'
import { fieldsFromDefaults } from '../fields/fromDefaults'
import { isSafeHref } from '../../../content/links'
import {
  captureGlobalDraftWrite,
  queuePublishedLandingRebuild,
} from '../jobs/rebuildSite'

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
    validate: (value: string | null | undefined) =>
      isSafeHref(value) ? true : 'Enter an HTTPS link, email address, /, /devlog/, /download/, /remote/, /cookies/, /claude-code/, /codex/, or a #section anchor.',
  },
]

export const Landing: GlobalConfig = {
  slug: 'landing',
  label: 'Website',
  admin: { description: 'Save a draft while editing, then publish. Rebuild and redeploy the website to show published changes.' },
  access: {
    read: ({ req }) => req.user ? true : { _status: { equals: 'published' } },
    update: ({ req }) => Boolean(req.user),
    readVersions: ({ req }) => Boolean(req.user),
  },
  versions: { drafts: true, max: 20 },
  hooks: {
    beforeOperation: [captureWebsitePatch, captureGlobalDraftWrite],
    afterChange: [queuePublishedLandingRebuild],
    afterRead: [hydrateWebsiteRead],
    beforeValidate: [prepareWebsiteWrite],
  },
  fields: websiteFields([
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
        { name: 'icon', label: 'Preview scene', type: 'select', options: [
          { label: 'Terminal session', value: 'terminal' },
          { label: 'Workspace panels', value: 'panels' },
          { label: 'Code editor', value: 'code' },
          { label: 'Browser preview', value: 'expand' },
          { label: 'Git workflow', value: 'git' },
          { label: 'Coding agents', value: 'spark' },
        ], admin: { description: 'Used only when Image and Video are empty.' } },
        ...item(), text('detail'),
      ], 12),
    ]),
    group('principles', [...intro(), rows('items', item())]),
    group('roadmap', [
      ...intro(),
      rows('items', [
        text('phase'),
        { name: 'status', type: 'select', required: true, options: ['available', 'next', 'later'] },
        ...item(), rows('points', [
          text('label'),
          {
            name: 'status', type: 'select',
            options: [
              { label: 'Completed', value: 'completed' },
              { label: 'In progress', value: 'in-progress' },
              { label: 'Not started', value: 'not-started' },
            ],
            admin: {
              description: 'Leave empty to inherit Completed for an available milestone, or Not started for other milestones.',
            },
          },
        ], 8),
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
  ]),
}


function websiteFields(legacy: Field[]): Field[] {
  const find = (name: string) => legacy.find((field) => 'name' in field && field.name === name) as Extract<Field, { type: 'group' }>
  const merge = (name: keyof typeof editorDefaults) => {
    const original = find(name)
    const extras = fieldsFromDefaults(editorDefaults[name] as Record<string, unknown>, name)
    return original ? { ...original, fields: [...original.fields, ...extras] } : group(name, extras)
  }
  const optional = (field: Field): Field => {
    const copy = { ...field } as Field & { required?: boolean; minRows?: number; minLength?: number; validate?: unknown; fields?: Field[] }
    delete copy.required
    delete copy.minRows
    delete copy.minLength
    delete copy.validate
    if (copy.fields) copy.fields = copy.fields.map(optional)
    return copy as Field
  }
  for (const [name, obsolete] of Object.entries({ hero: ['eyebrow', 'note', 'previewCaption'], features: ['eyebrow'], roadmap: ['eyebrow'], newsletter: ['eyebrow'], footer: ['tagline', 'colophon'] })) {
    const original = find(name)
    original.fields = original.fields.map((field) => 'name' in field && obsolete.includes(field.name) ? { ...optional(field), admin: { hidden: true } } as Field : field)
  }
  const feature = merge('features') as Extract<Field, { type: 'group' }>
  feature.fields = feature.fields.map((field) => 'name' in field && field.name === 'items' && field.type === 'array'
    ? { ...field, admin: { ...field.admin, initCollapsed: true }, fields: [...field.fields, ...fieldsFromDefaults({ image: null, video: null, alt: '' }, 'features.items[]')] } : field)
  const retired = ['workflow', 'principles', 'faq', 'download'].map((name) => ({ ...optional(find(name)), admin: { hidden: true } } as Field))
  retired.push({ ...optional(merge('roadmap')), admin: { hidden: true } } as Field)
  const collapse = (label: string, field: Field): Field => ({
    type: 'collapsible', label, admin: { initCollapsed: true }, fields: [{ ...field, label: false } as Field],
  })
  const pages = fieldsFromDefaults(pageDefaults, 'pages').map((field) => collapse(
    ({ download: 'Download page', remote: 'Remote page', devlog: 'Devlog page', cookies: 'Cookies and privacy page' } as Record<string, string>)[('name' in field && field.name) || ''] ?? 'Page content', field,
  ))
  return [{ name: 'editorVersion', type: 'number', admin: { hidden: true } }, { type: 'tabs', tabs: [
    { label: 'Navigation', fields: [merge('navigation')] },
    { label: 'Footer', fields: [merge('footer')] },
    { label: 'Site settings', fields: [find('seo'), merge('site')] },
    { label: 'Homepage', fields: [collapse('Hero', merge('hero')), collapse('Features', feature), collapse('Newsletter', merge('newsletter')), collapse('Section order and visibility', fieldsFromDefaults({ layout: editorDefaults.layout })[0])] },
    { label: 'Page content', fields: [group('pages', pages)] },
  ] }, ...retired]
}
