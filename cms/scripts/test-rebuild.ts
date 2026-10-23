import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createLocalReq } from 'payload'

const directory = await mkdtemp(path.join(tmpdir(), 'lomi-cms-rebuild-test-'))
const cmsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const rebuildUrl = 'https://coolify.example.test/api/v1/deploy?uuid=static-site-uuid'
const rebuildToken = randomBytes(32).toString('hex')
const rebuildTestMode = process.env.REBUILD_TEST_MODE
const persistedDatabase = ['persisted', 'recovered'].includes(rebuildTestMode || '') ? process.env.DATABASE_URL : undefined

Object.assign(process.env, {
  NODE_ENV: 'development',
  PAYLOAD_SECRET: randomBytes(32).toString('hex'),
  DATABASE_URL: persistedDatabase || `file:${path.join(directory, 'rebuild.db')}`,
  MEDIA_UPLOAD_DIR: path.join(directory, 'media'),
})

if (process.env.REBUILD_TEST_MODE === 'disabled') {
  process.env.SITE_REBUILD_URL = ''
  process.env.SITE_REBUILD_TOKEN = ''
} else {
  process.env.SITE_REBUILD_URL = rebuildUrl
  process.env.SITE_REBUILD_TOKEN = rebuildToken
}

try {
  if (rebuildTestMode !== 'disabled' && rebuildTestMode !== 'recovered') {
    const disabled = spawnSync('bun', ['run', 'scripts/test-rebuild.ts'], {
      cwd: cmsDirectory,
      env: { ...process.env, REBUILD_TEST_MODE: 'disabled' },
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
    })
    assert.equal(disabled.error, undefined, disabled.error?.message)
    assert.equal(disabled.status, 0, disabled.stdout + disabled.stderr)
    assert.match(disabled.stdout, /Passed: site rebuild jobs and autorun stay inactive without webhook credentials/)
  }

  const { default: config } = await import('../src/payload.config')
  const { getPayload } = await import('payload')
  const resolvedConfig = await config
  const autorunConfig = structuredClone(resolvedConfig.jobs?.autoRun)
  if (resolvedConfig.jobs) resolvedConfig.jobs.autoRun = []
  let payload = await getPayload({ config: resolvedConfig })
  let payloadDestroyed = false

  try {
    if (process.env.REBUILD_TEST_MODE === 'disabled') {
      assert.equal(resolvedConfig.jobs?.enabled, true)
      assert.equal(resolvedConfig.jobs?.tasks?.some(({ slug }) => slug === 'rebuildSite'), true)
      assert.deepEqual(autorunConfig, [])
      const tables = await payload.db.drizzle.$client.execute('PRAGMA table_list')
      assert.equal(tables.rows.some((table) => table.name === 'payload_jobs'), true)

      const user = await payload.create({
        collection: 'users',
        data: { email: 'rebuild-disabled@example.com', password: randomBytes(24).toString('hex') },
      })
      const landing = JSON.parse(await readFile(new URL('../../content/landing.json', import.meta.url), 'utf8'))
      await payload.updateGlobal({ slug: 'landing', data: { ...landing, _status: 'published' }, user })
      const queued = await payload.find({
        collection: 'payload-jobs',
        where: { queue: { equals: 'site-rebuild' } },
        limit: 10,
      })
      assert.equal(queued.totalDocs, 0)
      console.log('Passed: site rebuild jobs and autorun stay inactive without webhook credentials.')
    } else if (process.env.REBUILD_TEST_MODE === 'persisted') {
      const queued = await payload.find({
        collection: 'payload-jobs',
        where: { queue: { equals: 'site-rebuild' } },
        limit: 10,
      })
      assert.equal(queued.totalDocs, 1)
      assert.equal(queued.docs[0]?.taskSlug, 'rebuildSite')
      assert.deepEqual(queued.docs[0]?.input, {})
      assert.equal(JSON.stringify(queued.docs[0]).includes(rebuildToken), false)
      assert.equal(JSON.stringify(queued.docs[0]).includes(rebuildUrl), false)
      console.log('Passed: the queued rebuild survives a new CMS process.')
    } else if (rebuildTestMode === 'recovered') {
      let queued = await payload.find({
        collection: 'payload-jobs',
        where: { queue: { equals: 'site-rebuild' } },
        limit: 10,
      })
      assert.equal(queued.totalDocs, 1)
      assert.equal(queued.docs[0]?.processing, false)
      assert.equal(queued.docs[0]?.waitUntil, null)

      const users = await payload.find({ collection: 'users', limit: 1, overrideAccess: true })
      const user = users.docs[0]
      assert.ok(user)
      const previousFetch = globalThis.fetch
      let fetchCalls = 0
      globalThis.fetch = (async () => {
        fetchCalls += 1
        return new Response('deployment queued', { status: 202 })
      }) as unknown as typeof fetch
      try {
        const rebuildReq = await createLocalReq({ user }, payload)
        await payload.jobs.run({ queue: 'site-rebuild', limit: 1, req: rebuildReq, overrideAccess: true, sequential: true })
        assert.equal(fetchCalls, 1, 'A restarted CMS can run the recovered rebuild.')
        queued = await payload.find({ collection: 'payload-jobs', where: { queue: { equals: 'site-rebuild' } }, limit: 10 })
        assert.equal(queued.totalDocs, 0)

        await payload.updateGlobal({
          slug: 'landing',
          data: { _status: 'published', hero: { title: 'Publish after recovery' } },
          user,
        })
        queued = await payload.find({ collection: 'payload-jobs', where: { queue: { equals: 'site-rebuild' } }, limit: 10 })
        assert.equal(queued.totalDocs, 1, 'A later publish can enqueue after recovery.')
        await payload.jobs.run({ queue: 'site-rebuild', limit: 1, req: rebuildReq, overrideAccess: true, sequential: true })
        assert.equal(fetchCalls, 2, 'Future rebuild jobs continue after the recovered job completes.')
        queued = await payload.find({ collection: 'payload-jobs', where: { queue: { equals: 'site-rebuild' } }, limit: 10 })
        assert.equal(queued.totalDocs, 0)
      } finally {
        globalThis.fetch = previousFetch
      }
      console.log('Passed: startup recovery releases an interrupted rebuild and later jobs continue after restart.')
    } else {
      assert.equal(resolvedConfig.jobs?.enabled, true)
      assert.deepEqual(autorunConfig, [{
        cron: '* * * * *',
        queue: 'site-rebuild',
        limit: 1,
        disableScheduling: true,
        silent: { info: true, error: false },
      }])
      assert.equal(resolvedConfig.jobs?.deleteJobOnComplete, true)
      assert.equal(resolvedConfig.jobs?.enableConcurrencyControl, true)
      const task = resolvedConfig.jobs?.tasks?.find(({ slug }) => slug === 'rebuildSite')
      assert.deepEqual(task?.retries, { attempts: 3, backoff: { type: 'exponential', delay: 5_000 } })
      assert.equal(typeof task?.concurrency, 'object')
      if (task?.concurrency && typeof task.concurrency !== 'function') {
        assert.equal(task.concurrency.exclusive, true)
        assert.equal(task.concurrency.supersedes, true)
        assert.equal(task.concurrency.key({ input: {}, queue: 'site-rebuild' }), 'site-rebuild')
      } else {
        assert.fail('Site rebuild concurrency must be exclusive and superseding.')
      }
      assert.equal((task?.inputSchema ?? []).length, 0)

      const anonymousReq = await createLocalReq({}, payload)
      await assert.rejects(payload.jobs.queue({
        task: 'rebuildSite',
        input: {},
        queue: 'site-rebuild',
        req: anonymousReq,
        overrideAccess: false,
      }))
      await assert.rejects(payload.jobs.run({
        queue: 'site-rebuild',
        overrideAccess: false,
      }))

      const user = await payload.create({
        collection: 'users',
        data: { email: 'rebuild-test@example.com', password: randomBytes(24).toString('hex') },
      })
      const landing = JSON.parse(await readFile(new URL('../../content/landing.json', import.meta.url), 'utf8'))
      await payload.updateGlobal({
        slug: 'landing',
        data: { ...landing, _status: 'published' },
        user,
      })

      const jobs = async () => payload.find({
        collection: 'payload-jobs',
        where: { queue: { equals: 'site-rebuild' } },
        limit: 10,
        sort: '-createdAt',
      })
      let queued = await jobs()
      assert.equal(queued.totalDocs, 1)
      assert.equal(queued.docs[0]?.taskSlug, 'rebuildSite')
      assert.deepEqual(queued.docs[0]?.input, {})

      const persisted = spawnSync('bun', ['run', 'scripts/test-rebuild.ts'], {
        cwd: cmsDirectory,
        env: { ...process.env, REBUILD_TEST_MODE: 'persisted' },
        encoding: 'utf8',
        maxBuffer: 2 * 1024 * 1024,
      })
      assert.equal(persisted.error, undefined, persisted.error?.message)
      assert.equal(persisted.status, 0, persisted.stdout + persisted.stderr)
      assert.match(persisted.stdout, /Passed: the queued rebuild survives a new CMS process/)

      const serializedJob = JSON.stringify(queued.docs[0])
      assert.equal(serializedJob.includes(rebuildToken), false)
      assert.equal(serializedJob.includes(rebuildUrl), false)

      const idBeforeRollback = queued.docs[0]?.id
      assert.ok(idBeforeRollback !== null && idBeforeRollback !== undefined)
      const transactionID = await payload.db.beginTransaction()
      assert.ok(transactionID)
      const transactionReq = await createLocalReq({ user, req: { transactionID } }, payload)
      await payload.jobs.queue({
        task: 'rebuildSite',
        input: {},
        queue: 'site-rebuild',
        req: transactionReq,
        overrideAccess: true,
      })
      await payload.db.rollbackTransaction(transactionID)
      queued = await jobs()
      assert.equal(queued.totalDocs, 1, 'Rolling back a publish request must also roll back its queued rebuild.')
      assert.equal(queued.docs[0]?.id, idBeforeRollback)

      const beforeDraftSave = queued.docs[0]?.id
      await payload.updateGlobal({
        slug: 'landing',
        data: { _status: 'draft', hero: { title: 'Draft only' } },
        draft: true,
        user,
      })
      queued = await jobs()
      assert.equal(queued.totalDocs, 1)
      assert.equal(queued.docs[0]?.id, beforeDraftSave, 'Saving a draft must leave the queued published revision alone.')

      const beforeDraftPublish = queued.docs[0]?.createdAt
      await payload.updateGlobal({
        slug: 'landing',
        data: { _status: 'published' },
        draft: true,
        user,
      })
      queued = await jobs()
      assert.equal(queued.totalDocs, 1)
      assert.notEqual(queued.docs[0]?.createdAt, beforeDraftPublish, 'Publishing with draft:true must still enqueue a rebuild.')

      await payload.updateGlobal({
        slug: 'landing',
        data: { _status: 'published', hero: { title: 'Published update' } },
        user,
      })
      queued = await jobs()
      assert.equal(queued.totalDocs, 1, 'A published edit replaces older pending rebuilds.')
      const beforeUnpublish = queued.docs[0]?.createdAt

      await payload.updateGlobal({ slug: 'landing', data: { _status: 'draft' }, user })
      queued = await jobs()
      assert.equal(queued.totalDocs, 1, 'Unpublishing the landing page must queue a rebuild.')
      assert.notEqual(queued.docs[0]?.createdAt, beforeUnpublish)

      const devlog = await payload.create({
        collection: 'devlogs',
        data: {
          title: 'Published episode',
          videoUrl: 'https://youtu.be/abc123def45',
          publishedAt: new Date().toISOString(),
          _status: 'published',
        },
        user,
      })
      queued = await jobs()
      const beforeDevlogDraft = queued.docs[0]?.id
      await payload.update({
        collection: 'devlogs',
        id: devlog.id,
        data: { title: 'Draft edit', _status: 'draft' },
        draft: true,
        user,
      })
      queued = await jobs()
      assert.equal(queued.totalDocs, 1)
      assert.equal(queued.docs[0]?.id, beforeDevlogDraft, 'Saving a Devlog draft must not trigger another rebuild.')

      const beforeDevlogDraftPublish = queued.docs[0]?.createdAt
      await payload.update({
        collection: 'devlogs',
        id: devlog.id,
        data: { _status: 'published' },
        draft: true,
        user,
      })
      queued = await jobs()
      assert.equal(queued.totalDocs, 1)
      assert.notEqual(queued.docs[0]?.createdAt, beforeDevlogDraftPublish, 'Publishing a Devlog with draft:true must enqueue a rebuild.')

      await payload.update({
        collection: 'devlogs',
        id: devlog.id,
        data: { _status: 'draft' },
        user,
      })
      queued = await jobs()
      const beforeUnpublishDevlog = queued.docs[0]?.createdAt
      await payload.update({
        collection: 'devlogs',
        id: devlog.id,
        data: { _status: 'published' },
        user,
      })
      queued = await jobs()
      const beforePublishedDelete = queued.docs[0]?.createdAt
      assert.notEqual(beforeUnpublishDevlog, beforePublishedDelete)
      await payload.delete({ collection: 'devlogs', id: devlog.id, user })
      queued = await jobs()
      assert.equal(queued.totalDocs, 1)
      assert.notEqual(queued.docs[0]?.createdAt, beforePublishedDelete)

      const { readSiteRebuildSettings, requestSiteRebuild } = await import('../src/jobs/rebuildSite')
      assert.equal(readSiteRebuildSettings({}), undefined)
      assert.throws(() => readSiteRebuildSettings({
        SITE_REBUILD_URL: 'http://coolify.example.test/api/v1/deploy?uuid=static-site-uuid',
        SITE_REBUILD_TOKEN: rebuildToken,
      }), /HTTPS/)
      assert.throws(() => readSiteRebuildSettings({
        SITE_REBUILD_URL: `https://coolify.example.test/api/v1/deploy?token=${rebuildToken}`,
        SITE_REBUILD_TOKEN: rebuildToken,
      }), /without embedded credentials/)
      assert.throws(() => readSiteRebuildSettings({
        SITE_REBUILD_URL: rebuildUrl,
      }), /both SITE_REBUILD_URL and SITE_REBUILD_TOKEN/)

      const previousFetch = globalThis.fetch
      const fetchCalls: { input: string; init?: RequestInit }[] = []
      try {
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
          fetchCalls.push({ input: String(input), init })
          return new Response('deployment queued', { status: 202 })
        }) as unknown as typeof fetch
        await requestSiteRebuild()
        assert.equal(fetchCalls.length, 1)
        assert.equal(fetchCalls[0]?.input, rebuildUrl)
        assert.equal(fetchCalls[0]?.init?.method, 'POST')
        assert.equal(fetchCalls[0]?.init?.redirect, 'error')
        assert.equal(new Headers(fetchCalls[0]?.init?.headers).get('authorization'), `Bearer ${rebuildToken}`)

        const interruptedJob = queued.docs[0]
        assert.ok(interruptedJob)
        await payload.db.updateOne({
          collection: 'payload-jobs',
          id: interruptedJob.id,
          data: { processing: true, waitUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
          returning: false,
        })
        await payload.destroy()
        payloadDestroyed = true

        const recovery = spawnSync('bun', ['run', 'scripts/recover-rebuilds.ts'], {
          cwd: cmsDirectory,
          env: process.env,
          encoding: 'utf8',
          maxBuffer: 2 * 1024 * 1024,
        })
        assert.equal(recovery.error, undefined, recovery.error?.message)
        assert.equal(recovery.status, 0, recovery.stdout + recovery.stderr)
        assert.match(recovery.stdout, /Recovered 1 interrupted site rebuild job/)

        const restartedProcess = spawnSync('bun', ['run', 'scripts/test-rebuild.ts'], {
          cwd: cmsDirectory,
          env: { ...process.env, REBUILD_TEST_MODE: 'recovered' },
          encoding: 'utf8',
          maxBuffer: 2 * 1024 * 1024,
        })
        assert.equal(restartedProcess.error, undefined, restartedProcess.error?.message)
        assert.equal(restartedProcess.status, 0, restartedProcess.stdout + restartedProcess.stderr)
        assert.match(restartedProcess.stdout, /startup recovery releases an interrupted rebuild/)

        globalThis.fetch = (async () => new Response(`sensitive response ${rebuildToken}`, { status: 503 })) as unknown as typeof fetch
        await assert.rejects(requestSiteRebuild(), (error: unknown) => {
          assert.ok(error instanceof Error)
          assert.match(error.message, /HTTP 503/)
          assert.equal(error.message.includes(rebuildToken), false)
          assert.doesNotMatch(error.message, /sensitive response/)
          assert.doesNotMatch(error.message, /coolify\.example\.test/)
          return true
        })

        globalThis.fetch = (async () => { throw new Error(`${rebuildUrl} ${rebuildToken}`) }) as unknown as typeof fetch
        await assert.rejects(requestSiteRebuild(), (error: unknown) => {
          assert.ok(error instanceof Error)
          assert.match(error.message, /could not be completed/)
          assert.equal(error.message.includes(rebuildToken), false)
          assert.doesNotMatch(error.message, /coolify\.example\.test/)
          return true
        })
      } finally {
        globalThis.fetch = previousFetch
      }

      console.log('Passed: rebuild jobs require configured credentials, persist atomically, coalesce published changes, ignore drafts, rebuild on unpublish/deletion, execute through Payload, and redact endpoint failures.')
    }
  } finally {
    if (!payloadDestroyed) await payload.destroy()
  }
} finally {
  await rm(directory, { recursive: true, force: true })
}

