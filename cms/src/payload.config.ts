import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { buildConfig } from 'payload'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Devlogs } from './collections/Devlogs'
import { Media } from './collections/Media'
import { Users } from './collections/Users'
import { Landing } from './globals/Landing'
import { serializeSQLiteAccess } from './database/sqliteConcurrency'
import {
  rebuildSiteAutorun,
  rebuildSiteTask,
  siteRebuildEnabled,
} from './jobs/rebuildSite'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const secret = process.env.PAYLOAD_SECRET
if (!secret) throw new Error('Set PAYLOAD_SECRET before running the CMS. See .env.example.')

export default buildConfig({
  secret,
  serverURL: process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001',
  admin: { user: Users.slug, importMap: { baseDir: dirname } },
  collections: [Users, Media, Devlogs],
  globals: [Landing],
  upload: { limits: { fileSize: 50 * 1024 * 1024 } },
  onInit: serializeSQLiteAccess,
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URL || 'file:./data/payload.db' },
    transactionOptions: {},
    wal: true,
  }),
  jobs: {
    access: {
      queue: ({ req }: { req: { user?: unknown } }) => Boolean(req.user),
      run: ({ req }: { req: { user?: unknown } }) => Boolean(req.user),
      cancel: ({ req }: { req: { user?: unknown } }) => Boolean(req.user),
    },
    autoRun: siteRebuildEnabled ? rebuildSiteAutorun : [],
    deleteJobOnComplete: true,
    enableConcurrencyControl: true,
    tasks: [rebuildSiteTask],
  },
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
