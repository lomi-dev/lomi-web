import type { CollectionConfig } from 'payload'
import { devlogFields } from '../../../content/devlog-schema'

const validate = (name: Exclude<keyof typeof devlogFields, 'thumbnail'>) => (value: unknown) => {
  const result = devlogFields[name].safeParse(value)
  return result.success || result.error.issues[0]?.message || 'Enter a valid value.'
}

export const Devlogs: CollectionConfig = {
  slug: 'devlogs',
  labels: { singular: 'Devlog', plural: 'Devlogs' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'publishedAt', '_status'],
    description: 'Add real development videos. Save incomplete drafts, then publish when ready. Rebuild and redeploy the website to show published changes.',
  },
  defaultSort: '-publishedAt',
  access: {
    read: ({ req }) => req.user ? true : { _status: { equals: 'published' } },
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
    readVersions: ({ req }) => Boolean(req.user),
  },
  versions: { drafts: true, maxPerDoc: 20 },
  fields: [
    { name: 'title', type: 'text', required: true, maxLength: 160, validate: validate('title') },
    { name: 'videoUrl', label: 'YouTube URL', type: 'text', required: true, maxLength: 2000, validate: validate('videoUrl'), admin: { description: 'HTTPS YouTube watch, share, shorts, or embed URL. The site links to YouTube without loading an embedded player.' } },
    { name: 'publishedAt', type: 'date', required: true, validate: validate('publishedAt'), admin: { date: { pickerAppearance: 'dayAndTime' }, description: 'Display date and archive order. Published entries are public immediately; this is not a publishing schedule.' } },
    { name: 'description', type: 'textarea', maxLength: 1000, validate: validate('description') },
    { name: 'duration', type: 'text', maxLength: 12, validate: validate('duration'), admin: { description: 'Optional duration, such as 8:42 or 1:08:42.' } },
    { name: 'thumbnail', type: 'upload', relationTo: 'media', filterOptions: { mimeType: { in: ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif'] } }, admin: { description: 'Optional uploaded image. Without one, the website displays a local placeholder. YouTube thumbnails are never fetched automatically.' } },
    { name: 'thumbnailAlt', type: 'textarea', maxLength: 500, validate: validate('thumbnailAlt'), admin: { description: 'Optional image description; leave empty to use the media library alternative text.' } },
  ],
}
