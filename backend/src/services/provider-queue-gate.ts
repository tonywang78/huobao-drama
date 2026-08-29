/**
 * Provider 本地提交闸门：按 provider + baseUrl 限制同时在途任务数。
 * 由 generation 编排层在 fetch 远端前 acquire、任务终态 release；与具体 adapter 无关。
 */

const QUEUE_SIZE_MIN = 1
const QUEUE_SIZE_MAX = 20
const WAIT_POLL_MS = 200

interface Waiter {
  taskId: number
  resolve: (acquired: boolean) => void
  isActive: () => boolean | Promise<boolean>
  timer?: ReturnType<typeof setInterval>
}

interface GateBucket {
  inFlight: Set<number>
  waiters: Waiter[]
  limit: number
}

const buckets = new Map<string, GateBucket>()
/** taskId → gate key，便于终态幂等 release */
const taskKeys = new Map<number, string>()

export function gateKey(provider: string, baseUrl: string | null | undefined): string {
  const p = String(provider || '').trim().toLowerCase()
  const raw = String(baseUrl || '').trim()
  let normalized = raw.replace(/\/+$/, '').toLowerCase()
  try {
    const u = new URL(raw)
    normalized = `${u.protocol}//${u.host}${u.pathname}`.replace(/\/+$/, '').toLowerCase()
  } catch {
    // keep string normalize
  }
  return `${p}|${normalized}`
}

/** 从 AI config.settings 解析队列上限；无效/缺省 → null（不限流） */
export function resolveQueueSize(settings?: string | Record<string, unknown> | null): number | null {
  let obj: Record<string, unknown> | null = null
  if (!settings) return null
  if (typeof settings === 'object') obj = settings
  else {
    try {
      obj = JSON.parse(settings) as Record<string, unknown>
    } catch {
      return null
    }
  }
  const raw = obj?.queueSize
  if (raw === undefined || raw === null || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return null
  const int = Math.floor(n)
  if (int < QUEUE_SIZE_MIN || int > QUEUE_SIZE_MAX) return null
  return int
}

function getBucket(key: string, limit: number): GateBucket {
  let bucket = buckets.get(key)
  if (!bucket) {
    bucket = { inFlight: new Set(), waiters: [], limit }
    buckets.set(key, bucket)
  } else {
    bucket.limit = limit
  }
  return bucket
}

function grant(bucket: GateBucket, key: string, taskId: number): void {
  bucket.inFlight.add(taskId)
  taskKeys.set(taskId, key)
}

function clearWaiterTimer(waiter: Waiter) {
  if (waiter.timer) {
    clearInterval(waiter.timer)
    waiter.timer = undefined
  }
}

/** 尽量按 FIFO 填满空位；isActive 为 false 的 waiter 以 false resolve */
export async function pumpWaiters(key: string): Promise<void> {
  const bucket = buckets.get(key)
  if (!bucket) return

  while (bucket.waiters.length > 0 && bucket.inFlight.size < bucket.limit) {
    const next = bucket.waiters.shift()!
    let active = false
    try {
      active = await next.isActive()
    } catch {
      active = false
    }
    if (!active) {
      clearWaiterTimer(next)
      next.resolve(false)
      continue
    }
    if (bucket.inFlight.size >= bucket.limit) {
      bucket.waiters.unshift(next)
      return
    }
    grant(bucket, key, next.taskId)
    clearWaiterTimer(next)
    next.resolve(true)
  }
}

/**
 * 获取提交槽位。已取消返回 false；成功 true。
 * 等待期间周期性检查 isActive。
 */
export async function acquireSlot(opts: {
  key: string
  limit: number
  taskId: number
  isActive: () => boolean | Promise<boolean>
}): Promise<boolean> {
  const { key, taskId, isActive } = opts
  const limit = Math.min(QUEUE_SIZE_MAX, Math.max(QUEUE_SIZE_MIN, Math.floor(opts.limit)))
  const bucket = getBucket(key, limit)

  if (!(await isActive())) return false

  if (bucket.inFlight.has(taskId)) {
    taskKeys.set(taskId, key)
    return true
  }

  if (bucket.inFlight.size < bucket.limit) {
    grant(bucket, key, taskId)
    return true
  }

  return new Promise<boolean>((resolve) => {
    const waiter: Waiter = { taskId, resolve, isActive }
    bucket.waiters.push(waiter)

    waiter.timer = setInterval(() => {
      void Promise.resolve(isActive()).then((active) => {
        if (active) return
        const idx = bucket.waiters.indexOf(waiter)
        if (idx >= 0) bucket.waiters.splice(idx, 1)
        clearWaiterTimer(waiter)
        resolve(false)
      })
    }, WAIT_POLL_MS)
  })
}

/** 启动 resume 时占用槽位（不阻塞）；已占用则忽略 */
export function registerSlot(key: string, taskId: number, limit: number): void {
  const capped = Math.min(QUEUE_SIZE_MAX, Math.max(QUEUE_SIZE_MIN, Math.floor(limit)))
  const bucket = getBucket(key, capped)
  if (bucket.inFlight.has(taskId)) {
    taskKeys.set(taskId, key)
    return
  }
  grant(bucket, key, taskId)
}

/** 释放槽位（幂等），并唤醒等待者 */
export function releaseSlot(taskId: number): void {
  const key = taskKeys.get(taskId)
  if (!key) return
  taskKeys.delete(taskId)
  const bucket = buckets.get(key)
  if (!bucket) return
  bucket.inFlight.delete(taskId)
  void pumpWaiters(key)
}

/** 测试用：当前在途数量 */
export function getInFlightCount(key: string): number {
  return buckets.get(key)?.inFlight.size ?? 0
}

/** 测试用：等待队列长度 */
export function getWaiterCount(key: string): number {
  return buckets.get(key)?.waiters.length ?? 0
}

/** 测试用：清空全部闸门状态 */
export function resetProviderQueueGate(): void {
  for (const bucket of buckets.values()) {
    for (const w of bucket.waiters) clearWaiterTimer(w)
  }
  buckets.clear()
  taskKeys.clear()
}
