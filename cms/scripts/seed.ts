import nextEnv from '@next/env'
import { readFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import { hydrateEditorContent } from '../../content/editor-content'

nextEnv.loadEnvConfig(process.cwd())
const { default: config } = await import('../src/payload.config')
const payload = await getPayload({ config })

try {
  // Checking versions also protects unpublished edits on an existing global.
  const versions = await payload.findGlobalVersions({ slug: 'landing', limit: 1 })
  const existing = await payload.findGlobal({ slug: 'landing', draft: true })
  if (versions.totalDocs > 0 || existing.seo?.title) {
    console.log('Landing content already exists; seed skipped without changes.')
  } else {
    const data = JSON.parse(await readFile(new URL('../../content/landing.json', import.meta.url), 'utf8'))
    await payload.updateGlobal({ slug: 'landing', data: { ...hydrateEditorContent(data), _status: 'published' }, draft: false })
    console.log('Published initial landing content. Create your administrator at /admin.')
  }
} finally {
  await payload.destroy()
}
