import nextEnv from '@next/env'
import { getPayload } from 'payload'

nextEnv.loadEnvConfig(process.cwd())

const { default: config } = await import('../src/payload.config')
const payload = await getPayload({ config })

try {
  const existingUsers = await payload.find({ collection: 'users', limit: 1 })
  if (existingUsers.docs.length > 0) {
    console.log('CMS administrator already exists; bootstrap skipped.')
  } else {
    const email = process.env.CMS_ADMIN_EMAIL?.trim()
    const password = process.env.CMS_ADMIN_PASSWORD

    if (!email || !password) {
      throw new Error('Set CMS_ADMIN_EMAIL and CMS_ADMIN_PASSWORD to initialize the CMS administrator.')
    }
    if (email.length > 254 || /\s/.test(email) || !/^\S+@\S+\.\S+$/.test(email)) {
      throw new Error('CMS_ADMIN_EMAIL must be a valid email address.')
    }
    if (password.length < 16) {
      throw new Error('CMS_ADMIN_PASSWORD must contain at least 16 characters.')
    }

    await payload.create({
      collection: 'users',
      data: { email, password },
    })
    console.log('CMS administrator initialized.')
  }
} finally {
  await payload.destroy()
}
