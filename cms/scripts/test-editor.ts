import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createLocalReq, getPayload } from 'payload'
import { landingSchema } from '../../content/landing-schema'
import { editorDefaults } from '../../content/editor-defaults'
import { mergeEditorPatch } from '../src/hooks/editorContent'

const directory = await mkdtemp(path.join(tmpdir(), 'lomi-cms-editor-'))
process.env.PAYLOAD_SECRET = randomBytes(32).toString('hex')
process.env.DATABASE_URL = `file:${path.join(directory, 'test.db')}`
process.env.MEDIA_UPLOAD_DIR = path.join(directory, 'media')
const command = (args: string[], production = false) => {
  const result = spawnSync('bun', args, { env: { ...process.env, ...(production ? { NODE_ENV: 'production' } : {}) }, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  return result.stdout
}
let payload: Awaited<ReturnType<typeof getPayload>> | undefined
try {
  assert.deepEqual(mergeEditorPatch({ hero: { title: 'Edited', video: null }, layout: ['old'] }, { hero: { video: 2 }, layout: [] }), { hero: { title: 'Edited', video: 2 }, layout: [] })
  command(['x', 'payload', 'migrate'], true)
  assert.match(command(['run', 'seed'], true), /Published initial/)
  Object.assign(process.env, { NODE_ENV: 'production' })
  const { default: config } = await import('../src/payload.config')
  payload = await getPayload({ config })
  let website = await payload.findGlobal({ slug: 'landing', depth: 1 })
  assert.equal(website.editorVersion, 1)
  assert.deepEqual(website.layout?.map(({ section, enabled }) => ({ section, enabled })), editorDefaults.layout)
  assert.equal(website.pages?.download?.title, 'Download lomi.')

  // Round-trip the additive website migration on published rows and history.
  const migrations = (await readdir(new URL('../src/migrations/', import.meta.url))).filter((name) => name.endsWith('_website_editor.ts'))
  assert.equal(migrations.length, 1)
  const migration = await import(`../src/migrations/${migrations[0]}`)
  await payload.updateGlobal({ slug: 'landing', data: { hero: { title: 'Previously edited headline' } } })
  const args = { db: payload.db.drizzle, payload, req: await createLocalReq({}, payload) }
  const legacySchema = JSON.parse(await readFile(new URL('../src/migrations/20261020_120000.json', import.meta.url), 'utf8')).tables as Record<string, { columns: Record<string, unknown> }>
  const oldTables = Object.keys(legacySchema).filter((name) => name.startsWith('landing') || name.startsWith('_landing_v'))
  const oldColumns = oldTables.map((name) => Object.keys(legacySchema[name].columns).map((column) => '"' + column + '"').join(', '))
  const before = await Promise.all(oldTables.map((table, index) => payload!.db.drizzle.$client.execute(`SELECT ${oldColumns[index]} FROM ${table} ORDER BY id`)))
  await payload.db.drizzle.transaction(async (transaction) => migration.down({ ...args, db: transaction }))
  for (const [index, table] of oldTables.entries()) assert.deepEqual((await payload.db.drizzle.$client.execute(`SELECT ${oldColumns[index]} FROM ${table} ORDER BY id`)).rows, before[index].rows)
  await payload.db.drizzle.transaction(async (transaction) => migration.up({ ...args, db: transaction }))
  for (const [index, table] of oldTables.entries()) assert.deepEqual((await payload.db.drizzle.$client.execute(`SELECT ${oldColumns[index]} FROM ${table} ORDER BY id`)).rows, before[index].rows)
  website = await payload.findGlobal({ slug: 'landing', depth: 1 })
  assert.equal(website.hero.title, 'Previously edited headline')
  assert.equal(website.navigation.productLabel, editorDefaults.navigation.productLabel)
  // A legacy row with no new arrays must present their defaults to the editor.
  assert.equal(website.layout?.length, editorDefaults.layout.length)

  await payload.updateGlobal({ slug: 'landing', data: { hero: { title: 'Legacy partial update' } } })
  website = await payload.findGlobal({ slug: 'landing', depth: 1 })
  assert.equal(website.layout?.length, editorDefaults.layout.length, 'A legacy partial write must persist hydrated lists')

  const user = await payload.create({ collection: 'users', data: { email: 'editor@example.com', password: randomBytes(24).toString('hex') } })
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=', 'base64')
  const file = { data: png, mimetype: 'image/png', name: 'preview.png', size: png.length }
  await assert.rejects(payload.create({ collection: 'media', data: { alt: 'Public attempt' }, file, overrideAccess: false }))
  const media = await payload.create({ collection: 'media', data: { alt: 'An uploaded preview' }, file, user, overrideAccess: false })
  assert.equal((await payload.findByID({ collection: 'media', id: media.id, overrideAccess: false })).alt, 'An uploaded preview')
  assert.deepEqual(await readFile(path.join(process.env.MEDIA_UPLOAD_DIR, media.filename!)), png)
  await assert.rejects(payload.update({ collection: 'media', id: media.id, data: { alt: 'Unauthorized' }, overrideAccess: false }))
  await assert.rejects(payload.delete({ collection: 'media', id: media.id, overrideAccess: false }))
  await assert.rejects(payload.create({ collection: 'media', data: { alt: 'Unsafe SVG' }, file: { data: Buffer.from('<svg/>'), mimetype: 'image/svg+xml', name: 'unsafe.svg', size: 6 }, user, overrideAccess: false }))

  // A tiny valid one-frame WebM fixture requires no external encoder at test time.
  const clip = Buffer.from('GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwH/////////EU2bdKtNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHLTbuMU6uEElTDZ1OsggEY7AEAAAAAAABoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmpSrXsYMPQkBNgIxMYXZmNjIuMy4xMDBXQYxMYXZmNjIuMy4xMDAWVK5ryK4BAAAAAAAAP9eBAXPFiK9p+Hr9w4tnnIEAIrWcg3VuZIiBAIaFVl9WUDmDgQEj44OEAmJaAOCQsIEQuoEQmoECVbCEVbmBARJUw2fbc3OfY8CAZ8iZRaOHRU5DT0RFUkSHjExhdmY2Mi4zLjEwMHNztmPAi2PFiK9p+Hr9w4tnZ8ilRaOHRU5DT0RFUkSHmExhdmM2Mi4xMS4xMDAgbGlidnB4LXZwOR9DtnWl54EAo6CBAACAgkmDQgAA8AD2ADgkHBhKAAAwYAAAEL///UiMAA==', 'base64')
  const video = await payload.create({ collection: 'media', data: { alt: 'Uploaded product clip' }, file: { data: clip, mimetype: 'video/webm', name: 'clip.webm', size: clip.length }, user, overrideAccess: false })
  assert.equal(video.mimeType, 'video/webm')
  await payload.updateGlobal({ slug: 'landing', data: { hero: { mediaMode: 'video', poster: media.id, video: video.id }, features: { items: website.features.items.map((item, index) => index ? item : { ...item, image: media.id, alt: 'Feature preview' }) }, site: { theme: { accent: '#aabbcc' } }, pages: { remote: { title: 'Edited remote page' } }, layout: [{ section: 'roadmap', enabled: true }, { section: 'hero', enabled: false }] }, user, overrideAccess: false })
  website = await payload.findGlobal({ slug: 'landing', depth: 1, overrideAccess: false })
  assert.equal(typeof website.hero.poster === 'object' && website.hero.poster?.alt, 'An uploaded preview')
  assert.equal(typeof website.features.items[0].image === 'object' && website.features.items[0].image?.alt, 'An uploaded preview')
  assert.equal(typeof website.hero.video === 'object' && website.hero.video?.mimeType, 'video/webm')
  assert.equal(website.pages?.remote?.title, 'Edited remote page')
  assert.equal(website.site?.theme?.accent, '#aabbcc')
  assert.deepEqual(website.layout?.map(({ section }) => section), ['roadmap', 'hero'])
  await payload.updateGlobal({ slug: 'landing', data: { features: { items: [{ title: 'A newly authored feature', description: 'Published without the hidden legacy icon.', detail: 'Available now', image: media.id }] } }, user, overrideAccess: false })
  const newFeature = await payload.findGlobal({ slug: 'landing', depth: 1, overrideAccess: false })
  assert.equal(landingSchema.parse(newFeature).features.items[0].title, 'A newly authored feature')
  for (const data of [
    { site: { theme: { accent: 'red' } } },
    { navigation: { actionHref: 'javascript:alert(1)' } },
    { hero: { videoUrl: 'https://evil.example/watch?v=dQw4w9WgXcQ' } },
    { hero: { mediaMode: 'iframe' } },
    { hero: { video: media.id } },
    { footer: { socials: [{ label: 'Bad', href: 'https://example.com', icon: 'unsafe' }] } },
    { layout: [{ section: 'hero' }, { section: 'hero' }] },
  ]) await assert.rejects(payload.updateGlobal({ slug: 'landing', data: data as never }))
  await assert.rejects(payload.updateGlobal({
    slug: 'landing', draft: false, user, overrideAccess: false,
    data: { _status: 'published', layout: [{ section: 'hero', enabled: true }, { section: null, enabled: true }] },
  }), /layout|section/i, 'A nullable section must be defaulted before layout uniqueness validation')
  assert.deepEqual((await payload.findGlobal({ slug: 'landing', overrideAccess: false })).layout?.map(({ section }) => section), ['roadmap', 'hero'])
  await payload.updateGlobal({ slug: 'landing', data: { layout: [], footer: { socials: [] } } })
  assert.deepEqual((await payload.findGlobal({ slug: 'landing' })).layout, [])
  assert.deepEqual((await payload.findGlobal({ slug: 'landing' })).footer.socials, [])
  await payload.updateGlobal({ slug: 'landing', data: { pages: { remote: { title: 'Private remote draft' } }, _status: 'draft' }, draft: true, user, overrideAccess: false })
  assert.equal((await payload.findGlobal({ slug: 'landing', draft: true, overrideAccess: false })).pages?.remote?.title, 'Edited remote page')
  assert.equal((await payload.findGlobal({ slug: 'landing', draft: true, user, overrideAccess: false })).pages?.remote?.title, 'Private remote draft')
  assert.match(command(['run', 'seed'], true), /already exists; seed skipped/)
  assert.equal((await payload.findGlobal({ slug: 'landing', draft: true })).pages?.remote?.title, 'Private remote draft')
  // A separate process opens the same SQLite file and resolves the saved upload.
  command(['x', 'tsx', 'scripts/verify-editor-persistence.ts'], true)
  console.log('Passed: website migration rollback/up preserves legacy edits/history, defaults, media upload/access/filtering/population/files, editor validation, order/empty lists, page draft isolation, idempotent seed, and persisted SQLite restart.')
} finally {
  await payload?.destroy()
  await rm(directory, { recursive: true, force: true })
}
