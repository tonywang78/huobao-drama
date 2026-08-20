/**
 * ComfyUI 共用逻辑：内置 API workflow 加载、占位符注入、参考图上传、
 * /prompt 提交与 /history + /view 结果解析。
 *
 * 仅消费 API 格式 workflow（prompt 对象）。完整 UI 导出文件不参与运行时。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import type { AIConfig, ProviderRequest } from './types'
import { joinProviderUrl } from './url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WORKFLOW_DIR = join(__dirname, 'comfyui', 'workflows')

export type ComfyWorkflowKind = 'image' | 'video'

export interface ComfyPlaceholderValues {
  prompt?: string | null
  negativePrompt?: string | null
  width?: number
  height?: number
  seed?: number
  images?: string[]
  duration?: number | null
  aspectRatio?: string | null
}

export interface ComfyBindingTarget {
  nodeId: string
  input: string
}

export interface ComfySettings {
  workflowApi?: Record<string, unknown> | null
  /** 语义源 → 节点 input 绑定；优先于 {{PLACEHOLDER}} */
  bindings?: Record<string, ComfyBindingTarget | null | undefined>
}

const PLACEHOLDER_KEYS = [
  'PROMPT',
  'NEGATIVE_PROMPT',
  'WIDTH',
  'HEIGHT',
  'SEED',
  'DURATION',
  'ASPECT_RATIO',
] as const

/** 绑定 key → 取值 */
function bindingValueMap(values: ComfyPlaceholderValues): Record<string, string | number | undefined> {
  const map: Record<string, string | number | undefined> = {
    prompt: values.prompt ?? '',
    negativePrompt: values.negativePrompt ?? '',
    width: values.width ?? 1024,
    height: values.height ?? 1024,
    seed: values.seed ?? Math.floor(Math.random() * 2 ** 32),
    duration: values.duration ?? 5,
    aspectRatio: values.aspectRatio ?? '16:9',
  }
  const images = values.images || []
  images.forEach((name, i) => {
    map[`image_${i + 1}`] = name
  })
  return map
}

/**
 * 按 UI 绑定表写入节点 inputs（bindings 优先于占位符结果）。
 * 跳过无效 / 缺值的绑定；`output` 键为输出节点配置，不写入 inputs。
 */
export function applyBindings(
  workflow: Record<string, unknown>,
  bindings: ComfySettings['bindings'] | null | undefined,
  values: ComfyPlaceholderValues,
): Record<string, unknown> {
  if (!bindings || typeof bindings !== 'object') return workflow
  const valueMap = bindingValueMap(values)

  for (const [key, target] of Object.entries(bindings)) {
    if (key === 'output') continue
    if (!target?.nodeId || !target?.input) continue
    const value = valueMap[key]
    if (value === undefined) continue

    const node = workflow[target.nodeId]
    if (!node || typeof node !== 'object' || Array.isArray(node)) continue
    const inputs = (node as Record<string, unknown>).inputs
    if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) continue
    ;(inputs as Record<string, unknown>)[target.input] = value
  }
  return workflow
}

let cachedDefaults: Partial<Record<ComfyWorkflowKind, Record<string, unknown>>> = {}

export function parseComfySettings(raw?: string | Record<string, unknown> | null): ComfySettings {
  if (!raw) return {}
  if (typeof raw === 'object') return raw as ComfySettings
  try {
    return JSON.parse(raw) as ComfySettings
  } catch {
    return {}
  }
}

export function loadBuiltinWorkflowApi(kind: ComfyWorkflowKind): Record<string, unknown> {
  if (cachedDefaults[kind]) {
    return structuredClone(cachedDefaults[kind]!)
  }
  const file = kind === 'image' ? 'image-default.api.json' : 'video-default.api.json'
  const parsed = JSON.parse(readFileSync(join(WORKFLOW_DIR, file), 'utf8')) as Record<string, unknown>
  cachedDefaults[kind] = parsed
  return structuredClone(parsed)
}

