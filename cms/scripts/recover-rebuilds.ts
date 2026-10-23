import nextEnv from '@next/env'
import { getPayload } from 'payload'

nextEnv.loadEnvConfig(process.cwd())

const [{ default: config }, { recoverInterruptedSiteRebuildJobs }] = await Promise.all([
  import('../src/payload.config'),
  import('../src/jobs/rebuildSite'),
])
const payload = await getPayload({ config })

try {
  const recovered = await recoverInterruptedSiteRebuildJobs(payload)
  console.log(`Recovered ${recovered} interrupted site rebuild job(s).`)
} finally {
  await payload.destroy()
}
