import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createLocalReq, getPayload } from 'payload'
import { devlogSchema } from '../../content/devlog-schema'
import { pageDefaults } from '../../content/page-defaults'
import { down, up } from '../src/migrations/20261020_150000_devlogs'

const directory = await mkdtemp(path.join(tmpdir(), 'lomi-cms-devlogs-'))
process.env.PAYLOAD_SECRET = randomBytes(32).toString('hex')
process.env.DATABASE_URL = `file:${path.join(directory, 'test.db')}`
process.env.MEDIA_UPLOAD_DIR = path.join(directory, 'media')
Object.assign(process.env, { NODE_ENV: 'production' })
const command = (args: string[]) => {
  const result = spawnSync('bun', args, { env: process.env, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  return result.stdout
}
let payload: Awaited<ReturnType<typeof getPayload>> | undefined
try {
  command(['x', 'payload', 'migrate'])
  command(['run', 'seed'])
  const { default: config } = await import('../src/payload.config')
  payload = await getPayload({ config })
  const lockForeignKeys = (await payload.db.drizzle.$client.execute('PRAGMA foreign_key_list(payload_locked_documents_rels)')).rows
  assert.equal(lockForeignKeys.find((key) => key.from === 'devlogs_id')?.on_delete, 'CASCADE', 'Devlog locks must match the snapshot and cascade when an episode is deleted')
  assert.equal((await payload.find({ collection: 'devlogs' })).totalDocs, 0, 'Seeding never invents episodes')
  await payload.updateGlobal({ slug: 'landing', data: { hero: { title: 'Preserve this headline' }, pages: { devlog: { title: [{ text: 'Existing devlog heading' }] } } } })
  await payload.updateGlobal({ slug: 'landing', data: { hero: { title: 'Preserve private history' }, _status: 'draft' }, draft: true })

  // Compare every existing table/column, including published rows and version history.
  const snapshot = JSON.parse(await readFile(new URL('../src/migrations/20261020_140000_hero_player_controls.json', import.meta.url), 'utf8')).tables as Record<string, { columns: Record<string, unknown> }>
  const tables = Object.keys(snapshot)
  const columns = tables.map((name) => Object.keys(snapshot[name].columns).map((column) => `"${column}"`).join(', '))
  const existingRows = () => Promise.all(tables.map(async (table, index) => (await payload!.db.drizzle.$client.execute(`SELECT ${columns[index]} FROM "${table}" ORDER BY rowid`)).rows))
  const before = await existingRows()
  const args = { db: payload.db.drizzle, payload, req: await createLocalReq({}, payload) }
  await payload.db.drizzle.transaction(async (transaction) => down({ ...args, db: transaction as unknown as typeof args.db }))
  assert.deepEqual(await existingRows(), before)
  await payload.db.drizzle.transaction(async (transaction) => up({ ...args, db: transaction as unknown as typeof args.db }))
  assert.deepEqual(await existingRows(), before)
  assert.equal((await payload.db.drizzle.$client.execute('PRAGMA foreign_key_list(payload_locked_documents_rels)')).rows.find((key) => key.from === 'devlogs_id')?.on_delete, 'CASCADE', 'Reapplying the migration must restore cascading locks')
  for (const table of ['landing', '_landing_v']) {
    const prefix = table === 'landing' ? '' : 'version_'
    const rows = (await payload.db.drizzle.$client.execute(`SELECT "${prefix}pages_devlog_latest_label", "${prefix}pages_devlog_empty_title" FROM "${table}"`)).rows
    assert.ok(rows.length)
    assert.ok(rows.every((row) => Object.values(row).every((value) => value === null)), 'New page copy remains nullable in saved rows/history')
  }
  assert.equal((await payload.findGlobal({ slug: 'landing', overrideAccess: false })).pages?.devlog?.latestLabel, pageDefaults.devlog.latestLabel)
  assert.equal((await payload.findGlobal({ slug: 'landing', draft: true })).hero.title, 'Preserve private history')

  const user = await payload.create({ collection: 'users', data: { email: 'devlogs@example.com', password: randomBytes(24).toString('hex') } })
  const entry = { title: 'A real development update', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', publishedAt: '2026-10-20T12:00:00.000Z', description: 'A development update.', duration: '8:42', _status: 'published' as const }
  await assert.rejects(payload.create({ collection: 'devlogs', data: entry, overrideAccess: false }))
  const draft = await payload.create({ collection: 'devlogs', data: { title: 'Incomplete private draft' }, draft: true, user, overrideAccess: false })
  assert.equal(draft._status, 'draft')
  assert.equal((await payload.find({ collection: 'devlogs', draft: true, overrideAccess: false })).totalDocs, 0)
  await assert.rejects(payload.findByID({ collection: 'devlogs', id: draft.id, draft: true, overrideAccess: false }))
  assert.equal((await payload.findByID({ collection: 'devlogs', id: draft.id, draft: true, user, overrideAccess: false })).title, 'Incomplete private draft')
  await assert.rejects(payload.update({ collection: 'devlogs', id: draft.id, data: { _status: 'published' }, user, overrideAccess: false }))
  for (const data of [
    { title: '' }, { title: ' '.repeat(3) }, { title: 'x'.repeat(161) },
    { videoUrl: 'https://example.com/watch?v=dQw4w9WgXcQ' }, { videoUrl: 'http://youtube.com/watch?v=dQw4w9WgXcQ' },
    { publishedAt: '' }, { publishedAt: 'not-a-date' }, { description: 'x'.repeat(1001) },
    { duration: '8:99' }, { duration: '1:99:12' }, { thumbnailAlt: 'x'.repeat(501) },
  ]) await assert.rejects(payload.create({ collection: 'devlogs', data: { ...entry, ...data }, user, overrideAccess: false }), JSON.stringify(data))

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=', 'base64')
  const image = await payload.create({ collection: 'media', data: { alt: 'Development preview' }, file: { data: png, mimetype: 'image/png', name: 'preview.png', size: png.length }, user, overrideAccess: false })
  // Media accepts WebM originals; the Devlog thumbnail must still reject them.
  const clip = Buffer.from('GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwH/////////EU2bdKtNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHLTbuMU6uEElTDZ1OsggEY7AEAAAAAAABoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmpSrXsYMPQkBNgIxMYXZmNjIuMy4xMDBXQYxMYXZmNjIuMy4xMDAWVK5ryK4BAAAAAAAAP9eBAXPFiK9p+Hr9w4tnnIEAIrWcg3VuZIiBAIaFVl9WUDmDgQEj44OEAmJaAOCQsIEQuoEQmoECVbCEVbmBARJUw2fbc3OfY8CAZ8iZRaOHRU5DT0RFUkSHjExhdmY2Mi4zLjEwMHNztmPAi2PFiK9p+Hr9w4tnZ8ilRaOHRU5DT0RFUkSHmExhdmM2Mi4xMS4xMDAgbGlidnB4LXZwOR9DtnWl54EAo6CBAACAgkmDQgAA8AD2ADgkHBhKAAAwYAAAEL///UiMAA==', 'base64')
  const video = await payload.create({ collection: 'media', data: { alt: 'Video upload' }, file: { data: clip, mimetype: 'video/webm', name: 'clip.webm', size: clip.length }, user, overrideAccess: false })
  await assert.rejects(payload.create({ collection: 'devlogs', data: { ...entry, thumbnail: video.id }, user, overrideAccess: false }))
  const published = await payload.create({ collection: 'devlogs', data: { ...entry, thumbnail: image.id }, user, overrideAccess: false })
  const publicEntry = await payload.findByID({ collection: 'devlogs', id: published.id, depth: 1, overrideAccess: false })
  assert.equal(devlogSchema.parse(publicEntry).thumbnail?.alt, 'Development preview')
  await payload.update({ collection: 'devlogs', id: published.id, data: { title: 'Private revised title', _status: 'draft' }, draft: true, user, overrideAccess: false })
  assert.equal((await payload.findByID({ collection: 'devlogs', id: published.id, overrideAccess: false })).title, entry.title)
  await assert.rejects(payload.findByID({ collection: 'devlogs', id: published.id, draft: true, overrideAccess: false }), /Not Found/, 'Native draft queries cannot expose a private revision')
  assert.equal((await payload.find({ collection: 'devlogs', draft: true, overrideAccess: false })).totalDocs, 0)
  assert.equal((await payload.findByID({ collection: 'devlogs', id: published.id, draft: true, user, overrideAccess: false })).title, 'Private revised title')
  await assert.rejects(payload.update({ collection: 'devlogs', id: published.id, data: { title: 'Unauthorized' }, overrideAccess: false }))
  await assert.rejects(payload.delete({ collection: 'devlogs', id: published.id, overrideAccess: false }))
  await assert.rejects(payload.findVersions({ collection: 'devlogs', overrideAccess: false }))
  const versions = await payload.findVersions({ collection: 'devlogs', where: { parent: { equals: published.id } }, user, overrideAccess: false })
  assert.ok(versions.totalDocs >= 2)
  assert.equal(payload.collections.devlogs.config.versions && payload.collections.devlogs.config.versions.maxPerDoc, 20)
  const older = await payload.create({ collection: 'devlogs', data: { ...entry, title: 'Older update', publishedAt: '2026-10-19T12:00:00.000Z' }, user, overrideAccess: false })
  assert.deepEqual((await payload.find({ collection: 'devlogs', overrideAccess: false })).docs.map(({ id }) => id), [published.id, older.id])
  await payload.update({ collection: 'devlogs', id: draft.id, data: { ...entry, title: 'Completed draft' }, user, overrideAccess: false })
  assert.equal((await payload.findByID({ collection: 'devlogs', id: draft.id, overrideAccess: false })).title, 'Completed draft')
  for (let index = 0; index < 21; index++) await payload.update({ collection: 'devlogs', id: draft.id, data: { title: `Revision ${index}`, _status: 'draft' }, draft: true, user, overrideAccess: false })
  assert.equal((await payload.findVersions({ collection: 'devlogs', where: { parent: { equals: draft.id } }, user, overrideAccess: false })).totalDocs, 20)
  const countBeforeSeed = (await payload.find({ collection: 'devlogs' })).totalDocs
  assert.match(command(['run', 'seed']), /already exists; seed skipped/)
  assert.equal((await payload.find({ collection: 'devlogs' })).totalDocs, countBeforeSeed)
  await payload.updateGlobal({ slug: 'landing', data: { pages: { devlog: { latestLabel: 'Published latest', empty: { title: 'Published empty title' } } }, _status: 'published' }, user, overrideAccess: false })
  await payload.updateGlobal({ slug: 'landing', data: { pages: { devlog: { latestLabel: 'Private latest' } }, _status: 'draft' }, draft: true, user, overrideAccess: false })
  assert.equal((await payload.findGlobal({ slug: 'landing', draft: true, overrideAccess: false })).pages?.devlog?.latestLabel, 'Published latest')
  assert.equal((await payload.findGlobal({ slug: 'landing', draft: true, user, overrideAccess: false })).pages?.devlog?.latestLabel, 'Private latest')
  await payload.create({ collection: 'payload-locked-documents', data: { document: { relationTo: 'devlogs', value: older.id }, user: { relationTo: 'users', value: user.id } } })
  const lockRows = () => payload!.db.drizzle.$client.execute({ sql: 'SELECT id FROM payload_locked_documents_rels WHERE devlogs_id = ?', args: [older.id] })
  assert.equal((await lockRows()).rows.length, 1, 'Fixture creates a live lock relationship')
  await payload.delete({ collection: 'devlogs', id: older.id, user, overrideAccess: false })
  assert.equal((await lockRows()).rows.length, 0, 'Deleting a locked episode removes its lock relationship')
  assert.deepEqual((await payload.db.drizzle.$client.execute('PRAGMA foreign_key_check')).rows, [])
  console.log('Passed: Devlog migration preserves prior rows/history, empty seed, nullable page defaults, incomplete drafts, publication validation, public draft isolation, write/history restrictions, image-only populated thumbnails, newest-first ordering, page copy drafts, and authenticated deletion with cascading lock cleanup.')
} finally {
  await payload?.destroy()
  await rm(directory, { recursive: true, force: true })
}