export function resolveWorkflowApi(config: AIConfig, kind: ComfyWorkflowKind): Record<string, unknown> {
  const settings = parseComfySettings(config.settings ?? null)
  const custom = settings.workflowApi
  if (custom && typeof custom === 'object' && Object.keys(custom).length > 0) {
    return structuredClone(custom)
  }
  return loadBuiltinWorkflowApi(kind)
}

export function comfyAuthHeaders(config: AIConfig, withJson = false): Record<string, string> {
  const headers: Record<string, string> = {}
  if (withJson) headers['Content-Type'] = 'application/json'
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`
  return headers
}

export function parseSize(size?: string | null): { width: number; height: number } {
  const raw = (size || '1024x1024').toLowerCase()
  const m = raw.match(/(\d+)\s*[x×]\s*(\d+)/)
  if (m) {
    return { width: Number(m[1]), height: Number(m[2]) }
  }
  return { width: 1024, height: 1024 }
}

export function parseUrlList(raw?: string | null): string[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((u) => typeof u === 'string' && u.trim()) : []
  } catch {
    return typeof raw === 'string' && raw.trim() ? [raw.trim()] : []
  }
}

/** 将占位符替换进 API workflow；整段匹配的 WIDTH/HEIGHT/SEED/DURATION 会转为 number */
export function injectPlaceholders(
  workflow: Record<string, unknown>,
  values: ComfyPlaceholderValues,
): Record<string, unknown> {
  const map: Record<string, string | number> = {
    PROMPT: values.prompt ?? '',
    NEGATIVE_PROMPT: values.negativePrompt ?? '',
    WIDTH: values.width ?? 1024,
    HEIGHT: values.height ?? 1024,
    SEED: values.seed ?? Math.floor(Math.random() * 2 ** 32),
    DURATION: values.duration ?? 5,
    ASPECT_RATIO: values.aspectRatio ?? '16:9',
  }
  const images = values.images || []
  images.forEach((name, i) => {
    map[`IMAGE_${i + 1}`] = name
  })

  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') {
      const full = node.match(/^\{\{([A-Z0-9_]+)\}\}$/)
      if (full) {
        const key = full[1]
        if (key in map) return map[key]
        if (key.startsWith('IMAGE_')) return map[key] ?? ''
        return node
      }
      let out = node
      for (const key of PLACEHOLDER_KEYS) {
        out = out.split(`{{${key}}}`).join(String(map[key]))
      }
      out = out.replace(/\{\{IMAGE_(\d+)\}\}/g, (_, n) => String(map[`IMAGE_${n}`] ?? ''))
      return out
    }
    if (Array.isArray(node)) return node.map(walk)
    if (node && typeof node === 'object') {
      const obj: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        obj[k] = walk(v)
      }
      return obj
    }
    return node
  }

  return walk(workflow) as Record<string, unknown>
}

async function fetchMediaBytes(source: string): Promise<{ bytes: Buffer; filename: string; contentType: string }> {
  if (source.startsWith('data:')) {
    const m = source.match(/^data:([^;]+);base64,(.+)$/)
    if (!m) throw new Error('Invalid data URL for ComfyUI upload')
    const contentType = m[1]
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
    return {
      bytes: Buffer.from(m[2], 'base64'),
      filename: `huobao-ref-${Date.now()}.${ext}`,
      contentType,
    }
  }

  const resp = await fetch(source, { signal: AbortSignal.timeout(120_000) })
  if (!resp.ok) throw new Error(`Failed to fetch reference media: ${resp.status}`)
  const contentType = resp.headers.get('content-type') || 'application/octet-stream'
  const buf = Buffer.from(await resp.arrayBuffer())
  const urlPath = (() => {
    try {
      return new URL(source).pathname
    } catch {
      return ''
    }
  })()
  const base = urlPath.split('/').pop() || `huobao-ref-${Date.now()}.bin`
  return { bytes: buf, filename: base.split('?')[0] || base, contentType }
}

/** 上传单张参考图到 ComfyUI，返回 input 目录下的文件名 */
export async function uploadComfyImage(config: AIConfig, source: string): Promise<string> {
  const { bytes, filename, contentType } = await fetchMediaBytes(source)
  const form = new FormData()
  form.append('image', new Blob([new Uint8Array(bytes)], { type: contentType }), filename)
  form.append('overwrite', 'true')

  const url = joinProviderUrl(config.baseUrl, '', '/upload/image')
  const headers = comfyAuthHeaders(config)
  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: form,
    signal: AbortSignal.timeout(120_000),
  })
  if (!resp.ok) {
    throw new Error(`ComfyUI upload failed ${resp.status}: ${await resp.text()}`)
  }
  const json = await resp.json() as any
  const name = json.name || json.filename || filename
  return String(name)
}

export async function uploadReferenceImages(config: AIConfig, sources: string[]): Promise<string[]> {
  const names: string[] = []
  for (const src of sources) {
    if (!src?.trim()) continue
    names.push(await uploadComfyImage(config, src.trim()))
  }
  return names
}

export async function buildComfyPromptRequest(
  config: AIConfig,
  kind: ComfyWorkflowKind,
  values: ComfyPlaceholderValues,
  referenceSources: string[] = [],
): Promise<ProviderRequest> {
  const uploaded = referenceSources.length
    ? await uploadReferenceImages(config, referenceSources)
    : (values.images || [])

  const workflow = resolveWorkflowApi(config, kind)
  const settings = parseComfySettings(config.settings ?? null)
  // 先占位符兜底，再 bindings 覆盖（UI 映射优先）
  let prompt = injectPlaceholders(workflow, { ...values, images: uploaded })
  prompt = applyBindings(prompt, settings.bindings, { ...values, images: uploaded })

  return {
    url: joinProviderUrl(config.baseUrl, '', '/prompt'),
    method: 'POST',
    headers: comfyAuthHeaders(config, true),
    body: {
      prompt,
      client_id: randomUUID(),
    },
  }
}

export function buildComfyHistoryRequest(config: AIConfig, promptId: string): ProviderRequest {
  return {
    url: joinProviderUrl(config.baseUrl, '', `/history/${encodeURIComponent(promptId)}`),
    method: 'GET',
    headers: comfyAuthHeaders(config),
    body: undefined,
  }
}

export function buildComfyQueueRequest(config: AIConfig): ProviderRequest {
  return {
    url: joinProviderUrl(config.baseUrl, '', '/queue'),
    method: 'GET',
    headers: comfyAuthHeaders(config),
    body: undefined,
  }
}

/** 打断 Comfy 当前正在执行的 prompt（全局 interrupt，非按 id） */
export function buildComfyInterruptRequest(config: AIConfig): ProviderRequest {
  return {
    url: joinProviderUrl(config.baseUrl, '', '/interrupt'),
    method: 'POST',
    headers: comfyAuthHeaders(config, true),
    body: {},
  }
}

/** 从 queue_pending / queue_running 中按 prompt_id 删除 */
export function buildComfyQueueDeleteRequest(config: AIConfig, promptId: string): ProviderRequest {
  return {
    url: joinProviderUrl(config.baseUrl, '', '/queue'),
    method: 'POST',
    headers: comfyAuthHeaders(config, true),
    body: { delete: [String(promptId)] },
  }
}

/** 尽力中断：先 interrupt，再按 prompt_id 出队；任一失败不抛给调用方 */
export async function cancelComfyRemoteTask(config: AIConfig, promptId: string): Promise<void> {
  const interrupt = buildComfyInterruptRequest(config)
  try {
    await fetch(interrupt.url, {
      method: interrupt.method,
      headers: interrupt.headers,
      body: JSON.stringify(interrupt.body ?? {}),
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    // best-effort
  }

  const del = buildComfyQueueDeleteRequest(config, promptId)
  try {
    await fetch(del.url, {
      method: del.method,
      headers: del.headers,
      body: JSON.stringify(del.body),
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    // best-effort
  }
}

/** Comfy queue 项通常为 [number, prompt_id, ...] */
function collectPromptIdsFromQueueBucket(bucket: unknown): Set<string> {
  const ids = new Set<string>()
  if (!Array.isArray(bucket)) return ids
  for (const item of bucket) {
    if (Array.isArray(item) && item.length >= 2 && item[1] != null) {
      ids.add(String(item[1]))
    } else if (item && typeof item === 'object' && (item as any).prompt_id != null) {
      ids.add(String((item as any).prompt_id))
    }
  }
  return ids
}

export function isPromptInComfyQueuePayload(queue: any, promptId: string): boolean {
  if (!queue || typeof queue !== 'object') return false
  const want = String(promptId)
  const running = collectPromptIdsFromQueueBucket(queue.queue_running)
  const pending = collectPromptIdsFromQueueBucket(queue.queue_pending)
  return running.has(want) || pending.has(want)
}

/** history 为空时查 /queue：不在队列则视为已取消/丢失（需连续确认，见 poll 层） */
export async function isComfyPromptQueued(config: AIConfig, promptId: string): Promise<boolean> {
  const req = buildComfyQueueRequest(config)
  const resp = await fetch(req.url, {
    method: req.method,
    headers: req.headers,
    signal: AbortSignal.timeout(30_000),
  })
  if (!resp.ok) {
    // 队列接口失败时不误判取消，让上层继续等
    return true
  }
  const json = await resp.json() as any
  return isPromptInComfyQueuePayload(json, promptId)
}

export function isEmptyComfyHistory(result: any): boolean {
  return !!result && typeof result === 'object' && !Array.isArray(result) && Object.keys(result).length === 0
}

export function buildComfyViewUrl(
  baseUrl: string,
  file: { filename: string; subfolder?: string; type?: string },
): string {
  const params = new URLSearchParams({
    filename: file.filename,
    subfolder: file.subfolder || '',
    type: file.type || 'output',
  })
  return `${joinProviderUrl(baseUrl, '', '/view')}?${params.toString()}`
}

interface ComfyMediaFile {
  filename: string
  subfolder?: string
  type?: string
}

const VIDEO_EXT_RE = /\.(mp4|webm|mov|mkv|avi|m4v)$/i

function filesFromField(nodeOut: any, field: string): ComfyMediaFile[] {
  const list = nodeOut?.[field]
  if (Array.isArray(list)) return list.filter((x: any) => x?.filename)
  if (list?.filename) return [list]
  return []
}

function isVideoFile(file: ComfyMediaFile | null | undefined): boolean {
  return !!file?.filename && VIDEO_EXT_RE.test(file.filename)
}

/** 按偏好从单节点输出取媒体；指定通道为空时回退 auto */
function pickFromNodeOutput(nodeOut: any, field: string | undefined, preferVideo: boolean): ComfyMediaFile | null {
  if (!nodeOut || typeof nodeOut !== 'object') return null
  const f = (field || 'auto').toLowerCase()
  if (f !== 'auto') {
    const direct = filesFromField(nodeOut, f)[0] || null
    if (direct) return direct
    // RunningHub / 部分节点把 mp4 放在 images 通道，绑 videos 会落空 → 回退
  }
  const images = filesFromField(nodeOut, 'images')
  const gifs = filesFromField(nodeOut, 'gifs')
  const videos = [
    ...filesFromField(nodeOut, 'videos'),
    ...filesFromField(nodeOut, 'video'),
  ]
  if (preferVideo) {
    return videos[0] || gifs[0] || images.find(isVideoFile) || images[0] || null
  }
  return images.find((f) => !isVideoFile(f)) || images[0] || gifs[0] || videos[0] || null
}

function collectOutputFiles(
  outputs: Record<string, any> | undefined,
  preferVideo: boolean,
  outputBinding?: ComfyBindingTarget | null,
): ComfyMediaFile | null {
  if (!outputs || typeof outputs !== 'object') return null

  // UI 指定了输出节点：优先该节点；通道落空或节点缺失时再全图扫描
  if (outputBinding?.nodeId) {
    const nodeOut = outputs[outputBinding.nodeId]
    if (nodeOut) {
      const picked = pickFromNodeOutput(nodeOut, outputBinding.input, preferVideo)
      if (picked) return picked
    }
  }

  const images: ComfyMediaFile[] = []
  const videos: ComfyMediaFile[] = []

  for (const nodeOut of Object.values(outputs)) {
    if (!nodeOut || typeof nodeOut !== 'object') continue
    images.push(...filesFromField(nodeOut, 'images'))
    videos.push(
      ...filesFromField(nodeOut, 'gifs'),
      ...filesFromField(nodeOut, 'videos'),
      ...filesFromField(nodeOut, 'video'),
    )
  }

  if (preferVideo) {
    return videos[0] || images.find(isVideoFile) || images[0] || null
  }
  return images.find((f) => !isVideoFile(f)) || images[0] || videos[0] || null
}

/** RunningHub 等代理常只给 status_str=success，没有 completed:true */
function isHistoryFinished(statusObj: any): boolean {
  if (!statusObj || typeof statusObj !== 'object') return false
  if (statusObj.completed === true) return true
  const s = String(statusObj.status_str || '').toLowerCase()
  return s === 'success' || s === 'completed'
}

function isHistoryCancelledOrError(statusObj: any): { failed: true; error: string } | null {
  if (!statusObj || typeof statusObj !== 'object') return null
  const s = String(statusObj.status_str || '').toLowerCase()
  if (s === 'error' || s === 'interrupted' || s === 'cancelled' || s === 'canceled') {
    const errMsg = statusObj?.messages?.find?.((m: any) => Array.isArray(m) && (m[0] === 'execution_error' || m[0] === 'execution_interrupted'))
    const detail = errMsg?.[1]?.exception_message
      || (s === 'interrupted' || s === 'cancelled' || s === 'canceled'
        ? 'ComfyUI 任务已取消或中断'
        : statusObj.status_str)
    return { failed: true, error: String(detail || 'ComfyUI execution failed') }
  }
  return null
}

export function parseComfyHistory(
  result: any,
  promptId: string,
  config: AIConfig,
  preferVideo: boolean,
): { status: 'pending' | 'processing' | 'completed' | 'failed'; mediaUrl?: string; error?: string } {
  if (!result || typeof result !== 'object') {
    return { status: 'processing' }
  }

  // /history/{id} 可能返回 { [promptId]: entry } 或直接是 entry；兼容数字/字符串 key
  const entry = result[promptId]
    || result[String(promptId)]
    || (typeof promptId === 'string' && /^\d+$/.test(promptId) ? result[Number(promptId)] : null)
    || (result.outputs ? result : null)
  if (!entry) {
    // 空对象 = 尚未入 history（也可能是已取消）；取消判定见 poll 层 + /queue
    if (Object.keys(result).length === 0) return { status: 'processing' }
    return { status: 'processing' }
  }

  const statusObj = entry.status
  const cancelled = isHistoryCancelledOrError(statusObj)
  if (cancelled) return { status: 'failed', error: cancelled.error }

  if (statusObj?.completed === false && Array.isArray(statusObj?.messages)) {
    const errMsg = statusObj?.messages?.find?.((m: any) => Array.isArray(m) && m[0] === 'execution_error')
    if (errMsg) {
      return {
        status: 'failed',
        error: String(errMsg?.[1]?.exception_message || 'ComfyUI execution failed'),
      }
    }
  }

  const settings = parseComfySettings(config.settings ?? null)
  const outputBinding = settings.bindings?.output || null
  const file = collectOutputFiles(entry.outputs, preferVideo, outputBinding)
  if (file?.filename) {
    return {
      status: 'completed',
      mediaUrl: buildComfyViewUrl(config.baseUrl, file),
    }
  }

  const finished = isHistoryFinished(statusObj)

  // 指定了输出节点但 history 里还没有该节点输出 → 继续等
  if (outputBinding?.nodeId && entry.outputs && !(outputBinding.nodeId in entry.outputs) && !finished) {
    return { status: 'processing' }
  }

  if (finished) {
    const hint = outputBinding?.nodeId
      ? `（已绑定输出节点 ${outputBinding.nodeId}/${outputBinding.input || 'auto'}，但未找到媒体）`
      : ''
    return { status: 'failed', error: `ComfyUI completed without output media${hint}` }
  }

  return { status: 'processing' }
}

export function parseComfyPromptResponse(result: any): { isAsync: true; taskId: string } {
  const promptId = result?.prompt_id || result?.promptId
  if (!promptId) throw new Error('No prompt_id in ComfyUI response')
  return { isAsync: true, taskId: String(promptId) }
}
