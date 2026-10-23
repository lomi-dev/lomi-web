import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const directory = await mkdtemp(path.join(tmpdir(), 'lomi-cms-bootstrap-test-'))
const cmsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const email = 'bootstrap-test@example.com'
const firstPassword = randomBytes(24).toString('hex')
const replacementPassword = randomBytes(24).toString('hex')
const baseEnv: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: 'development',
  PAYLOAD_SECRET: randomBytes(32).toString('hex'),
  DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
  MEDIA_UPLOAD_DIR: path.join(directory, 'media'),
}

const runBootstrap = (credentials: { email?: string; password?: string } = {}) => {
  const env: NodeJS.ProcessEnv = { ...baseEnv }
  delete env.CMS_ADMIN_EMAIL
  delete env.CMS_ADMIN_PASSWORD
  if (credentials.email !== undefined) env.CMS_ADMIN_EMAIL = credentials.email
  if (credentials.password !== undefined) env.CMS_ADMIN_PASSWORD = credentials.password

  const result = spawnSync('bun', ['run', 'bootstrap:admin'], {
    cwd: cmsDirectory,
    env,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  })
  assert.equal(result.error, undefined, result.error?.message)
  return { status: result.status, output: result.stdout + result.stderr }
}

try {
  const missingCredentials = runBootstrap()
  assert.notEqual(missingCredentials.status, 0)
  assert.match(missingCredentials.output, /CMS_ADMIN_EMAIL and CMS_ADMIN_PASSWORD/)

  const missingPassword = runBootstrap({ email })
  assert.notEqual(missingPassword.status, 0)
  assert.match(missingPassword.output, /CMS_ADMIN_EMAIL and CMS_ADMIN_PASSWORD/)

  const missingEmail = runBootstrap({ password: firstPassword })
  assert.notEqual(missingEmail.status, 0)
  assert.match(missingEmail.output, /CMS_ADMIN_EMAIL and CMS_ADMIN_PASSWORD/)
  assert.doesNotMatch(missingEmail.output, new RegExp(firstPassword))

  const shortPassword = runBootstrap({ email, password: 'short-password' })
  assert.notEqual(shortPassword.status, 0)
  assert.match(shortPassword.output, /at least 16 characters/)
  assert.doesNotMatch(shortPassword.output, /short-password/)

  const initialized = runBootstrap({ email, password: firstPassword })
  assert.equal(initialized.status, 0, initialized.output)
  assert.match(initialized.output, /CMS administrator initialized/)

  const repeat = runBootstrap({ email: 'ignored@example.com', password: replacementPassword })
  assert.equal(repeat.status, 0, repeat.output)
  assert.match(repeat.output, /already exists; bootstrap skipped/)
  assert.doesNotMatch(repeat.output, new RegExp(replacementPassword))

  Object.assign(process.env, baseEnv)
  const { default: config } = await import('../src/payload.config')
  const { getPayload } = await import('payload')
  const payload = await getPayload({ config })
  try {
    const users = await payload.find({ collection: 'users', limit: 10 })
    assert.equal(users.totalDocs, 1)
    assert.equal(users.docs[0]?.email, email)
    await payload.login({ collection: 'users', data: { email, password: firstPassword } })
    await assert.rejects(payload.login({
      collection: 'users',
      data: { email, password: replacementPassword },
    }))
  } finally {
    await payload.destroy()
  }

  console.log('Passed: CMS administrator bootstrap fails closed without valid first-user credentials, creates one account, and preserves its password on later starts.')
} finally {
  await rm(directory, { recursive: true, force: true })
}
