const locks = new Map<string, Promise<void>>()

export async function withTxLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve()
  let resolve!: () => void
  const next = new Promise<void>(r => { resolve = r })
  locks.set(key, next)
  await prev
  try {
    return await fn()
  } finally {
    resolve()
    if (locks.get(key) === next) locks.delete(key)
  }
}
