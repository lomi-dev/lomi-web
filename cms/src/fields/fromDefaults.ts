import type { Field } from 'payload'
import { schemaFromDefaults } from '../../../content/editor-schema'

const label = (name: string) => name.replace(/([A-Z])/g, ' $1').replace(/^./, (first) => first.toUpperCase())

/** New fields stay optional so existing documents and drafts remain publishable. */
export function fieldsFromDefaults(defaults: Record<string, unknown>, prefix = ''): Field[] {
  return Object.entries(defaults).map(([name, value]): Field => {
    const path = prefix ? `${prefix}.${name}` : name
    const tokens = typeof value === 'string' ? [...new Set(value.match(/\{[a-zA-Z]+\}/g) ?? [])] : []
    const templateHelp = tokens.length ? `Keep ${tokens.join(', ')} in the text; the website replaces ${tokens.length === 1 ? 'it' : 'them'} automatically.` : undefined
    const hidden = ['site.docsUrl', 'roadmap.ui.previousLabel', 'roadmap.ui.nextLabel'].includes(path)
    const common = { name, label: label(name), ...(templateHelp || hidden ? { admin: { ...(templateHelp ? { description: templateHelp } : {}), ...(hidden ? { hidden: true } : {}) } } : {}) }
    if (value === null) {
      const video = /video/i.test(name)
      return { ...common, type: 'upload', relationTo: 'media', filterOptions: { mimeType: { in: video ? ['video/mp4', 'video/webm'] : ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif'] } }, admin: { description: video ? 'Optional uploaded MP4 or WebM video.' : 'Optional uploaded image. The website uses its built-in image when empty.' } }
    }
    if (Array.isArray(value)) {
      if (!value.length) throw new Error(`Missing row template for ${path}`)
      if (!value[0] || typeof value[0] !== 'object') throw new Error(`Editor arrays need record rows: ${path}`)
      return {
        ...common, type: 'array', maxRows: 50, fields: fieldsFromDefaults(value[0], `${path}[]`),
        admin: { initCollapsed: true, description: path === 'layout' ? 'Drag to reorder homepage sections. Each section may appear only once.' : 'Drag rows to change their order. Remove rows to hide them.' },
        ...(path === 'layout' ? { validate: (rows: unknown) => {
          if (rows == null) return true
          const names = (rows as { section?: string }[]).map((row) => row.section)
          return new Set(names).size === names.length || 'Each homepage section can appear only once.'
        } } : {}),
      }
    }
    if (typeof value === 'object') return { ...common, type: 'group', fields: fieldsFromDefaults(value as Record<string, unknown>, path) }
    if (typeof value === 'boolean') return { ...common, type: 'checkbox', defaultValue: value }
    if (typeof value === 'number') return { ...common, type: 'number', min: 0, max: 1000000 }
    const validate = (input: unknown) => {
      if (input == null) return true
      const result = schemaFromDefaults(value, path).safeParse(input)
      return result.success || result.error.issues[0]?.message || 'Enter a valid value.'
    }
    const options = name === 'section' ? ['hero', 'features', 'roadmap', 'newsletter']
      : name === 'mediaMode' ? ['image', 'youtube', 'video']
        : path.startsWith('footer.socials') && name === 'icon' ? ['youtube', 'x', 'linkedin', 'tiktok'] : null
    if (options) return { ...common, ...(name === 'mediaMode' ? { admin: { description: 'Image shows the poster. YouTube uses the video URL. Uploaded video uses the video file; the poster is its preview and fallback.' } } : {}), type: 'select', options: options.map((value) => ({ value, label: ({ youtube: 'YouTube', x: 'X', linkedin: 'LinkedIn', tiktok: 'TikTok', video: 'Uploaded video' } as Record<string, string>)[value] ?? label(value) })), validate }
    return { ...common, type: /description|body|text|note|caption|message|intro|alt$/i.test(name) || String(value).length > 150 ? 'textarea' : 'text', maxLength: 20000, validate,
      ...(name === 'videoUrl' ? { admin: { description: 'HTTPS YouTube watch, share, shorts, or embed URL.' } } : {}),
    } as Field
  })
}
