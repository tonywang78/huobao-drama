/**
 * 资产文件导入服务 — parse（Agent 识别候选）+ confirm（用户勾选后入库）
 */
import { eq } from 'drizzle-orm'
import { mastra } from '../mastra/index.js'
import { buildAgentRequestContext } from '../agents/context.js'
import type { ImportCandidate } from '../agents/tools/import-tools.js'
import { db, getInsertId, schema } from '../db/index.js'
import { linkCharToEpisode, linkPropToEpisode, linkSceneToEpisode } from '../utils/episode-assets.js'
import { now } from '../utils/response.js'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

function normalizeName(name: string): string {
  return (name || '')
    .replace(/[（(][^（()）]*[）)]/g, '')
    .replace(/[（(].*$/, '')
    .replace(/[\s　]+/g, '')
    .toLowerCase()
    .trim()
}

function normalizeLocation(loc: string): string {
  return (loc || '').replace(/[\s　]+/g, '').toLowerCase().trim()
}

export async function parseAssetImport(
  dramaId: number,
  content: string,
  opts: { filename?: string; model?: string; configId?: number; episodeId?: number } = {},
): Promise<ImportCandidate[]> {
  const text = (content || '').trim()
  if (!text) throw new Error('文件内容为空')

  const buffer: ImportCandidate[] = []
  const agent = mastra.getAgent('asset_importer')
  if (!agent) throw new Error('资产导入 Agent 不可用')

  logTaskStart('AssetImport', 'parse', {
    dramaId,
    episodeId: opts.episodeId,
    filename: opts.filename,
    chars: text.length,
  })

  const requestContext = buildAgentRequestContext({
    dramaId,
    episodeId: opts.episodeId || 0,
    modelOverride: opts.model,
    textConfigId: opts.configId,
    importCandidateBuffer: buffer,
  })

  const userMessage = [
    '请解析以下资产清单文件，识别全部角色/场景/道具候选，并调用 submit_import_candidates 提交。',
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
        logTaskProgress('AssetImport', 'parse-step', {
          dramaId,
          tools: tools.length ? tools.join(',') : undefined,
          text: (step?.text || '').slice(0, 160) || undefined,
        })
      },
    })
    logTaskSuccess('AssetImport', 'parse', {
      dramaId,
      count: buffer.length,
      steps: result?.steps?.length,
    })
  } catch (err: any) {
    logTaskError('AssetImport', 'parse', { dramaId, error: err?.message })
    throw err
  }

  if (!buffer.length) {
    throw new Error('未能识别出可导入的资产，请检查文件格式后重试')
  }
  return buffer.map((c, i) => ({
    ...c,
    key: c.key || `item_${i + 1}`,
    confidence: c.confidence || 'medium',
  }))
}

export interface ConfirmImportItem {
  type: 'character' | 'scene' | 'prop'
  name: string
  summary?: string
  final_prompt?: string
  role?: string
  styling?: string
  location?: string
  time?: string
  lighting?: string
  prop_type?: string
  selected?: boolean
}

export async function confirmAssetImport(
  dramaId: number,
  items: ConfirmImportItem[],
  opts: { episodeId?: number } = {},
) {
  const selected = items.filter(i => i && i.name?.trim() && i.selected !== false)
  if (!selected.length) throw new Error('请至少选择一项导入')

  const ts = now()
  const episodeId = opts.episodeId || 0
  const summary = { created: 0, updated: 0, linked: 0, characters: 0, scenes: 0, props: 0 }

  logTaskStart('AssetImport', 'confirm', { dramaId, episodeId, count: selected.length })

  for (const item of selected) {
    const type = item.type
    const summaryText = (item.summary || '').trim()
    const finalPrompt = (item.final_prompt || '').trim() || null

    if (type === 'character') {
      const name = item.name.trim()
      const chars = (await db.select().from(schema.characters).where(eq(schema.characters.dramaId, dramaId)))
        .filter(c => !c.deletedAt)
      const norm = normalizeName(name)
      const existing = chars.find(c => c.name === name)
        || (norm ? chars.find(c => normalizeName(c.name) === norm) : undefined)

      let charId: number
      if (existing) {
        await db.update(schema.characters).set({
          role: item.role || existing.role,
          appearance: summaryText || existing.appearance,
          styling: item.styling || existing.styling,
          finalPrompt: finalPrompt || existing.finalPrompt,
          updatedAt: ts,
        }).where(eq(schema.characters.id, existing.id))
        charId = existing.id
        summary.updated++
      } else {
        const res = await db.insert(schema.characters).values({
          dramaId,
          name,
          role: item.role || '',
          appearance: summaryText,
          styling: item.styling || '',
          finalPrompt,
          createdAt: ts,
          updatedAt: ts,
        })
        charId = getInsertId(res)
        summary.created++
      }
      if (episodeId) {
        await linkCharToEpisode(episodeId, charId)
        summary.linked++
      }
      summary.characters++
    } else if (type === 'scene') {
      const location = (item.location || item.name || '').trim()
      const time = (item.time || '').trim()
      if (!location) continue
      const scenes = (await db.select().from(schema.scenes).where(eq(schema.scenes.dramaId, dramaId)))
        .filter(s => !s.deletedAt)
      const normLoc = normalizeLocation(location)
      const existing = scenes.find(s => s.location === location && (s.time || '') === time)
        || (normLoc ? scenes.find(s => normalizeLocation(s.location) === normLoc && (s.time || '') === time) : undefined)

      let sceneId: number
      if (existing) {
        await db.update(schema.scenes).set({
          prompt: summaryText || existing.prompt,
          lighting: item.lighting || existing.lighting,
          finalPrompt: finalPrompt || existing.finalPrompt,
          updatedAt: ts,
        }).where(eq(schema.scenes.id, existing.id))
        sceneId = existing.id
        summary.updated++
      } else {
        const res = await db.insert(schema.scenes).values({
          dramaId,
          episodeId: episodeId || null,
          location,
          time,
          prompt: summaryText || location,
          lighting: item.lighting || '',
          finalPrompt,
          createdAt: ts,
          updatedAt: ts,
        })
        sceneId = getInsertId(res)
        summary.created++
      }
      if (episodeId) {
        await linkSceneToEpisode(episodeId, sceneId)
        summary.linked++
      }
      summary.scenes++
    } else if (type === 'prop') {
      const name = item.name.trim()
      const props = (await db.select().from(schema.props).where(eq(schema.props.dramaId, dramaId)))
        .filter(p => !p.deletedAt)
      const norm = normalizeName(name)
      const existing = props.find(p => p.name === name)
        || (norm ? props.find(p => normalizeName(p.name) === norm) : undefined)

      let propId: number
      if (existing) {
        await db.update(schema.props).set({
          type: item.prop_type || existing.type,
          description: summaryText || existing.description,
          finalPrompt: finalPrompt || existing.finalPrompt,
          updatedAt: ts,
        }).where(eq(schema.props.id, existing.id))
        propId = existing.id
        summary.updated++
      } else {
        const res = await db.insert(schema.props).values({
          dramaId,
          name,
          type: item.prop_type || '',
          description: summaryText,
          finalPrompt,
          createdAt: ts,
          updatedAt: ts,
        })
        propId = getInsertId(res)
        summary.created++
      }
      if (episodeId) {
        await linkPropToEpisode(episodeId, propId)
        summary.linked++
      }
      summary.props++
    }
  }

  logTaskSuccess('AssetImport', 'confirm', { dramaId, episodeId, ...summary })
  return summary
}
