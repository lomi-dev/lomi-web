import { withPayload } from '@payloadcms/next/withPayload'

export default withPayload({
  agentRules: false,
  // Keep this app isolated from the Astro app and its dependency tree.
  turbopack: { root: import.meta.dirname },
})
