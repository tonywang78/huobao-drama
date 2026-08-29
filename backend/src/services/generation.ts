/**
 * 统一生成任务服务 — 图片/视频生成共用 sys_task 表与同一条生命周期：
 * 创建(processing) → 适配器构建请求 → 同步完成或异步轮询 → 下载落盘 → 回写业务表
 */
import { db, getInsertId, schema } from '../db/index.js'
import { eq, inArray, and } from 'drizzle-orm'
import { getActiveConfig, getConfigById, isOfficialProvider, type ServiceType } from './ai.js'
import { now } from '../utils/response.js'
import { downloadFile, fetchImageAsCompressedDataUrl, generateImageThumb, readImageAsCompressedDataUrl, saveBase64Image } from '../utils/storage.js'
import { extractVideoPoster } from '../utils/video-poster.js'
import { getImageAdapter, getVideoAdapter } from './adapters/registry'
import type { AIConfig } from './adapters/types'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn, redactUrl } from '../utils/task-logger.js'
import {
  acquireSlot,
  gateKey,
  registerSlot,
  releaseSlot,
  resolveQueueSize,
} from './provider-queue-gate.js'

type TaskType = 'image' | 'video'

const taskLabel = (type: TaskType) => (type === 'image' ? 'ImageTask' : 'VideoTask')

// 轮询节奏：图片 5s×120（上限 10 分钟）；视频 10s×300
const POLL_PROFILES: Record<TaskType, { attempts: number; intervalMs: number; maxDurationMs: number | null }> = {
  image: { attempts: 120, intervalMs: 5000, maxDurationMs: 600_000 },
  video: { attempts: 300, intervalMs: 10_000, maxDurationMs: null },
}

interface GenerateImageParams {
  storyboardId?: number
  dramaId?: number
  sceneId?: number
  characterId?: number
  propId?: number
  prompt: string
  model?: string
  size?: string
  referenceImages?: string[]
  frameType?: string
  configId?: number
}

interface GenerateVideoParams {
  storyboardId?: number
  dramaId?: number
  prompt: string
  model?: string
  referenceMode?: string
  imageUrl?: string
  firstFrameUrl?: string
  lastFrameUrl?: string
  referenceImageUrls?: string[]
  referenceVideoUrls?: string[]
  referenceAudioUrls?: string[]
  generateAudio?: boolean
  duration?: number
  aspectRatio?: string
  resolution?: string
  configId?: number
}

interface GenerateImageEditParams {
  storyboardId?: number
  dramaId?: number
  sceneId?: number
  characterId?: number
  propId?: number
  prompt: string
  model?: string
  size?: string
  referenceImages: string[]
  frameType?: string
  configId?: number
}

export async function generateImage(params: GenerateImageParams): Promise<number> {
  // 指定配置（集锁定）可能已停用/删除/厂商收敛，失效时回退到当前启用配置，避免生成被旧引用卡死
  const config = params.configId
    ? (await getConfigById(params.configId)) ?? await getActiveConfig('image')
    : await getActiveConfig('image')
  if (!config) throw new Error('未配置图片模型，请先到「设置」页添加并启用 AI 服务')

  const id = await createTask('image', config, {
    storyboardId: params.storyboardId,
    dramaId: params.dramaId,
    sceneId: params.sceneId,
    characterId: params.characterId,
    propId: params.propId,
    prompt: params.prompt,
    model: params.model || config.model,
  }, {
    size: params.size || '1920x1080',
    frameType: params.frameType,
    referenceImages: params.referenceImages,
  })

  logTaskStart('ImageTask', 'enqueue', {
    id,
    provider: config.provider,
    storyboardId: params.storyboardId,
    sceneId: params.sceneId,
    characterId: params.characterId,
    frameType: params.frameType,
    model: params.model || config.model,
  })
  logTaskPayload('ImageTask', 'enqueue params', {
    id,
    config: { provider: config.provider, model: config.model, baseUrl: config.baseUrl },
    params,
  })
  return id
}

