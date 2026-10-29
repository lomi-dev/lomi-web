import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeOperationHook,
  GlobalAfterChangeHook,
  GlobalBeforeOperationHook,
  Payload,
  PayloadRequest,
  TaskConfig,
} from 'payload'

type RebuildSiteTaskIO = {
  input: Record<string, never>
  output: { triggered: true }
}

type SiteRebuildSettings = {
  url: string
  token: string
}

type SiteRebuildJobRow = {
  id: number | string
  createdAt: string
  processing?: boolean
  hasError?: boolean
}

const draftSaveContextKey = 'siteRebuildDraftSave'
const requestTimeoutMs = 10_000

export function readSiteRebuildSettings(environment: Partial<NodeJS.ProcessEnv> = process.env): SiteRebuildSettings | undefined {
  const urlValue = environment.SITE_REBUILD_URL?.trim()
  const tokenValue = environment.SITE_REBUILD_TOKEN

  if (!urlValue && !tokenValue) return undefined
  if (!urlValue || !tokenValue) {
    throw new Error('Configure both SITE_REBUILD_URL and SITE_REBUILD_TOKEN to enable site rebuilds.')
  }
  if (tokenValue.length < 16 || tokenValue.length > 8192 || tokenValue.trim() !== tokenValue || /[\r\n]/.test(tokenValue)) {
    throw new Error('SITE_REBUILD_TOKEN must be a non-empty, single-line token.')
  }

  let url: URL
  try {
    url = new URL(urlValue)
  } catch {
    throw new Error('SITE_REBUILD_URL must be a valid HTTPS URL.')
  }

  if (
    url.protocol !== 'https:' ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.hash ||
    url.href.length > 2048 ||
    [...url.searchParams.keys()].some((key) =>
      /(?:token|secret|password|credential|authorization|api[-_]?key|access[-_]?key)/i.test(key),
    )
  ) {
    throw new Error('SITE_REBUILD_URL must be an HTTPS endpoint without embedded credentials.')
  }

  return { url: url.href, token: tokenValue }
}

const siteRebuildSettings = readSiteRebuildSettings()
export const siteRebuildEnabled = Boolean(siteRebuildSettings)

/**
 * Recover the coalesced rebuild queue before the CMS HTTP server starts.
 * A process may die after Payload persists processing=true but before its
 * task handler completes. This must only run before any job workers start.
 */
export async function recoverInterruptedSiteRebuildJobs(payload: Payload): Promise<number> {
  const stuck = await payload.db.find<SiteRebuildJobRow>({
    collection: 'payload-jobs',
    limit: 0,
    pagination: false,
    select: { id: true, createdAt: true, processing: true, hasError: true },
    sort: '-createdAt',
    where: {
      and: [
        { queue: { equals: 'site-rebuild' } },
        { taskSlug: { equals: 'rebuildSite' } },
        { processing: { equals: true } },
        { completedAt: { exists: false } },
      ],
    },
  })

  if (!stuck.docs.length) return 0

  // Keep only the newest unfinished rebuild. Its GET rebuilds the current
  // website, so older requests are redundant when a process was interrupted.
  const unfinished = await payload.db.find<SiteRebuildJobRow>({
    collection: 'payload-jobs',
    limit: 0,
    pagination: false,
    select: { id: true, createdAt: true, processing: true, hasError: true },
    sort: '-createdAt',
    where: {
      and: [
        { queue: { equals: 'site-rebuild' } },
        { taskSlug: { equals: 'rebuildSite' } },
        { completedAt: { exists: false } },
        { hasError: { not_equals: true } },
      ],
    },
  })

  const newest = unfinished.docs[0]
  if (!newest) {
    // A stuck job can be terminal after a partially persisted state. Make it
    // runnable again; the normal Payload retry policy still controls retries.
    const newestStuck = stuck.docs[0]
    if (newestStuck) {
      await payload.db.updateOne({
        collection: 'payload-jobs',
        id: newestStuck.id,
        data: { error: null, hasError: false, processing: false, waitUntil: null },
        returning: false,
      })
      const duplicateIDs = stuck.docs.slice(1).map(({ id }) => id)
      if (duplicateIDs.length) {
        await payload.db.deleteMany({ collection: 'payload-jobs', where: { id: { in: duplicateIDs } } })
      }
    }
    return stuck.docs.length
  }

  const obsoleteIDs = new Set([
    ...unfinished.docs.slice(1).map(({ id }) => id),
    ...stuck.docs.filter(({ id }) => id !== newest.id).map(({ id }) => id),
  ])
  if (obsoleteIDs.size) {
    await payload.db.deleteMany({ collection: 'payload-jobs', where: { id: { in: [...obsoleteIDs] } } })
  }

  if (newest.processing) {
    await payload.db.updateOne({
      collection: 'payload-jobs',
      id: newest.id,
      data: { error: null, hasError: false, processing: false, waitUntil: null },
      returning: false,
    })
  }

  return stuck.docs.length
}

