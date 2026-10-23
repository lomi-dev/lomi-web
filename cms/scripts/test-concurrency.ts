import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createLocalReq, getPayload } from 'payload'

const directory = await mkdtemp(path.join(tmpdir(), 'lomi-cms-concurrency-'))
const cmsDirectory = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const secret = randomBytes(32).toString('hex')
const rebuildToken = randomBytes(32).toString('hex')
const rebuildURL = 'https://coolify.example.test/api/v1/deploy?uuid=site-concurrency-test'

Object.assign(process.env, {
  NODE_ENV: 'production',
  PAYLOAD_SECRET: secret,
  DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
  MEDIA_UPLOAD_DIR: path.join(directory, 'media'),
  SITE_REBUILD_URL: rebuildURL,
  SITE_REBUILD_TOKEN: rebuildToken,
})

const migration = spawnSync(process.execPath, ['node_modules/payload/bin.js', 'migrate'], {
  cwd: cmsDirectory,
  env: process.env,
  encoding: 'utf8',
  timeout: 120_000,
  maxBuffer: 2 * 1024 * 1024,
})
assert.equal(migration.error, undefined, 'Payload production migration process starts')
assert.equal(migration.status, 0, 'Production migrations create the isolated concurrency-test schema')

const originalFetch = globalThis.fetch
const watchdog = setTimeout(() => {
  console.error('SQLite concurrency verification timed out; check for a blocked transaction gate.')
  process.exit(1)
}, 60_000).unref()
let fetchCount = 0
let firstFetchStarted = (): void => {}
let releaseFirstFetch = (): void => {}
const fetchStarted = new Promise<void>((resolve) => { firstFetchStarted = resolve })
const firstFetchGate = new Promise<void>((resolve) => { releaseFirstFetch = resolve })
let holdFirstFetch = false
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input) !== rebuildURL) {
    // Payload may make unrelated startup checks. Keep the test offline and
    // exclude them from the rebuild-job call count.
    return new Response(null, { status: 200 })
  }
  fetchCount += 1
  assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${rebuildToken}`)
  if (holdFirstFetch) {
    holdFirstFetch = false
    firstFetchStarted()
    await firstFetchGate
  }
  return new Response('queued', { status: 202 })
}) as typeof fetch

let payload: Awaited<ReturnType<typeof getPayload>> | undefined
try {
  const { default: configPromise } = await import('../src/payload.config')
  const config = await configPromise
  if (config.jobs) config.jobs.autoRun = []
  assert.deepEqual(config.jobs?.autoRun, [], 'Scheduled rebuild execution stays disabled for deterministic runs.')
  payload = await getPayload({ config, cron: false })

  const emails = Array.from({ length: 8 }, (_, index) => `write-${index}@example.test`)
  const createdUsers = await Promise.all(emails.map((email) => payload!.create({
    collection: 'users',
    data: { email, password: randomBytes(32).toString('base64url') },
  })))

  // A resolved Promise.all is not sufficient. Concurrent libSQL inserts can
  // return the same row ID while a failed commit silently discards other rows.
  const createdIDs = createdUsers.map(({ id }) => String(id))
  const persistedUsers = await payload.db.drizzle.$client.execute({
    sql: 'SELECT id, email FROM users WHERE email IN (?, ?, ?, ?, ?, ?, ?, ?)',
    args: emails,
  })
  const persistedIDs = persistedUsers.rows.map(({ id }) => String(id))
  assert.equal(
    new Set(createdIDs).size,
    emails.length,
    `Concurrent user writes must return distinct persistent IDs. Returned: ${JSON.stringify(createdIDs)}; persisted: ${JSON.stringify(persistedIDs)}.`,
  )
  assert.equal(
    persistedUsers.rows.length,
    emails.length,
    `Every concurrently created user must persist. Returned: ${JSON.stringify(createdIDs)}; persisted: ${JSON.stringify(persistedIDs)}.`,
  )
  const persistedByEmail = new Map(persistedUsers.rows.map(({ id, email }) => [String(email), String(id)]))
  for (let index = 0; index < emails.length; index += 1) {
    assert.equal(persistedByEmail.get(emails[index]!), createdIDs[index], 'Returned user IDs must match persisted rows.')
  }

  const users = await payload.find({ collection: 'users', limit: 20, pagination: false, overrideAccess: true })
  assert.equal(users.docs.length, emails.length)
  const admins = users.docs

  const landing = JSON.parse(await readFile(new URL('../../content/landing.json', import.meta.url), 'utf8')) as Record<string, unknown>
  await payload.updateGlobal({
    slug: 'landing',
    data: { ...landing, _status: 'published' } as never,
    user: admins[0],
  })

  const publishedUpdates = await Promise.all(Array.from({ length: 5 }, (_, index) =>
    payload!.updateGlobal({
      slug: 'landing',
      data: { _status: 'published', hero: { title: `Concurrent published hero ${index}` } },
      user: admins[index % admins.length],
    }),
  ))
  assert.equal(publishedUpdates.length, 5, 'Concurrent published updates must all resolve.')

  const createDevlog = (prefix: string, index: number) => payload!.create({
    collection: 'devlogs',
    user: admins[index % admins.length],
    data: {
      title: `${prefix} update ${index}`,
      videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
      publishedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
      _status: 'published',
    },
  })

  const firstBatch = await Promise.all(Array.from({ length: 8 }, (_, index) => createDevlog('First batch', index)))
  assert.equal(firstBatch.length, 8, 'Concurrent published Devlog writes must all resolve.')
  const firstDevlogIDs = new Set(firstBatch.map(({ id }) => String(id)))
  assert.equal(firstDevlogIDs.size, firstBatch.length)
  const persistedDevlogs = await payload.find({ collection: 'devlogs', limit: 20, pagination: false, overrideAccess: true })
  assert.equal(persistedDevlogs.docs.length, firstBatch.length, 'Every concurrent published Devlog must persist.')

  // Exercise Payload's default document-lock checks during ordinary updates.
  // The check queries locks without the mutation req, so these also guard
  // against a same-process SQLite gate waiting on its own transaction.
  const unlockedDevlog = await payload.update({
    collection: 'devlogs',
    id: firstBatch[1]!.id,
    data: { title: 'Unlocked with lock checking enabled' },
    user: admins[0],
    overrideAccess: false,
    overrideLock: false,
  })
  assert.equal(unlockedDevlog.title, 'Unlocked with lock checking enabled')

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=', 'base64')
  const media = await payload.create({
    collection: 'media',
    data: { alt: 'Original concurrency image' },
    file: { data: png, mimetype: 'image/png', name: 'concurrency.png', size: png.length },
    user: admins[0],
    overrideAccess: false,
  })
  const updatedMedia = await payload.update({
    collection: 'media',
    id: media.id,
    data: { alt: 'Updated concurrency image' },
    user: admins[0],
    overrideAccess: false,
    overrideLock: false,
  })
  assert.equal(updatedMedia.alt, 'Updated concurrency image')

  const updatedAdminEmail = 'write-7-updated@example.test'
  const updatedUser = await payload.update({
    collection: 'users',
    id: admins[7]!.id,
    data: { email: updatedAdminEmail },
    user: admins[0],
    overrideAccess: false,
    overrideLock: false,
  })
  assert.equal(updatedUser.email, updatedAdminEmail)

  const lockTarget = firstBatch[2]!
  await payload.create({
    collection: 'payload-locked-documents',
    data: {
      document: { relationTo: 'devlogs', value: lockTarget.id },
      user: { relationTo: 'users', value: admins[0]!.id },
    },
    overrideAccess: true,
  })
  await assert.rejects(payload.update({
    collection: 'devlogs',
    id: lockTarget.id,
    data: { title: 'Blocked by another editor lock' },
    user: admins[1],
    overrideAccess: false,
    overrideLock: false,
  }), /locked by another user/i, 'A different authenticated user must not bypass an active lock.')
  assert.equal((await payload.findByID({ collection: 'devlogs', id: lockTarget.id, overrideAccess: true })).title, lockTarget.title)
  const ownerUpdate = await payload.update({
    collection: 'devlogs',
    id: lockTarget.id,
    data: { title: 'Lock owner can update' },
    user: admins[0],
    overrideAccess: false,
    overrideLock: false,
  })
  assert.equal(ownerUpdate.title, 'Lock owner can update')

  const jobs = async () => payload!.find({
    collection: 'payload-jobs',
    where: { queue: { equals: 'site-rebuild' }, taskSlug: { equals: 'rebuildSite' } },
    limit: 20,
    pagination: false,
    sort: '-createdAt',
  })
  let pending = await jobs()
  assert.equal(pending.totalDocs, 1, 'Concurrent publications coalesce to one pending rebuild.')
  assert.deepEqual(pending.docs[0]?.input, {}, 'The durable queue does not store webhook credentials or URLs.')
  assert.equal(JSON.stringify(pending.docs).includes(rebuildToken), false)
  assert.equal(JSON.stringify(pending.docs).includes(rebuildURL), false)
  const firstJobID = String(pending.docs[0]?.id)

  const beforeRollbackTitle = (await payload.findGlobal({ slug: 'landing' })).hero.title
  const rollbackID = await payload.db.beginTransaction()
  assert.ok(rollbackID, 'Begin a transaction to test the publication outbox.')
  const rollbackReq = await createLocalReq({ user: admins[0], req: { transactionID: rollbackID } }, payload)
  await payload.updateGlobal({
    slug: 'landing',
    data: { _status: 'published', hero: { title: 'Rolled-back publish' } },
    user: admins[0],
    req: rollbackReq,
  })
  await payload.db.rollbackTransaction(rollbackID)
  pending = await jobs()
  assert.equal(pending.totalDocs, 1)
  assert.equal(String(pending.docs[0]?.id), firstJobID, 'Rolling back a publication must also restore the previous queue entry.')
  assert.equal((await payload.findGlobal({ slug: 'landing' })).hero.title, beforeRollbackTitle)

  const invalidJobSnapshot = pending.docs.map(({ id }) => String(id))
  await assert.rejects(payload.create({
    collection: 'devlogs',
    user: admins[0],
    data: {
      title: '',
      videoUrl: 'http://example.test/insecure',
      publishedAt: new Date().toISOString(),
      _status: 'published',
    },
  }))
  pending = await jobs()
  assert.deepEqual(pending.docs.map(({ id }) => String(id)), invalidJobSnapshot, 'Validation errors must stay visible and enqueue no rebuild.')

  // Hold an active transaction after a real user insert, then contend with an
  // outside write on the same Node event loop. The serialized gate must yield
  // so the timer can commit the first writer, after which the second write wins.
  const holdID = await payload.db.beginTransaction()
  assert.ok(holdID, 'Begin a transaction to hold the SQLite writer lock.')
  const holdReq = await createLocalReq({ user: admins[1], req: { transactionID: holdID } }, payload)
  const heldEmail = 'held-transaction@example.test'
  const delayedEmail = 'waiting-outside-transaction@example.test'
  await payload.create({
    collection: 'users',
    data: { email: heldEmail, password: randomBytes(32).toString('base64url') },
    req: holdReq,
  })

  let outsideState = 'waiting'
  const outsideWrite = payload.create({
    collection: 'users',
    data: { email: delayedEmail, password: randomBytes(32).toString('base64url') },
  }).then(
    (doc) => { outsideState = 'succeeded'; return { doc } },
    (error: unknown) => { outsideState = 'failed'; return { error } },
  )
  await new Promise((resolve) => setTimeout(resolve, 75))
  try {
    assert.equal(outsideState, 'waiting', 'A serialized write should wait asynchronously while the transaction is held.')
  } finally {
    await payload.db.commitTransaction(holdID)
  }
  const outsideResult = await outsideWrite
  assert.ok('doc' in outsideResult, 'The retry must finish after the same-event-loop writer commits.')
  const lockedWrites = await payload.db.drizzle.$client.execute({
    sql: 'SELECT id, email FROM users WHERE email IN (?, ?)',
    args: [heldEmail, delayedEmail],
  })
  assert.equal(lockedWrites.rows.length, 2)

  // Payload 3.91's adapter can swallow a rejected native COMMIT. Simulate a
  // non-busy commit error and require the CMS write to reject and roll back.
  const probeTransaction = await payload.db.drizzle.$client.transaction()
  const transactionPrototype = Object.getPrototypeOf(probeTransaction) as {
    commit: (...args: unknown[]) => Promise<unknown>
  }
  const originalCommit = transactionPrototype.commit
  await probeTransaction.rollback()
  const failedCommitEmail = 'failed-commit@example.test'
  const recoveryEmail = 'after-commit-failure@example.test'
  const simulatedCommitError = new Error('simulated native commit failure')
  transactionPrototype.commit = async () => { throw simulatedCommitError }
  try {
    await assert.rejects(payload.create({
      collection: 'users',
      data: { email: failedCommitEmail, password: randomBytes(32).toString('base64url') },
    }), (error: unknown) => error === simulatedCommitError || (error instanceof Error && error.message.includes(simulatedCommitError.message)))
  } finally {
    transactionPrototype.commit = originalCommit
  }
  const failedCommitRows = await payload.db.drizzle.$client.execute({
    sql: 'SELECT id FROM users WHERE email = ?',
    args: [failedCommitEmail],
  })
  assert.equal(failedCommitRows.rows.length, 0, 'A failed native COMMIT must not leave a user row behind.')
  await payload.create({
    collection: 'users',
    data: { email: recoveryEmail, password: randomBytes(32).toString('base64url') },
  })
  const recoveredRows = await payload.db.drizzle.$client.execute({
    sql: 'SELECT id FROM users WHERE email = ?',
    args: [recoveryEmail],
  })
  assert.equal(recoveredRows.rows.length, 1, 'A rolled-back commit must release the SQLite gate for later writes.')

  // While a rebuild webhook is in flight, run another burst of published CMS
  // writes. At most the processing job plus its newest coalesced successor may
  // remain. Finish both and verify no job stays wedged at processing=true.
  assert.equal(fetchCount, 0, 'Manual task execution should be deterministic before the first queued run.')
  holdFirstFetch = true
  const firstRunReq = await createLocalReq({ user: admins[0] }, payload)
  const firstRun = payload.jobs.run({
    queue: 'site-rebuild',
    limit: 1,
    sequential: true,
    req: firstRunReq,
    overrideAccess: true,
  })
  await Promise.race([
    fetchStarted,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('The rebuild job did not start its fake webhook request.')), 15_000)),
  ])
  assert.equal(fetchCount, 1, 'The first explicit run should issue one webhook call.')

  const secondBatch = await Promise.all(Array.from({ length: 8 }, (_, index) => createDevlog('In-flight batch', index)))
  assert.equal(secondBatch.length, 8, 'Concurrent publishes must succeed while job status is updated outside their transactions.')
  const inFlightJobs = await jobs()
  assert.equal(inFlightJobs.docs.filter(({ processing }) => processing === true).length, 1)
  assert.ok(inFlightJobs.totalDocs <= 2, 'Only the active rebuild and one coalesced successor may remain.')
  assert.equal(fetchCount, 1, 'A successor remains queued while the first webhook is held.')

  releaseFirstFetch()
  await firstRun
  assert.equal(fetchCount, 1, 'Completing the active rebuild should not execute its successor implicitly.')
  pending = await jobs()
  assert.equal(pending.totalDocs, 1, 'A publication during the active build remains queued as its successor.')
  assert.equal(pending.docs[0]?.processing, false, 'The successor must be runnable after the active build succeeds.')
  await payload.jobs.run({
    queue: 'site-rebuild',
    limit: 5,
    sequential: true,
    req: await createLocalReq({ user: admins[0] }, payload),
    overrideAccess: true,
  })
  assert.equal(fetchCount, 2, 'The current and coalesced successor each call the fake webhook exactly once.')
  pending = await jobs()
  assert.equal(pending.totalDocs, 0, 'All successful rebuild jobs should be deleted from the queue.')

  const finalUsers = await payload.find({ collection: 'users', limit: 20, pagination: false, overrideAccess: true })
  const finalEmails = new Set(finalUsers.docs.map(({ email }) => email))
  assert.equal(finalUsers.docs.length, emails.length + 3)
  assert.ok(finalEmails.has(heldEmail) && finalEmails.has(delayedEmail))
  assert.ok(finalEmails.has(updatedAdminEmail))
  console.log('Passed: concurrent SQLite inserts persist unique rows, serialized writes yield, document locks are enforced, failed commits roll back, publications coalesce atomically, invalid data fails normally, and job processing leaves no stuck queue entries.')
} finally {
  clearTimeout(watchdog)
  releaseFirstFetch()
  globalThis.fetch = originalFetch
  await payload?.destroy()
  await rm(directory, { recursive: true, force: true })
}
