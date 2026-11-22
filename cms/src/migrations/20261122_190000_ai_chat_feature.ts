import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-sqlite'

// The sixth feature now shows the built-in Chat AI instead of CLI agents in a
// terminal. Update published copy only where it still holds the old default.
const before = { title: 'Your AI tools', description: 'Run your CLI agent, or chat with your own provider keys.', detail: 'Agents & chat' }
const after = { title: 'AI chat', description: 'Ask Claude Code, Codex or your own API keys without leaving the workspace.', detail: 'Threads & models' }

async function migrate({ payload, req }: MigrateUpArgs, direction: 'up' | 'down') {
  const [from, to] = direction === 'up' ? [before, after] : [after, before]
  const published = await payload.findGlobal({ slug: 'landing', draft: false, depth: 0, req }) as any
  if (published._status !== 'published') return // A new database is seeded with the current defaults.
  const item = published.features?.items?.[5]
  if (!item) return
  const keys = (Object.keys(from) as (keyof typeof from)[]).filter((key) => item[key] === from[key])
  if (!keys.length) return
  for (const key of keys) item[key] = to[key]
  await payload.updateGlobal({ slug: 'landing', data: { ...published, _status: 'published' }, draft: false, depth: 0, req })
  payload.logger.info(`AI chat feature migration (${direction}): updated ${keys.length} fields.`)
}

export const up = (args: MigrateUpArgs) => migrate(args, 'up')
export const down = (args: MigrateDownArgs) => migrate(args as MigrateUpArgs, 'down')