export async function generateImageEdit(params: GenerateImageEditParams): Promise<number> {
  if (!params.referenceImages?.length) {
    throw new Error('图生图需要参考图')
  }

  const config = params.configId
    ? (await getConfigById(params.configId)) ?? await getActiveConfig('img2img')
    : await getActiveConfig('img2img')
  if (!config) throw new Error('未配置图生图模型，请先到「设置」页添加并启用 AI 服务')
  if (!isOfficialProvider('img2img', config.provider)) {
    throw new Error(`图生图不支持 ${config.provider} 厂商`)
  }

  const id = await createTask('image', config, {
    storyboardId: params.storyboardId,
    dramaId: params.dramaId,
    sceneId: params.sceneId,
    characterId: params.characterId,
    propId: params.propId,
    prompt: params.prompt,
    model: params.model || config.model,
  }, {
    size: params.size || '1920x1080',
    frameType: params.frameType,
    referenceImages: params.referenceImages,
    serviceType: 'img2img',
  })

  logTaskStart('ImageTask', 'enqueue-img2img', {
    id,
    provider: config.provider,
    sceneId: params.sceneId,
    characterId: params.characterId,
    model: params.model || config.model,
  })
  logTaskPayload('ImageTask', 'enqueue img2img params', {
    id,
    config: { provider: config.provider, model: config.model, baseUrl: config.baseUrl },
    params,
  })
  return id
}

export async function generateVideo(params: GenerateVideoParams): Promise<number> {
  const isFirstLast = params.referenceMode === 'first_last'
  const serviceType: ServiceType = isFirstLast ? 'first_last' : 'video'
  // 指定配置（集锁定）可能已停用/删除/厂商收敛，失效时回退到当前启用配置
  const config = params.configId
    ? (await getConfigById(params.configId)) ?? await getActiveConfig(serviceType)
    : await getActiveConfig(serviceType)
  if (!config) {
    throw new Error(isFirstLast
      ? '请先在设置中添加首尾帧服务'
      : '未配置视频模型，请先到「设置」页添加并启用 AI 服务')
  }
  if (isFirstLast && !isOfficialProvider('first_last', config.provider)) {
    throw new Error('当前视频服务不支持首尾帧')
  }

  const id = await createTask('video', config, {
    storyboardId: params.storyboardId,
    dramaId: params.dramaId,
    prompt: params.prompt,
    model: params.model || config.model,
  }, {
    serviceType,
    referenceMode: params.referenceMode || 'reference',
    imageUrl: params.imageUrl,
    firstFrameUrl: params.firstFrameUrl,
    lastFrameUrl: params.lastFrameUrl,
    referenceImageUrls: params.referenceImageUrls,
    referenceVideoUrls: params.referenceVideoUrls,
    referenceAudioUrls: params.referenceAudioUrls,
    generateAudio: params.generateAudio === false ? 0 : 1,
    duration: params.duration || 5,
    aspectRatio: params.aspectRatio || '16:9',
    // 保留高分辨率档位透传（MiniMax 768P/2K），火山等适配器内部自行归并
    resolution: ['480p', '720p', '1080p', '2K'].includes(params.resolution || '') ? params.resolution : '720p',
  })

  logTaskStart('VideoTask', 'enqueue', {
    id,
    provider: config.provider,
    storyboardId: params.storyboardId,
    dramaId: params.dramaId,
    referenceMode: params.referenceMode || 'reference',
    duration: params.duration || 5,
  })
  logTaskPayload('VideoTask', 'enqueue params', {
    id,
    config: { provider: config.provider, model: config.model, baseUrl: config.baseUrl },
    params,
  })
  return id
}

type SysTaskRecord = typeof schema.sysTask.$inferSelect

/** 进程内正在轮询的任务，避免重启恢复 / 重复 enqueue 时双开 poll */
const activePollIds = new Set<number>()

/** 仍可轮询 / 提交中的状态 */
export function isCancellableTaskStatus(status: string | null | undefined): boolean {
  return status === 'processing' || status === 'pending'
}

async function isActiveTask(id: number): Promise<boolean> {
  const [row] = await db.select().from(schema.sysTask).where(eq(schema.sysTask.id, id))
  return !!row && isCancellableTaskStatus(row.status)
}

