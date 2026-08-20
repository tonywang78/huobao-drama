/**
 * 一次性：把已在 Comfy/RunningHub 完成、但应用仍 processing 的任务回写完成。
 * 用法: npx tsx scripts/recover-comfy-task.ts [taskId]
 */
import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { db, schema, pool } from '../src/db/index.js'
import { downloadFile } from '../src/utils/storage.js'
import { extractVideoPoster } from '../src/utils/video-poster.js'
import {
  buildComfyHistoryRequest,
  parseComfyHistory,
  parseComfySettings,
} from '../src/services/adapters/comfyui-common.js'
import { getActiveConfig } from '../src/services/ai.js'

function now() {
  return new Date().toISOString()
}

async function main() {
  const id = Number(process.argv[2] || 11)
  const [record] = await db.select().from(schema.sysTask).where(eq(schema.sysTask.id, id))
  if (!record) throw new Error(`sys_task ${id} not found`)
  if (!record.taskId) throw new Error(`sys_task ${id} has no upstream taskId`)

  console.log('task', {
    id: record.id,
    type: record.type,
    status: record.status,
    taskId: record.taskId,
    storyboardId: record.storyboardId,
    provider: record.provider,
  })

  const config = await getActiveConfig(record.type === 'image' ? 'image' : 'video')
  if (!config || config.provider !== 'comfyui') {
    throw new Error(`需要启用中的 comfyui ${record.type} 配置，当前: ${config?.provider || 'none'}`)
  }

  // 尽量带上该配置的 settings（bindings）
  const [cfgRow] = await db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.provider, 'comfyui'))
  const fullConfig = {
    ...config,
    settings: cfgRow?.settings || config.settings || null,
  }

  const req = buildComfyHistoryRequest(fullConfig, String(record.taskId))
  const resp = await fetch(req.url, { method: req.method, headers: req.headers })
  if (!resp.ok) throw new Error(`history HTTP ${resp.status}: ${await resp.text()}`)
  const history = await resp.json()

  const preferVideo = record.type === 'video'
  const parsed = parseComfyHistory(history, String(record.taskId), fullConfig, preferVideo)
  console.log('parsed', parsed)
  if (parsed.status !== 'completed' || !parsed.mediaUrl) {
    throw new Error(`无法从 history 取到媒体: ${JSON.stringify(parsed)}`)
  }

  const localPath = await downloadFile(parsed.mediaUrl, preferVideo ? 'videos' : 'images')
  if (preferVideo) await extractVideoPoster(localPath)

  await db.update(schema.sysTask).set({
    resultUrl: parsed.mediaUrl,
    localPath,
    status: 'completed',
    errorMsg: null,
    completedAt: now(),
    updatedAt: now(),
  }).where(eq(schema.sysTask.id, record.id))

  if (preferVideo && record.storyboardId) {
    const params = (() => {
      try { return JSON.parse(record.params || '{}') } catch { return {} }
    })()
    await db.update(schema.storyboards).set({
      videoUrl: localPath,
      duration: params.duration || undefined,
      updatedAt: now(),
    }).where(eq(schema.storyboards.id, record.storyboardId))
  }

  console.log('OK', { localPath, storyboardId: record.storyboardId })
  await pool.end()
}

main().catch(async (e) => {
  console.error(e)
  try { await pool.end() } catch {}
  process.exit(1)
})
