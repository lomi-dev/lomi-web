import assert from 'node:assert/strict'
import { getPayload } from 'payload'
import config from '../src/payload.config'

// Called by test-editor in a separate process, against its disposable database.
const payload = await getPayload({ config })
try {
  const website = await payload.findGlobal({ slug: 'landing', depth: 1 })
  assert.equal(typeof website.hero.poster === 'object' && website.hero.poster?.alt, 'An uploaded preview')
  assert.equal(typeof website.hero.video === 'object' && website.hero.video?.mimeType, 'video/webm')
  assert.equal(website.pages?.remote?.title, 'Edited remote page')
  assert.deepEqual(website.layout, [])
} finally {
  await payload.destroy()
}