async function resolveConfigForCancel(record: SysTaskRecord): Promise<AIConfig | null> {
  const params = parseTaskParams(record.params)
  const configServiceType: ServiceType = params.serviceType === 'img2img'
    ? 'img2img'
    : params.serviceType === 'first_last' || params.referenceMode === 'first_last'
      ? 'first_last'
      : (record.type as ServiceType) === 'video'
        ? 'video'
        : 'image'

  const lockedConfigForEpisode = (ep: typeof schema.episodes.$inferSelect | undefined) => {
    if (!ep) return null
    const lockedId = configServiceType === 'first_last'
      ? ep.firstLastConfigId
      : configServiceType === 'video'
        ? ep.videoConfigId
        : configServiceType === 'img2img'
          ? ep.img2imgConfigId
          : ep.imageConfigId
    return lockedId
  }

  // 顶栏可覆盖本集锁定：取消/恢复须按任务真实 provider 找凭证，避免打到错误厂商
  const rows = (await db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.serviceType, configServiceType)))
    .filter(r => (r.provider || '').toLowerCase() === (record.provider || '').toLowerCase())
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
  const match = rows.find(r => r.isActive) || rows[0]
  if (match) {
    const models = match.model ? JSON.parse(match.model) : []
    return {
      provider: match.provider || '',
      baseUrl: match.baseUrl,
      apiKey: match.apiKey,
      model: models[0] || '',
      serviceType: match.serviceType as ServiceType,
      settings: match.settings || null,
    }
  }

  if (record.storyboardId) {
    const [sb] = await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, record.storyboardId))
    if (sb) {
      const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId))
      const lockedId = lockedConfigForEpisode(ep)
      if (lockedId != null) {
        const locked = await getConfigById(lockedId)
        if (locked) return locked
      }
    }
  }

  if (record.sceneId && configServiceType === 'img2img') {
    const links = await db.select().from(schema.episodeScenes)
      .where(eq(schema.episodeScenes.sceneId, record.sceneId))
      .limit(1)
    if (links[0]) {
      const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, links[0].episodeId))
      const lockedId = lockedConfigForEpisode(ep)
      if (lockedId != null) {
        const locked = await getConfigById(lockedId)
        if (locked) return locked
      }
    }
  }

  return getActiveConfig(configServiceType)
}

/**
 * 服务启动时恢复仍在 processing/pending 的任务：
 * - 已有远端 taskId：只续 poll（并登记队列槽位），绝不重新提交
 * - 无 taskId 且配置了 queueSize：重新走 processTask（崩溃卡在等槽/未提交）
 */
export async function resumeActiveTasks(): Promise<{ resumed: number; skipped: number }> {
  const rows = await db.select().from(schema.sysTask)
    .where(inArray(schema.sysTask.status, ['processing', 'pending']))

  let resumed = 0
  let skipped = 0

  for (const record of rows) {
    if (activePollIds.has(record.id)) {
      skipped++
      continue
    }

    const config = await resolveConfigForCancel(record)
    if (!config) {
      skipped++
      logTaskWarn(taskLabel((record.type as TaskType) || 'video'), 'resume-skip-no-config', {
        id: record.id,
        provider: record.provider,
        taskId: record.taskId,
      })
      continue
    }

    const queueSize = resolveQueueSize(config.settings ?? null)

    if (!record.taskId) {
      if (queueSize == null) {
        skipped++
        logTaskWarn(taskLabel((record.type as TaskType) || 'video'), 'resume-skip-no-task-id', {
          id: record.id,
          provider: record.provider,
        })
        continue
      }
      logTaskProgress(taskLabel(record.type as TaskType), 'resume-reprocess', {
        id: record.id,
        provider: record.provider,
        queueSize,
      })
      processTask(record.id, config).catch((err: any) => {
        logTaskError(taskLabel(record.type as TaskType), 'resume-reprocess', {
          id: record.id,
          error: err?.message || String(err),
        })
      })
      resumed++
      continue
    }

    if (queueSize != null) {
      registerSlot(gateKey(config.provider, config.baseUrl), record.id, queueSize)
    }

    logTaskProgress(taskLabel(record.type as TaskType), 'resume-poll', {
      id: record.id,
      provider: record.provider,
      taskId: record.taskId,
    })
    pollTask(record, config, record.taskId).catch((err: any) => {
      logTaskError(taskLabel(record.type as TaskType), 'resume-poll', {
        id: record.id,
        error: err?.message || String(err),
      })
    })
    resumed++
  }

  if (resumed || skipped) {
    logTaskProgress('SysTask', 'resume-active-tasks', { resumed, skipped, total: rows.length })
  }
  return { resumed, skipped }
}

/**
 * 取消生成任务：本地标 cancelled 并停止 poll；Comfy 等尽力中断上游。
 * 已终态任务原样返回，不改写。
 */
