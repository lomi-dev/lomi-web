import { withPayload } from '@payloadcms/next/withPayload'
import path from 'node:path'

export default withPayload({
  agentRules: false,
  // The CMS and Astro share the pure link policy in ../content/.
  turbopack: { root: path.resolve(import.meta.dirname, '..') },
})
