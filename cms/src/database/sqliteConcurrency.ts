import { AsyncLocalStorage } from 'node:async_hooks'
import type { Payload } from 'payload'

const configuredClients = new WeakSet<object>()
type CommitState = { failed: boolean; error?: unknown }

export function serializeSQLiteAccess(payload: Payload): void {
  const client = payload.db.drizzle.$client
  if (configuredClients.has(client)) return

  // The pinned native libsql driver can retain a failed BEGIN statement until
  // garbage collection. Avoid causing BUSY by serializing before native calls,
  // keeping the gate until an explicit transaction commits or rolls back.
  let tail = Promise.resolve()
  const acquire = async () => {
    let unlock!: () => void
    const previous = tail
    tail = new Promise<void>((resolve) => { unlock = resolve })
    await previous
    let released = false
    return () => {
      if (released) return
      released = true
      unlock()
    }
  }

  const discardBusyConnection = (error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error &&
        typeof error.code === 'string' && /^SQLITE_BUSY(?:_|$)/.test(error.code)) {
      // Another process writing this file violates the single-instance policy.
      // Fail closed rather than reuse a native connection with a failed BEGIN.
      client.close()
    }
  }

  // Root writes run outside explicit Payload transactions. Transaction bodies
  // use their own client and must never acquire this gate a second time.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exclusive = <T extends (...args: any[]) => Promise<any>>(operation: T): T =>
    (async (...args: Parameters<T>) => {
      const release = await acquire()
      try {
        return await operation(...args)
      } catch (error) {
        discardBusyConnection(error)
        throw error
      } finally {
        release()
      }
    }) as T

  const commits = new Map<number | string, CommitState>()
  const startingTransaction = new AsyncLocalStorage<CommitState>()
  const transaction = client.transaction.bind(client)
  client.transaction = async (mode?: 'write' | 'read' | 'deferred') => {
    const release = await acquire()
    try {
      const tx = await transaction(mode)
      const state = startingTransaction.getStore()
      const commit = tx.commit.bind(tx)
      const rollback = tx.rollback.bind(tx)
      const close = tx.close.bind(tx)
      tx.commit = async () => {
        try {
          await commit()
          release()
        } catch (error) {
          if (state) { state.failed = true; state.error = error }
          throw error
        }
      }
      tx.rollback = async () => {
        try { await rollback() } finally { release() }
      }
      tx.close = () => {
        try { close() } finally { release() }
      }
      return tx
    } catch (error) {
      discardBusyConnection(error)
      release()
      throw error
    }
  }
  const isSelect = (statement: unknown): boolean => {
    const sql = typeof statement === 'string' ? statement
      : statement && typeof statement === 'object' && 'sql' in statement ? statement.sql : undefined
    return typeof sql === 'string' && /^\s*select\b/i.test(sql)
  }
  const execute = client.execute.bind(client)
  const write = exclusive(execute)
  client.execute = new Proxy(execute, {
    apply(target, thisArg, args) {
      // Payload checks document locks with a root SELECT even while its own
      // write transaction is open. WAL permits that read without taking the
      // writer gate, preserving the document-lock check and avoiding deadlock.
      return Reflect.apply(isSelect(args[0]) ? target : write, thisArg, args)
    },
  })
  const batch = client.batch.bind(client)
  const writeBatch = exclusive(batch)
  client.batch = new Proxy(batch, {
    apply(target, thisArg, args) {
      const readOnly = Array.isArray(args[0]) && args[0].every(isSelect) && args[1] !== 'write'
      return Reflect.apply(readOnly ? target : writeBatch, thisArg, args)
    },
  })

  const begin = payload.db.beginTransaction.bind(payload.db)
  const commit = payload.db.commitTransaction.bind(payload.db)
  const rollback = payload.db.rollbackTransaction.bind(payload.db)
  payload.db.beginTransaction = async (options) => {
    const state: CommitState = { failed: false }
    const id = await startingTransaction.run(state, () => begin(options))
    if (id != null) commits.set(id, state)
    return id
  }
  payload.db.commitTransaction = async (incomingID) => {
    const id = await incomingID
    const state = id == null ? undefined : commits.get(id)
    try {
      await commit(id)
      // Payload 3.91's adapter swallows errors from the final Drizzle COMMIT.
      // Preserve the native failure so a rolled-back write cannot report success.
      if (state?.failed) throw state.error
    } finally {
      if (id != null) commits.delete(id)
    }
  }
  payload.db.rollbackTransaction = async (incomingID) => {
    const id = await incomingID
    try { await rollback(id) } finally { if (id != null) commits.delete(id) }
  }
  configuredClients.add(client)
}