export async function cancelTask(id: number): Promise<SysTaskRecord | null> {
  const [record] = await db.select().from(schema.sysTask).where(eq(schema.sysTask.id, id))
  if (!record) return null
  if (!isCancellableTaskStatus(record.status)) return record

  await db.update(schema.sysTask)
    .set({ status: 'cancelled', errorMsg: '用户取消', updatedAt: now() })
    .where(eq(schema.sysTask.id, id))

  releaseSlot(id)

  logTaskProgress(taskLabel(record.type as TaskType), 'cancel', {
    id,
    provider: record.provider,
    taskId: record.taskId,
  })

  if (record.taskId && record.provider) {
    try {
      const config = await resolveConfigForCancel(record)
      if (config) {
        const adapter = record.type === 'image'
          ? getImageAdapter(config.provider)
          : getVideoAdapter(config.provider)
        if (typeof adapter.cancelRemoteTask === 'function') {
          await adapter.cancelRemoteTask(config, record.taskId)
        }
      }
    } catch (err: any) {
      logTaskWarn(taskLabel(record.type as TaskType), 'cancel-remote', {
        id,
        error: err?.message || String(err),
      })
    }
  }

  const [updated] = await db.select().from(schema.sysTask).where(eq(schema.sysTask.id, id))
  return updated || null
}

/** 取消某集下所有进行中的生成任务（默认仅 video） */
export async function cancelEpisodeTasks(
  episodeId: number,
  type: TaskType = 'video',
): Promise<{ cancelled: number; ids: number[] }> {
  const sbs = await db.select().from(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId))
  const sbIds = sbs.map(s => s.id)
  if (!sbIds.length) return { cancelled: 0, ids: [] }

  const rows = await db.select().from(schema.sysTask)
    .where(inArray(schema.sysTask.storyboardId, sbIds))
  const active = rows.filter(r => r.type === type && isCancellableTaskStatus(r.status))

  const ids: number[] = []
  for (const row of active) {
    await cancelTask(row.id)
    ids.push(row.id)
  }
  return { cancelled: ids.length, ids }
}

async function createTask(
  type: TaskType,
  config: AIConfig,
  fields: {
    storyboardId?: number
    dramaId?: number
    sceneId?: number
    characterId?: number
    propId?: number
    prompt: string
    model?: string | null
  },
  params: Record<string, unknown>,
): Promise<number> {
  const ts = now()
  const gated = resolveQueueSize(config.settings ?? null) != null
  const res = await db.insert(schema.sysTask).values({
    type,
    ...fields,
    provider: config.provider,
    params: JSON.stringify(params),
    status: gated ? 'pending' : 'processing',
    createdAt: ts,
    updatedAt: ts,
  })

  const id = getInsertId(res)
  processTask(id, config).catch(err => {
    logTaskError(taskLabel(type), 'process', { id, error: err.message })
    console.error(`${taskLabel(type)} ${id} failed:`, err)
  })
  return id
}

function parseTaskParams(raw: string | null | undefined): Record<string, any> {
  if (!raw) return {}
  try {
    return JSON.parse(raw) || {}
  } catch {
    return {}
  }
}

