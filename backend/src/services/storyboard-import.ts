/**
 * 分镜文件导入服务 — parse（Agent 识别候选）+ confirm（用户勾选后写库）
 */
import { eq } from 'drizzle-orm'
import { mastra } from '../mastra/index.js'
import { buildAgentRequestContext } from '../agents/context.js'
import type { ResolvedSkillSelection } from '../agents/skills.js'
import type { StoryboardImportCandidate } from '../agents/tools/storyboard-import-tools.js'
import { db, getInsertId, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { normalizeShotStyle } from './shot-style.js'
import { formatStoryboardDescription } from '../utils/storyboard-description.js'

export async function parseStoryboardImport(
  episodeId: number,
  dramaId: number,
  content: string,
  opts: { filename?: string; model?: string; configId?: number; skillSelection?: ResolvedSkillSelection | null } = {},
): Promise<StoryboardImportCandidate[]> {
  const text = (content || '').trim()
  if (!text) throw new Error('文件内容为空')

  const buffer: StoryboardImportCandidate[] = []
  const agent = mastra.getAgent('storyboard_importer')
  if (!agent) throw new Error('分镜导入 Agent 不可用')

  logTaskStart('StoryboardImport', 'parse', {
    episodeId,
    dramaId,
    filename: opts.filename,
    chars: text.length,
  })

  const requestContext = buildAgentRequestContext({
    dramaId,
    episodeId,
    modelOverride: opts.model,
    textConfigId: opts.configId,
    storyboardImportBuffer: buffer,
    skillSelection: opts.skillSelection || undefined,
  })

  const userMessage = [
    '请解析以下运镜设计 / 分镜文件，识别全部镜头候选，并调用 submit_storyboard_candidates 提交。',
    opts.filename ? `文件名：${opts.filename}` : '',
    '',
    '----- FILE START -----',
    text,
    '----- FILE END -----',
  ].filter(Boolean).join('\n')

  try {
    const result: any = await agent.generate([{ role: 'user', content: userMessage }], {
      maxSteps: 12,
      requestContext,
      onStepFinish: (step: any) => {
        const tools = (step?.toolCalls || [])
          .map((t: any) => t?.toolName || t?.payload?.toolName)
          .filter(Boolean)
        logTaskProgress('StoryboardImport', 'parse-step', {
          episodeId,
          tools: tools.length ? tools.join(',') : undefined,
          text: (step?.text || '').slice(0, 160) || undefined,
        })
      },
    })
    logTaskSuccess('StoryboardImport', 'parse', {
      episodeId,
      count: buffer.length,
      steps: result?.steps?.length,
    })
  } catch (err: any) {
    logTaskError('StoryboardImport', 'parse', { episodeId, error: err?.message })
    throw err
  }

  if (!buffer.length) {
    throw new Error('未能识别出可导入的分镜，请检查文件格式后重试')
  }
  return buffer.map((c, i) => ({
    ...c,
    key: c.key || `shot_${i + 1}`,
    confidence: c.confidence || 'medium',
  }))
}

export interface ConfirmStoryboardImportItem {
  key?: string
  title?: string
  description?: string
  video_prompt?: string
  duration?: number
  atmosphere?: string
  shot_style?: string
  selected?: boolean
}

export type StoryboardImportMode = 'replace' | 'append'

async function clearEpisodeStoryboards(episodeId: number) {
  const rows = await db.select({ id: schema.storyboards.id })
    .from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
  for (const row of rows) {
    await db.delete(schema.storyboardCharacters).where(eq(schema.storyboardCharacters.storyboardId, row.id))
    await db.delete(schema.storyboardProps).where(eq(schema.storyboardProps.storyboardId, row.id))
    await db.delete(schema.sysTask).where(eq(schema.sysTask.storyboardId, row.id))
  }
  await db.delete(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId))
}

function normalizeDuration(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return 10
  return Math.min(60, Math.max(1, Math.round(n)))
}

export async function confirmStoryboardImport(
  episodeId: number,
  items: ConfirmStoryboardImportItem[],
  mode: StoryboardImportMode,
) {
  const selected = items.filter(i => i && i.selected !== false && (i.description?.trim() || i.video_prompt?.trim() || i.title?.trim()))
  if (!selected.length) throw new Error('请至少选择一项导入')
  if (mode !== 'replace' && mode !== 'append') throw new Error('mode 必须是 replace 或 append')

  const ts = now()
  logTaskStart('StoryboardImport', 'confirm', {
    episodeId,
    mode,
    count: selected.length,
  })

  if (mode === 'replace') {
    await clearEpisodeStoryboards(episodeId)
  }

  const existing = await db.select({ storyboardNumber: schema.storyboards.storyboardNumber })
    .from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
  let nextNumber = mode === 'append'
    ? existing.reduce((m, row) => Math.max(m, row.storyboardNumber || 0), 0) + 1
    : 1

  const createdIds: number[] = []
  let totalSeconds = 0

  for (const item of selected) {
    const duration = normalizeDuration(item.duration)
    const description = formatStoryboardDescription(
      (item.description || '').trim() || (item.title || '').trim() || '（导入分镜）',
    )
    const res = await db.insert(schema.storyboards).values({
      episodeId,
      storyboardNumber: nextNumber,
      title: (item.title || item.key || '').trim() || null,
      description,
      videoPrompt: (item.video_prompt || '').trim() || null,
      atmosphere: (item.atmosphere || '').trim() || null,
      shotStyle: normalizeShotStyle(item.shot_style),
      duration,
      createdAt: ts,
      updatedAt: ts,
    })
    createdIds.push(getInsertId(res))
    totalSeconds += duration
    nextNumber += 1
  }

  // 刷新整集时长（含 append 时原有镜头）
  const allRows = await db.select({ duration: schema.storyboards.duration })
    .from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
  const episodeSeconds = allRows.reduce((sum, row) => sum + (row.duration || 10), 0)
  await db.update(schema.episodes)
    .set({ duration: Math.ceil(episodeSeconds / 60), updatedAt: ts })
    .where(eq(schema.episodes.id, episodeId))

  logTaskSuccess('StoryboardImport', 'confirm', {
    episodeId,
    mode,
    created: createdIds.length,
    totalSeconds,
  })

  return {
    created: createdIds.length,
    ids: createdIds,
    mode,
  }
}
