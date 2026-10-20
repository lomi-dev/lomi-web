import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createLocalReq, getPayload } from 'payload'
import type { Landing } from '../src/payload-types'
import { up as addTaskStatuses, down as removeTaskStatuses } from '../src/migrations/20261020_120000'

const directory = await mkdtemp(path.join(tmpdir(), 'lomi-cms-test-'))
process.env.PAYLOAD_SECRET = randomBytes(32).toString('hex')
process.env.DATABASE_URL = `file:${path.join(directory, 'test.db')}`
const seed = () => {
  const result = spawnSync('bun', ['run', 'seed'], { env: process.env, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  return result.stdout
}
let payload: Awaited<ReturnType<typeof getPayload>> | undefined
try {
  assert.match(seed(), /Published initial/)
  const { default: config } = await import('../src/payload.config')
  payload = await getPayload({ config })
  const source = JSON.parse(await readFile(new URL('../../content/landing.json', import.meta.url), 'utf8'))
  const published = await payload.findGlobal({ slug: 'landing', overrideAccess: false })
  // Compare every authored field, allowing Payload's IDs and metadata.
  const compare = (expected: unknown, actual: unknown): void => {
    if (Array.isArray(expected)) {
      assert.ok(Array.isArray(actual))
      assert.equal(actual.length, expected.length)
      expected.forEach((value, index) => compare(value, actual[index]))
    } else if (expected && typeof expected === 'object') {
      assert.ok(actual && typeof actual === 'object')
      for (const [key, value] of Object.entries(expected)) compare(value, (actual as Record<string, unknown>)[key])
    } else assert.equal(actual, expected)
  }
  compare(source, published)
  assert.equal(published._status, 'published')
  // Round-trip the migration against existing published rows and version history.
  const migrationArgs = { db: payload.db.drizzle, payload, req: await createLocalReq({}, payload) }
  const pointTables = ['landing_roadmap_items_points', '_landing_v_version_roadmap_items_points']
  const beforeMigration = await Promise.all(pointTables.map((table) => payload!.db.drizzle.$client.execute(`SELECT * FROM ${table}`)))
  await removeTaskStatuses(migrationArgs)
  for (const [index, table] of pointTables.entries()) {
    const result = await payload.db.drizzle.$client.execute(`SELECT * FROM ${table}`)
    assert.deepEqual(result.rows, beforeMigration[index].rows.map(({ status, ...row }) => row))
  }
  await addTaskStatuses(migrationArgs)
  for (const [index, table] of pointTables.entries()) {
    const columns = await payload.db.drizzle.$client.execute(`PRAGMA table_info(${table})`)
    const status = columns.rows.find((column) => column.name === 'status')
    assert.equal(status?.notnull, 0)
    assert.equal(status?.dflt_value, null)
    const result = await payload.db.drizzle.$client.execute(`SELECT * FROM ${table}`)
    assert.deepEqual(result.rows, beforeMigration[index].rows)
  }
  const legacy = await payload.findGlobal({ slug: 'landing' })
  assert.ok(legacy.roadmap.items.every((stage) => stage.points.every((point) => point.status == null)))
  const stage = published.roadmap.items[0]
  const points: Landing['roadmap']['items'][number]['points'] = [
    { label: 'Finished task', status: 'completed' },
    { label: 'Active task', status: 'in-progress' },
    { label: 'Future task', status: 'not-started' },
    { label: 'Inherited task', status: null },
    { label: 'Legacy task' },
  ]
  await payload.updateGlobal({ slug: 'landing', data: { roadmap: { items: [{ ...stage, points }] } } })
  const savedTasks = (await payload.findGlobal({ slug: 'landing' })).roadmap.items[0].points
  assert.deepEqual(savedTasks.map(({ label, status }) => ({ label, status: status ?? null })), points.map(({ label, status }) => ({ label, status: status ?? null })))
  await assert.rejects(payload.updateGlobal({ slug: 'landing', data: { roadmap: { items: [{
    ...stage, points: [{ label: 'Invalid task', status: 'done' as 'completed' }],
  }] } } }), /status/i)
  const versions = await payload.findGlobalVersions({ slug: 'landing', limit: 1, sort: '-createdAt' })
  assert.deepEqual(versions.docs[0].version.roadmap?.items?.[0].points?.map(({ status }) => status ?? null), points.map(({ status }) => status ?? null))
  await assert.rejects(payload.updateGlobal({ slug: 'landing', data: { hero: { title: 'Unauthorized' } }, overrideAccess: false }))
  await assert.rejects(payload.findGlobalVersions({ slug: 'landing', overrideAccess: false }))
  await assert.rejects(payload.create({ collection: 'users', data: { email: 'public@example.com', password: 'public-registration-disabled' }, overrideAccess: false }))
  for (const href of ['/devlog', '/devlog/', '/download', '/download/', '/remote', '/remote/', 'https://docs.lomi.dev', '#roadmap']) {
    const updated: Landing = await payload.updateGlobal({ slug: 'landing', data: { navigation: { links: [{ label: 'Link', href }] } } })
    assert.equal(updated.navigation.links[0].href, href)
  }
  for (const href of [
    'javascript:alert(1)', 'data:text/html,test', '//example.com',
    'http://example.com', 'https://user:password@example.com',
    'https:example.com', 'https:///example.com', 'https://example.com\\@evil.test',
    'https://exam\nple.com', '/unknown', '/devlog/../admin',
    '/devlog?draft=true', '/devlog//', '/%64evlog',
    '/download/../admin', '/download?draft=true', '/download//', '/%64ownload',
    '/remote/../admin', '/remote?draft=true', '/remote/?draft=true',
    '/remote//', '/%72emote', '/remote/%2e%2e/admin', '/remote#section',
  ]) {
    await assert.rejects(payload.updateGlobal({ slug: 'landing', data: { navigation: { links: [{ label: 'Unsafe', href }] } } }), /href/i, href)
  }
  await assert.rejects(payload.updateGlobal({ slug: 'landing', data: { hero: { title: '   ' } } }))
  await assert.rejects(payload.updateGlobal({ slug: 'landing', data: { hero: { title: 'x'.repeat(2001) } } }))
  await assert.rejects(payload.updateGlobal({ slug: 'landing', data: { navigation: { links: Array.from({ length: 7 }, () => ({ label: 'Link', href: '#features' })) } } }))
  const user = await payload.create({ collection: 'users', data: { email: 'test@example.com', password: randomBytes(24).toString('hex') } })
  await payload.updateGlobal({ slug: 'landing', data: { hero: { title: 'Private draft title' }, _status: 'draft' }, draft: true, user, overrideAccess: false })
  const publicDraft = await payload.findGlobal({ slug: 'landing', draft: true, overrideAccess: false })
  assert.equal(publicDraft.hero.title, source.hero.title)
  const adminDraft = await payload.findGlobal({ slug: 'landing', draft: true, user, overrideAccess: false })
  assert.equal(adminDraft.hero.title, 'Private draft title')
  assert.match(seed(), /already exists; seed skipped/)
  assert.equal((await payload.findGlobal({ slug: 'landing', draft: true })).hero.title, 'Private draft title')
  console.log('Passed: content contract, roadmap task persistence/validation, nullable migration round-trip, public reads, write/user/history restrictions, link validation, draft isolation, and idempotent seed.')
} finally {
  await payload?.destroy()
  await rm(directory, { recursive: true, force: true })
}