async function processTask(id: number, config: AIConfig) {
  const queueSize = resolveQueueSize(config.settings ?? null)
  const key = queueSize != null ? gateKey(config.provider, config.baseUrl) : null
  /** 已拿到槽位且尚未交给 poll 终态释放 */
  let slotOwnedHere = false

  try {
    const [record] = await db.select().from(schema.sysTask).where(eq(schema.sysTask.id, id))
    if (!record) return
    if (!(await isActiveTask(id))) return

    const type = record.type as TaskType
    const label = taskLabel(type)
    const params = parseTaskParams(record.params)
    logTaskProgress(label, 'build-request', {
      id,
      provider: config.provider,
      storyboardId: record.storyboardId,
      sceneId: record.sceneId,
      characterId: record.characterId,
    })

    let url: string, method: string, headers: Record<string, string>, body: unknown

    if (type === 'image') {
      const adapter = getImageAdapter(config.provider)
      const resolvedReferenceImages = await normalizeReferenceImages(params.referenceImages)
      ;({ url, method, headers, body } = await Promise.resolve(adapter.buildGenerateRequest(config, {
        id: record.id,
        model: record.model,
        prompt: record.prompt,
        size: params.size,
        frameType: params.frameType,
        referenceImages: resolvedReferenceImages.length ? JSON.stringify(resolvedReferenceImages) : null,
      })))
    } else {
      const adapter = getVideoAdapter(config.provider)
      const resolvedImageUrl = await normalizeVideoReferenceUrl(params.imageUrl)
      const resolvedFirstFrameUrl = await normalizeVideoReferenceUrl(params.firstFrameUrl)
      const resolvedLastFrameUrl = await normalizeVideoReferenceUrl(params.lastFrameUrl)
      const resolvedReferenceImageUrls = await normalizeVideoReferenceUrls(params.referenceImageUrls)
      // 参考视频/音频文件较大，不适合 dataURL 内联，需解析为公网可访问 URL
      const resolvedReferenceVideoUrls = resolvePublicMediaUrls(params.referenceVideoUrls, 'video')
      const resolvedReferenceAudioUrls = resolvePublicMediaUrls(params.referenceAudioUrls, 'audio')
      ;({ url, method, headers, body } = await Promise.resolve(adapter.buildGenerateRequest(config, {
        id: record.id,
        model: record.model,
        prompt: record.prompt,
        referenceMode: params.referenceMode,
        imageUrl: resolvedImageUrl,
        firstFrameUrl: resolvedFirstFrameUrl,
        lastFrameUrl: resolvedLastFrameUrl,
        referenceImageUrls: resolvedReferenceImageUrls.length ? JSON.stringify(resolvedReferenceImageUrls) : null,
        referenceVideoUrls: resolvedReferenceVideoUrls.length ? JSON.stringify(resolvedReferenceVideoUrls) : null,
        referenceAudioUrls: resolvedReferenceAudioUrls.length ? JSON.stringify(resolvedReferenceAudioUrls) : null,
        generateAudio: params.generateAudio,
        duration: params.duration,
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
      })))
    }

    if (!(await isActiveTask(id))) {
      logTaskProgress(label, 'cancel-before-submit', { id })
      return
    }

    if (key && queueSize != null) {
      logTaskProgress(label, 'queue-wait', { id, key, queueSize })
      const acquired = await acquireSlot({
        key,
        limit: queueSize,
        taskId: id,
        isActive: () => isActiveTask(id),
      })
      if (!acquired) {
        logTaskProgress(label, 'queue-aborted', { id, key })
        return
      }
      slotOwnedHere = true
      await db.update(schema.sysTask)
        .set({ status: 'processing', updatedAt: now() })
        .where(and(
          eq(schema.sysTask.id, id),
          inArray(schema.sysTask.status, ['processing', 'pending']),
        ))
      logTaskProgress(label, 'queue-acquired', { id, key, queueSize })
    }

    logTaskProgress(label, 'request', {
      id,
      provider: config.provider,
      method,
      url: redactUrl(url),
      model: record.model,
    })
    logTaskPayload(label, 'request payload', { id, method, url, headers, body })

    const resp = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(600_000),
    })

    if (!resp.ok) throw new Error(`API error ${resp.status}: ${await resp.text()}`)
    const result = await resp.json() as any
    logTaskPayload(label, 'response payload', { id, provider: config.provider, result })

    if (type === 'image') {
      const adapter = getImageAdapter(config.provider)
      const { isAsync, taskId, imageUrl } = adapter.parseGenerateResponse(result)

      if (!isAsync && imageUrl) {
        logTaskProgress(label, 'sync-complete', { id, imageUrl })
        await handleImageComplete(record, imageUrl)
        return
      }

      if (!isAsync && !imageUrl) {
        // 同步模式但无 URL（Gemini 等返回 base64）
        const b64 = adapter.extractImageBase64(result)
        if (b64) {
          logTaskProgress(label, 'sync-base64-complete', { id, mimeType: b64.mimeType })
          await handleImageCompleteBase64(record, b64.data, b64.mimeType)
          return
        }
        throw new Error('No image URL or base64 data in response')
      }

      if (!(await isActiveTask(id))) {
        logTaskProgress(label, 'cancel-skip-poll', { id })
        return
      }
      await markPolling(id, taskId)
      slotOwnedHere = false
      pollTask(record, config, taskId!)
      return
    }

    const adapter = getVideoAdapter(config.provider)
    const { isAsync, taskId, videoUrl } = adapter.parseGenerateResponse(result)

    if (!isAsync && videoUrl) {
      logTaskProgress(label, 'sync-complete', { id, videoUrl })
      await handleVideoComplete(record, videoUrl, params.duration)
      return
    }

    if (!(await isActiveTask(id))) {
      logTaskProgress(label, 'cancel-skip-poll', { id })
      return
    }
    await markPolling(id, taskId)
    slotOwnedHere = false
    pollTask(record, config, taskId!)
  } catch (err: any) {
    if (!(await isActiveTask(id))) return
    await failTask(id, err.message)
  } finally {
    if (slotOwnedHere) releaseSlot(id)
  }
}

async function markPolling(id: number, taskId: string | undefined) {
  await db.update(schema.sysTask)
    .set({ taskId, status: 'processing', updatedAt: now() })
    .where(and(
      eq(schema.sysTask.id, id),
      inArray(schema.sysTask.status, ['processing', 'pending']),
    ))
  logTaskProgress('SysTask', 'poll-start', { id, taskId })
}

