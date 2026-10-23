import { withPayload } from '@payloadcms/next/withPayload'
import path from 'node:path'

export default withPayload({
  agentRules: false,
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }]
  },
  // The CMS and Astro share the pure link policy in ../content/.
  turbopack: { root: path.resolve(import.meta.dirname, '..') },
})