export async function queueSiteRebuild(req: PayloadRequest): Promise<void> {
  if (!siteRebuildEnabled) return

  await req.payload.jobs.queue({
    task: 'rebuildSite',
    input: {},
    queue: 'site-rebuild',
    req,
    overrideAccess: true,
  })
}

export const rebuildSiteTask: TaskConfig<RebuildSiteTaskIO> = {
  slug: 'rebuildSite',
  label: 'Rebuild the published website',
  inputSchema: [],
  outputSchema: [{ name: 'triggered', type: 'checkbox', required: true }],
  retries: { attempts: 3, backoff: { type: 'exponential', delay: 5_000 } },
  concurrency: { key: () => 'site-rebuild', exclusive: true, supersedes: true },
  handler: async () => {
    await requestSiteRebuild()
    return { output: { triggered: true } }
  },
}

export async function requestSiteRebuild(): Promise<void> {
  if (!siteRebuildSettings) {
    throw new Error('The static site rebuild is not configured.')
  }

  let response: Response
  try {
    response = await fetch(siteRebuildSettings.url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${siteRebuildSettings.token}`,
      },
      redirect: 'error',
      signal: AbortSignal.timeout(requestTimeoutMs),
    })
  } catch {
    throw new Error('The static site rebuild request could not be completed.')
  }

  const accepted = response.ok
  const status = response.status
  try {
    await response.body?.cancel()
  } catch {
    // Do not let an unread response body affect the queued task result.
  }

  if (!accepted) throw new Error(`The static site rebuild endpoint returned HTTP ${status}.`)
}

export const captureGlobalDraftWrite: GlobalBeforeOperationHook = ({ args, context, operation }) => {
  if (operation === 'update') {
    context[draftSaveContextKey] = args?.draft === true && !publishesDuringDraftSave(args?.data)
  }
  return args
}

export const captureCollectionDraftWrite: CollectionBeforeOperationHook = ({ args, context, operation }) => {
  if (operation === 'create' || operation === 'update') {
    context[draftSaveContextKey] = args?.draft === true && !publishesDuringDraftSave(args?.data)
  }
  return args
}

function publishesDuringDraftSave(data: unknown): boolean {
  return data !== null && typeof data === 'object' && '_status' in data && data._status === 'published'
}

export const queuePublishedLandingRebuild: GlobalAfterChangeHook = async ({ context, doc, previousDoc, req }) => {
  if (context[draftSaveContextKey] === true) return doc

  const published = doc?._status === 'published'
  const unpublished = previousDoc?._status === 'published' && doc?._status === 'draft'
  if (published || unpublished) await queueSiteRebuild(req)
  return doc
}

export const queuePublishedDevlogRebuild: CollectionAfterChangeHook = async ({ context, doc, previousDoc, req }) => {
  if (context[draftSaveContextKey] === true) return doc

  const published = doc?._status === 'published'
  const unpublished = previousDoc?._status === 'published' && doc?._status === 'draft'
  if (published || unpublished) await queueSiteRebuild(req)
  return doc
}

export const queueDeletedDevlogRebuild: CollectionAfterDeleteHook = async ({ doc, req }) => {
  if (doc?._status === 'published') await queueSiteRebuild(req)
  return doc
}

export const queueMediaRebuild: CollectionAfterChangeHook = async ({ doc, req }) => {
  await queueSiteRebuild(req)
  return doc
}

export const queueDeletedMediaRebuild: CollectionAfterDeleteHook = async ({ doc, req }) => {
  await queueSiteRebuild(req)
  return doc
}

export const rebuildSiteAutorun = siteRebuildEnabled
  ? [{ cron: '* * * * *', queue: 'site-rebuild', limit: 1, disableScheduling: true, silent: { info: true, error: false } }]
  : undefined