async function failTask(id: number, message: string) {
  const [row] = await db.select().from(schema.sysTask).where(eq(schema.sysTask.id, id))
  if (!row || row.status === 'cancelled' || row.status === 'completed') return
  logTaskError('SysTask', 'failed', { id, error: message })
  await db.update(schema.sysTask)
    .set({ status: 'failed', errorMsg: message, updatedAt: now() })
    .where(eq(schema.sysTask.id, id))
  releaseSlot(id)
}

async function pollTask(record: SysTaskRecord, config: AIConfig, taskId: string) {
  if (activePollIds.has(record.id)) {
    logTaskWarn(taskLabel(record.type as TaskType), 'poll-already-running', { id: record.id, taskId })
    return
  }
  activePollIds.add(record.id)

  const type = record.type as TaskType
  const label = taskLabel(type)
  const profile = POLL_PROFILES[type]
  const adapter = type === 'image' ? getImageAdapter(config.provider) : getVideoAdapter(config.provider)
  const startedAt = Date.now()
  /** Comfy 取消后 history={} 且不在队列；连续确认两次再失败，避免刚入队瞬间误判 */
  let comfyGoneMisses = 0

  try {
    for (let i = 0; i < profile.attempts; i++) {
      if (profile.maxDurationMs && Date.now() - startedAt >= profile.maxDurationMs) {
        await failTask(record.id, 'Timeout: Polling exceeded 10 minutes')
        return
      }
      await new Promise(r => setTimeout(r, profile.intervalMs))
      if (!(await isActiveTask(record.id))) {
        logTaskProgress(label, 'poll-cancelled', { id: record.id, taskId, attempt: i + 1 })
        return
      }
      try {
        const { url, method, headers } = adapter.buildPollRequest(config, taskId)
        logTaskProgress(label, 'poll-request', {
          id: record.id,
          taskId,
          provider: config.provider,
          method,
          url: redactUrl(url),
          attempt: i + 1,
        })
        const remainingMs = profile.maxDurationMs
          ? Math.max(1_000, profile.maxDurationMs - (Date.now() - startedAt))
          : 600_000
        const resp = await fetch(url, {
          method,
          headers,
          signal: AbortSignal.timeout(remainingMs),
        })
        if (!resp.ok) continue
        const result = await resp.json() as any

        // 图片/视频 PollResponse 结构不同，这里统一按 any 取值后按 type 分支
        // 第三参 taskId 供 ComfyUI 等从 history 条目拼 /view URL
        const pollResp: any = await Promise.resolve(adapter.parsePollResponse(result, config, taskId))

        if (!(await isActiveTask(record.id))) {
          logTaskProgress(label, 'poll-cancelled', { id: record.id, taskId, attempt: i + 1 })
          return
        }

        if (
          config.provider === 'comfyui'
          && pollResp.status === 'failed'
          && /history 为空且不在队列中/.test(String(pollResp.error || ''))
        ) {
          comfyGoneMisses++
          if (comfyGoneMisses < 2) {
            logTaskWarn(label, 'poll-comfy-gone-soft', {
              id: record.id,
              taskId,
              attempt: i + 1,
              misses: comfyGoneMisses,
            })
            continue
          }
        } else {
          comfyGoneMisses = 0
        }

        if (pollResp.status === 'completed') {
          if (type === 'image') {
            if (pollResp.imageUrl) {
              logTaskSuccess(label, 'poll-complete', { id: record.id, taskId, imageUrl: pollResp.imageUrl })
              await handleImageComplete(record, pollResp.imageUrl)
              return
            }
            if (adapter.provider === 'gemini') {
              // Gemini 可能返回 base64
              const b64 = (adapter as ReturnType<typeof getImageAdapter>).extractImageBase64(result)
              if (b64) {
                logTaskSuccess(label, 'poll-base64-complete', { id: record.id, taskId, mimeType: b64.mimeType })
                await handleImageCompleteBase64(record, b64.data, b64.mimeType)
                return
              }
            }
            await failTask(record.id, 'Poll completed without image URL')
            return
          }
          if (pollResp.videoUrl) {
            logTaskSuccess(label, 'poll-complete', { id: record.id, taskId, videoUrl: pollResp.videoUrl })
            await handleVideoComplete(record, pollResp.videoUrl, null)
            return
          }
          await failTask(record.id, 'Poll completed without video URL')
          return
        }
        if (pollResp.status === 'failed') {
          // 上游明确失败（如内容审核拦截）属终态：立即落库，不重试不等待超时
          await failTask(record.id, pollResp.error || 'Generation failed')
          return
        }
      } catch (err: any) {
        if (!(await isActiveTask(record.id))) return
        const exhausted = i === profile.attempts - 1
          || (profile.maxDurationMs != null && Date.now() - startedAt >= profile.maxDurationMs)
        if (exhausted) {
          await failTask(record.id, `Timeout: ${err.message}`)
          return
        }
        logTaskWarn(label, 'poll-retry', { id: record.id, taskId, attempt: i + 1, error: err.message })
      }
    }
    await failTask(record.id, 'Timeout: polling attempts exhausted')
  } finally {
    activePollIds.delete(record.id)
    releaseSlot(record.id)
  }
}

