import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { buildConfig } from 'payload'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Users } from './collections/Users'
import { Landing } from './globals/Landing'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const secret = process.env.PAYLOAD_SECRET
if (!secret) throw new Error('Set PAYLOAD_SECRET before running the CMS. See .env.example.')

export default buildConfig({
  secret,
  serverURL: process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001',
  admin: { user: Users.slug, importMap: { baseDir: dirname } },
  collections: [Users],
  globals: [Landing],
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL || 'file:./data/payload.db' } }),
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