async function handleImageComplete(record: SysTaskRecord, imageUrl: string) {
  if (!(await isActiveTask(record.id))) return
  const localPath = await downloadFile(imageUrl, 'images')
  // 列表页缩略图（前端按命名约定推导地址，失败不影响主流程）
  await generateImageThumb(localPath)

  if (!(await isActiveTask(record.id))) return
  await db.update(schema.sysTask)
    .set({ resultUrl: imageUrl, localPath, status: 'completed', completedAt: now(), updatedAt: now() })
    .where(and(
      eq(schema.sysTask.id, record.id),
      inArray(schema.sysTask.status, ['processing', 'pending']),
    ))

  const [latest] = await db.select().from(schema.sysTask).where(eq(schema.sysTask.id, record.id))
  if (latest?.status !== 'completed') return

  logTaskSuccess('ImageTask', 'downloaded', { id: record.id, provider: record.provider, localPath })
  await writeBackImageAssets(record, localPath)
}

async function handleImageCompleteBase64(record: SysTaskRecord, base64Data: string, mimeType: string) {
  if (!(await isActiveTask(record.id))) return
  const localPath = await saveBase64Image(base64Data, mimeType, 'images')
  await generateImageThumb(localPath)

  if (!(await isActiveTask(record.id))) return
  await db.update(schema.sysTask)
    .set({ localPath, status: 'completed', completedAt: now(), updatedAt: now() })
    .where(and(
      eq(schema.sysTask.id, record.id),
      inArray(schema.sysTask.status, ['processing', 'pending']),
    ))

  const [latest] = await db.select().from(schema.sysTask).where(eq(schema.sysTask.id, record.id))
  if (latest?.status !== 'completed') return

  logTaskSuccess('ImageTask', 'saved-base64', { id: record.id, provider: record.provider, mimeType, localPath })
  await writeBackImageAssets(record, localPath)
}

// 图片完成后回写业务表：分镜(按 frameType)、角色、场景、道具
async function writeBackImageAssets(record: SysTaskRecord, localPath: string) {
  const params = parseTaskParams(record.params)
  if (record.storyboardId) {
    const sbUpdate: Record<string, any> = { updatedAt: now() }
    if (params.frameType === 'first_frame') sbUpdate.firstFrameImage = localPath
    else if (params.frameType === 'last_frame') sbUpdate.lastFrameImage = localPath
    else sbUpdate.composedImage = localPath
    await db.update(schema.storyboards).set(sbUpdate).where(eq(schema.storyboards.id, record.storyboardId))
  }
  if (record.characterId) {
    await db.update(schema.characters).set({ imageUrl: localPath, updatedAt: now() }).where(eq(schema.characters.id, record.characterId))
  }
  if (record.sceneId) {
    await db.update(schema.scenes).set({ imageUrl: localPath, status: 'completed', updatedAt: now() }).where(eq(schema.scenes.id, record.sceneId))
  }
  if (record.propId) {
    await db.update(schema.props).set({ imageUrl: localPath, updatedAt: now() }).where(eq(schema.props.id, record.propId))
  }
}

async function handleVideoComplete(record: SysTaskRecord, videoUrl: string, duration: number | null | undefined) {
  if (!(await isActiveTask(record.id))) return
  const localPath = await downloadFile(videoUrl, 'videos')
  // 海报帧供列表/封面展示，避免前端为显示首帧缓冲整个视频
  await extractVideoPoster(localPath)
  if (!(await isActiveTask(record.id))) return
  await db.update(schema.sysTask)
    .set({ resultUrl: videoUrl, localPath, status: 'completed', completedAt: now(), updatedAt: now() })
    .where(and(
      eq(schema.sysTask.id, record.id),
      inArray(schema.sysTask.status, ['processing', 'pending']),
    ))

  const [latest] = await db.select().from(schema.sysTask).where(eq(schema.sysTask.id, record.id))
  if (latest?.status !== 'completed') return

  logTaskSuccess('VideoTask', 'downloaded', { id: record.id, localPath, storyboardId: record.storyboardId, duration })

  if (record.storyboardId) {
    await db.update(schema.storyboards)
      .set({ videoUrl: localPath, duration: duration || undefined, updatedAt: now() })
      .where(eq(schema.storyboards.id, record.storyboardId))
  }
}

// ─── 参考素材归一化 ───────────────────────────────────────────────

const REF_COMPRESS_OPTS = { maxWidth: 768, maxHeight: 768, quality: 68 }

function extractLocalStaticPath(value: string): string | null {
  const trimmed = String(value || '').trim()
  if (!trimmed) return null
  if (trimmed.startsWith('static/')) return trimmed
  if (trimmed.startsWith('/static/')) return trimmed.slice(1)
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const pathname = new URL(trimmed).pathname
      if (pathname.startsWith('/static/')) return pathname.slice(1)
    } catch { /* ignore */ }
  }
  return null
}

async function normalizeReferenceImages(refs: string[] | null | undefined): Promise<string[]> {
  if (!Array.isArray(refs) || !refs.length) return []

  const deduped = Array.from(
    new Set(
      refs
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  )

  const normalized = await Promise.all(deduped.map(async (value) => {
    if (value.startsWith('data:image/')) return value
    const localPath = extractLocalStaticPath(value)
    if (localPath) {
      try {
        return await readImageAsCompressedDataUrl(localPath, REF_COMPRESS_OPTS)
      } catch (err) {
        logTaskWarn('ImageTask', 'reference-read-failed', { path: localPath, error: (err as Error).message })
        return null
      }
    }
    if (value.startsWith('http://') || value.startsWith('https://')) {
      try {
        return await fetchImageAsCompressedDataUrl(value, REF_COMPRESS_OPTS)
      } catch (err) {
        logTaskWarn('ImageTask', 'reference-fetch-failed', { url: redactUrl(value), error: (err as Error).message })
        return null
      }
    }
    return null
  }))

  return normalized.filter((item): item is string => !!item).slice(0, 6)
}

async function normalizeVideoReferenceUrl(value: string | null | undefined): Promise<string | null> {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (raw.startsWith('data:image/')) return raw
  if (raw.startsWith('static/') || raw.startsWith('/static/')) {
    const localPath = raw.startsWith('/static/') ? raw.slice(1) : raw
    try {
      return await readImageAsCompressedDataUrl(localPath, {
        maxWidth: 768,
        maxHeight: 768,
        quality: 68,
      })
    } catch (err) {
      logTaskWarn('VideoTask', 'reference-read-failed', { path: localPath, error: (err as Error).message })
      return null
    }
  }
  return raw
}

async function normalizeVideoReferenceUrls(refs: string[] | null | undefined): Promise<string[]> {
  if (!Array.isArray(refs) || !refs.length) return []
  const normalized = await Promise.all(
    Array.from(new Set(refs.map((item) => String(item || '').trim()).filter(Boolean))).map((item) => normalizeVideoReferenceUrl(item)),
  )
  return normalized.filter((item): item is string => !!item)
}

/**
 * 将参考视频/音频解析为 Seedance API 可访问的 URL。
 * http(s)/dataURL 直通；本地 static 路径需要 PUBLIC_BASE_URL 拼成公网地址，
 * 未配置时抛出可操作的中文错误（落入 catch 写入 error_msg 供前端展示）。
 */
function resolvePublicMediaUrl(value: string | null | undefined, kind: 'video' | 'audio'): string | null {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) return raw
  if (raw.startsWith('static/') || raw.startsWith('/static/')) {
    const base = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '')
    if (!base) {
      const label = kind === 'video' ? '视频' : '音频'
      throw new Error(
        `参考${label}为本地路径 ${raw}，但后端未配置 PUBLIC_BASE_URL，Seedance API 无法访问内网地址。` +
        `请在 backend/.env 配置 PUBLIC_BASE_URL（如 https://your-domain.com）后重试，或改用公网 URL。`,
      )
    }
    const p = raw.startsWith('/') ? raw : `/${raw}`
    return `${base}${p}`
  }
  return raw
}

function resolvePublicMediaUrls(refs: string[] | null | undefined, kind: 'video' | 'audio'): string[] {
  if (!Array.isArray(refs) || !refs.length) return []
  const items = Array.from(new Set(refs.map((item) => String(item || '').trim()).filter(Boolean)))
  return items.map((item) => resolvePublicMediaUrl(item, kind)).filter((item): item is string => !!item)
}
