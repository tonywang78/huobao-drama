/**
 * 工作室助手：线程、上下文快照、历史转模型消息、工序确认执行
 */
import { and, desc, eq, isNull, or } from 'drizzle-orm'
import { db, getInsertId, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { toSnakeCase } from '../utils/transform.js'
import { mastra } from '../mastra/index.js'
import { buildAgentRequestContext, type AssistantUiContext } from '../agents/context.js'
import { startVideoPromptBatch } from './video-prompts.js'
import { getDramaStylePrompt } from './style-preset.js'
import { generateImageEdit } from './generation.js'
import { logTaskProgress } from '../utils/task-logger.js'

const IMAGE_EDIT_HINT = /去掉|删除|移除|改|换|修|调整|美化|加|减|remove|edit|change|fix|crop|blur|enhance|放大|缩小|背景|人物|人|图生图|改图/i

export const HISTORY_LIMIT = 40
const EXCERPT = 2000

export type AssistantRefCategory = 'asset' | 'catalog' | 'project' | 'generated'

export type AssistantRef = {
  category?: AssistantRefCategory
  type: string
  id?: number | null
  key?: string
  name?: string
  token?: string
  image_url?: string
}

export type MentionOption = {
  token: string
  label: string
  group: string
  category: AssistantRefCategory
  type: string
  id?: number | null
  key?: string
  image_url?: string | null
  badge?: string
}

export type AssistantMessageContent = {
  text?: string
  refs?: AssistantRef[]
  attachments?: Array<{ url: string; name?: string }>
  toolCalls?: Array<{ toolName: string; args?: unknown; result?: unknown }>
  artifacts?: Array<{ type: string; taskId?: number; url?: string; status?: string }>
  proposal?: { action: string; warning?: string; reason?: string }
}

const STAGE_LABEL: Record<string, string> = {
  raw: '原始内容',
  rewrite: 'AI 改写',
  assets: '资产',
  storyboard: '分镜拆分',
  videos: '视频生成',
  export: '导出',
  drama: '剧详情',
  home: '项目列表',
  settings: '设置',
}

export function parseMessageContent(raw: string | null | undefined): AssistantMessageContent {
  if (!raw) return { text: '' }
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as AssistantMessageContent
  } catch { /* 旧数据可能是纯文本 */ }
  return { text: raw }
}

export async function getOrCreateThread(opts: { dramaId?: number | null; episodeId?: number | null }) {
  const dramaId = opts.dramaId && opts.dramaId > 0 ? opts.dramaId : null
  const episodeId = opts.episodeId && opts.episodeId > 0 ? opts.episodeId : null
  const ts = now()

  if (episodeId) {
    const [existing] = await db.select().from(schema.assistantThreads)
      .where(eq(schema.assistantThreads.episodeId, episodeId))
      .orderBy(desc(schema.assistantThreads.id))
      .limit(1)
    if (existing) return existing
    const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId))
    const title = ep ? `第 ${ep.episodeNumber} 集` : '本集对话'
    const res = await db.insert(schema.assistantThreads).values({
      dramaId: dramaId || ep?.dramaId || null,
      episodeId,
      title,
      createdAt: ts,
      updatedAt: ts,
    })
    const [row] = await db.select().from(schema.assistantThreads).where(eq(schema.assistantThreads.id, getInsertId(res)))
    return row
  }

  if (dramaId) {
    const rows = await db.select().from(schema.assistantThreads)
      .where(and(eq(schema.assistantThreads.dramaId, dramaId), isNull(schema.assistantThreads.episodeId)))
      .orderBy(desc(schema.assistantThreads.id))
      .limit(1)
    if (rows[0]) return rows[0]
    const [drama] = await db.select().from(schema.dramas).where(eq(schema.dramas.id, dramaId))
    const res = await db.insert(schema.assistantThreads).values({
      dramaId,
      episodeId: null,
      title: drama?.title || '项目对话',
      createdAt: ts,
      updatedAt: ts,
    })
    const [row] = await db.select().from(schema.assistantThreads).where(eq(schema.assistantThreads.id, getInsertId(res)))
    return row
  }

  const globals = await db.select().from(schema.assistantThreads)
    .where(and(isNull(schema.assistantThreads.dramaId), isNull(schema.assistantThreads.episodeId)))
    .orderBy(desc(schema.assistantThreads.id))
    .limit(1)
  if (globals[0]) return globals[0]
  const res = await db.insert(schema.assistantThreads).values({
    dramaId: null,
    episodeId: null,
    title: '通用对话',
    createdAt: ts,
    updatedAt: ts,
  })
  const [row] = await db.select().from(schema.assistantThreads).where(eq(schema.assistantThreads.id, getInsertId(res)))
  return row
}

export async function listThreadMessages(threadId: number, limit = 200) {
  const rows = await db.select().from(schema.assistantMessages)
    .where(eq(schema.assistantMessages.threadId, threadId))
    .orderBy(schema.assistantMessages.id)
  const sliced = rows.length > limit ? rows.slice(rows.length - limit) : rows
  return sliced.map(m => ({
    id: m.id,
    role: m.role,
    content: parseMessageContent(m.content),
    created_at: m.createdAt,
  }))
}

export async function clearThreadMessages(threadId: number) {
  await db.delete(schema.assistantMessages).where(eq(schema.assistantMessages.threadId, threadId))
  await db.update(schema.assistantThreads).set({ updatedAt: now() }).where(eq(schema.assistantThreads.id, threadId))
}

export async function appendMessage(threadId: number, role: string, content: AssistantMessageContent) {
  const ts = now()
  const res = await db.insert(schema.assistantMessages).values({
    threadId,
    role,
    content: JSON.stringify(content),
    createdAt: ts,
  })
  await db.update(schema.assistantThreads).set({ updatedAt: ts }).where(eq(schema.assistantThreads.id, threadId))
  return getInsertId(res)
}

export async function updateMessageContent(messageId: number, patch: Partial<AssistantMessageContent>) {
  const [row] = await db.select().from(schema.assistantMessages).where(eq(schema.assistantMessages.id, messageId))
  if (!row) return null
  const merged = { ...parseMessageContent(row.content), ...patch }
  await db.update(schema.assistantMessages)
    .set({ content: JSON.stringify(merged) })
    .where(eq(schema.assistantMessages.id, messageId))
  return merged
}

function excerpt(text: string | null | undefined, n = EXCERPT) {
  const s = (text || '').trim()
  if (!s) return ''
  if (s.length <= n) return s
  return `${s.slice(0, n)}\n…(已截断，共 ${s.length} 字，可用 read_episode_content 读取全文)`
}

export async function buildContextSnapshot(ui: AssistantUiContext | undefined, opts?: { compact?: boolean }) {
  const compact = !!opts?.compact
  const lines: string[] = ['【当前上下文】']
  const stage = ui?.stage || 'home'
  lines.push(`界面：${STAGE_LABEL[stage] || stage}`)

  const dramaId = ui?.drama_id && ui.drama_id > 0 ? ui.drama_id : null
  const episodeId = ui?.episode_id && ui.episode_id > 0 ? ui.episode_id : null

  if (dramaId) {
    const [drama] = await db.select().from(schema.dramas).where(eq(schema.dramas.id, dramaId))
    if (drama) {
      lines.push(`剧：${drama.title}${drama.style ? ` · 风格 ${drama.style}` : ''}`)
      if (drama.style) {
        const stylePrompt = await getDramaStylePrompt(dramaId)
        if (stylePrompt) {
          lines.push(`项目视觉风格（英文，生图/改图时可 @项目风格 或 @风格名 引用）：${excerpt(stylePrompt, 240)}`)
        }
      }
    }
  }
  if (episodeId) {
    const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId))
    if (ep) {
      lines.push(`集：第 ${ep.episodeNumber} 集 ${ep.title || ''}`.trim())
      if (compact) {
        lines.push('（多轮对话中省略剧本摘录；需要全文请调用 read_episode_content）')
      } else if (stage === 'raw') {
        const body = excerpt(ep.content)
        lines.push(body ? `原始内容摘录：\n${body}` : '原始内容：空')
      } else if (stage === 'rewrite' || stage === 'assets' || stage === 'storyboard' || stage === 'videos' || stage === 'export') {
        const body = excerpt(ep.scriptContent || ep.content)
        lines.push(body ? `剧本摘录：\n${body}` : '尚无改写剧本')
      }
      const [cl, sl, pl, sbs] = await Promise.all([
        db.select().from(schema.episodeCharacters).where(eq(schema.episodeCharacters.episodeId, episodeId)),
        db.select().from(schema.episodeScenes).where(eq(schema.episodeScenes.episodeId, episodeId)),
        db.select().from(schema.episodeProps).where(eq(schema.episodeProps.episodeId, episodeId)),
        db.select().from(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId)),
      ])
      lines.push(`本集资产：${cl.length} 角色 · ${sl.length} 场景 · ${pl.length} 道具 · ${sbs.filter(s => !s.deletedAt).length} 分镜`)
    }
  } else if (dramaId) {
    const eps = await db.select().from(schema.episodes)
      .where(and(eq(schema.episodes.dramaId, dramaId), isNull(schema.episodes.deletedAt)))
    lines.push(`共 ${eps.length} 集：${eps.map(e => `第${e.episodeNumber}集`).join('、') || '无'}`)
  } else {
    lines.push('未打开具体项目。生产工具不可用，可做一般咨询。')
  }

  const sel = ui?.selected_asset
  if (sel?.id && sel.type === 'character') {
    const [c] = await db.select().from(schema.characters).where(eq(schema.characters.id, sel.id))
    if (c) lines.push(`当前选中角色：${c.name} (id=${c.id})${c.imageUrl ? ' 有图' : ' 无图'}`)
  } else if (sel?.id && sel.type === 'scene') {
    const [s] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, sel.id))
    if (s) lines.push(`当前选中场景：${s.location} · ${s.time || ''} (id=${s.id})${s.imageUrl ? ' 有图' : ' 无图'}`)
  } else if (sel?.id && sel.type === 'prop') {
    const [p] = await db.select().from(schema.props).where(eq(schema.props.id, sel.id))
    if (p) lines.push(`当前选中道具：${p.name} (id=${p.id})${p.imageUrl ? ' 有图' : ' 无图'}`)
  }

  const sbId = ui?.selected_storyboard_id
  if (sbId) {
    const [sb] = await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, sbId))
    if (sb && !sb.deletedAt) {
      lines.push(`当前分镜 #${String(sb.storyboardNumber).padStart(2, '0')} id=${sb.id} ${sb.duration || 0}s`)
      if (sb.description) lines.push(`分镜描述：${excerpt(sb.description, 800)}`)
      if (sb.atmosphere) lines.push(`氛围：${sb.atmosphere}`)
      if (sb.videoPrompt) lines.push(`视频提示词：${excerpt(sb.videoPrompt, 600)}`)
    }
  }

  const snippetLines = await formatSnippetsForSnapshot(dramaId, compact ? 40 : 80)
  if (snippetLines.length) {
    lines.push('【常用提示词】（用户保存的快捷操作，可按名称理解意图）')
    lines.push(...snippetLines)
  }

  return lines.join('\n')
}

export function serializeSnippet(row: typeof schema.assistantSnippets.$inferSelect) {
  return toSnakeCase(row)
}

export async function listSnippets(dramaId?: number | null) {
  const did = dramaId && dramaId > 0 ? dramaId : null
  const rows = did
    ? await db.select().from(schema.assistantSnippets)
      .where(or(isNull(schema.assistantSnippets.dramaId), eq(schema.assistantSnippets.dramaId, did)))
    : await db.select().from(schema.assistantSnippets)
      .where(isNull(schema.assistantSnippets.dramaId))
  rows.sort((a, b) => {
    const ao = a.dramaId == null ? 0 : 1
    const bo = b.dramaId == null ? 0 : 1
    if (ao !== bo) return ao - bo
    return (a.sortOrder || 0) - (b.sortOrder || 0) || a.id - b.id
  })
  return rows.map(serializeSnippet)
}

async function formatSnippetsForSnapshot(dramaId: number | null, previewLen = 80) {
  const items = await listSnippets(dramaId)
  if (!items.length) return []
  return items.map(s => {
    const scope = s.drama_id ? '[本项目]' : '[共享]'
    const preview = excerpt(String(s.body || ''), previewLen).replace(/\n/g, ' ')
    return `- ${scope} ${s.title}：${preview}`
  })
}

function formatAssistantHistoryContent(content: AssistantMessageContent): string {
  const parts: string[] = []
  const text = (content.text || '').trim()
  if (text) parts.push(text)
  const artifacts = content.artifacts || []
  const doneArts = artifacts.filter(a => {
    const url = a.url?.trim()
    const status = a.status || (url ? 'done' : 'processing')
    return url && status !== 'processing' && status !== 'failed'
  })
  if (doneArts.length) {
    parts.push('【本轮生成图】')
    for (const a of doneArts) {
      const tid = a.taskId ?? (a as { task_id?: number }).task_id
      parts.push(`- 生成图#${tid} ${a.url}`)
    }
  } else if (artifacts.some(a => a.status === 'processing' || (!a.url && a.status !== 'failed'))) {
    parts.push('（本轮有图片正在生成）')
  }
  if (content.proposal?.action) {
    parts.push(`（待确认工序：${content.proposal.action}）`)
  }
  return parts.join('\n') || '（已完成工具调用）'
}

export async function createSnippet(opts: {
  title: string
  body: string
  dramaId?: number | null
  sortOrder?: number
}) {
  const title = opts.title.trim()
  const body = opts.body.trim()
  if (!title) throw new Error('标题必填')
  if (!body) throw new Error('提示词内容必填')
  const dramaId = opts.dramaId && opts.dramaId > 0 ? opts.dramaId : null
  if (dramaId) {
    const [drama] = await db.select().from(schema.dramas).where(eq(schema.dramas.id, dramaId))
    if (!drama) throw new Error('项目不存在')
  }
  const ts = now()
  const res = await db.insert(schema.assistantSnippets).values({
    dramaId,
    title,
    body,
    sortOrder: opts.sortOrder ?? 0,
    createdAt: ts,
    updatedAt: ts,
  })
  const [row] = await db.select().from(schema.assistantSnippets)
    .where(eq(schema.assistantSnippets.id, getInsertId(res)))
  return serializeSnippet(row)
}

export async function updateSnippet(id: number, patch: {
  title?: string
  body?: string
  dramaId?: number | null
  sortOrder?: number
}) {
  const [existing] = await db.select().from(schema.assistantSnippets)
    .where(eq(schema.assistantSnippets.id, id))
  if (!existing) return null

  const next: Partial<typeof schema.assistantSnippets.$inferInsert> = { updatedAt: now() }
  if (patch.title != null) {
    const title = String(patch.title).trim()
    if (!title) throw new Error('标题必填')
    next.title = title
  }
  if (patch.body != null) {
    const body = String(patch.body).trim()
    if (!body) throw new Error('提示词内容必填')
    next.body = body
  }
  if (patch.sortOrder != null) next.sortOrder = Number(patch.sortOrder) || 0
  if (patch.dramaId !== undefined) {
    const dramaId = patch.dramaId && patch.dramaId > 0 ? patch.dramaId : null
    if (dramaId) {
      const [drama] = await db.select().from(schema.dramas).where(eq(schema.dramas.id, dramaId))
      if (!drama) throw new Error('项目不存在')
    }
    next.dramaId = dramaId
  }

  await db.update(schema.assistantSnippets).set(next).where(eq(schema.assistantSnippets.id, id))
  const [row] = await db.select().from(schema.assistantSnippets)
    .where(eq(schema.assistantSnippets.id, id))
  return row ? serializeSnippet(row) : null
}

export async function deleteSnippet(id: number) {
  const [existing] = await db.select().from(schema.assistantSnippets)
    .where(eq(schema.assistantSnippets.id, id))
  if (!existing) return false
  await db.delete(schema.assistantSnippets).where(eq(schema.assistantSnippets.id, id))
  return true
}

export async function listMentionableAssets(dramaId?: number | null, episodeId?: number | null) {
  if (!dramaId || dramaId <= 0) return []
  const [chars, scenes, props] = await Promise.all([
    db.select().from(schema.characters).where(and(eq(schema.characters.dramaId, dramaId), isNull(schema.characters.deletedAt))),
    db.select().from(schema.scenes).where(and(eq(schema.scenes.dramaId, dramaId), isNull(schema.scenes.deletedAt))),
    db.select().from(schema.props).where(and(eq(schema.props.dramaId, dramaId), isNull(schema.props.deletedAt))),
  ])
  let charSet: Set<number> | null = null
  let sceneSet: Set<number> | null = null
  let propSet: Set<number> | null = null
  if (episodeId && episodeId > 0) {
    const [cl, sl, pl] = await Promise.all([
      db.select().from(schema.episodeCharacters).where(eq(schema.episodeCharacters.episodeId, episodeId)),
      db.select().from(schema.episodeScenes).where(eq(schema.episodeScenes.episodeId, episodeId)),
      db.select().from(schema.episodeProps).where(eq(schema.episodeProps.episodeId, episodeId)),
    ])
    charSet = new Set(cl.map(r => r.characterId))
    sceneSet = new Set(sl.map(r => r.sceneId))
    propSet = new Set(pl.map(r => r.propId))
  }
  const toOut = (filter: boolean) => {
    const items: Array<{ type: string; id: number; name: string; image_url: string | null; group: string }> = []
    for (const c of chars) {
      if (filter && charSet && !charSet.has(c.id)) continue
      items.push({ type: 'character', id: c.id, name: c.name, image_url: c.imageUrl, group: '角色' })
    }
    for (const s of scenes) {
      if (filter && sceneSet && !sceneSet.has(s.id)) continue
      items.push({ type: 'scene', id: s.id, name: `${s.location}${s.time ? ` · ${s.time}` : ''}`, image_url: s.imageUrl, group: '场景' })
    }
    for (const p of props) {
      if (filter && propSet && !propSet.has(p.id)) continue
      items.push({ type: 'prop', id: p.id, name: p.name, image_url: p.imageUrl, group: '道具' })
    }
    return items
  }
  const filtered = toOut(true)
  // 本集尚未关联任何资产时，回退到整部剧的角色/场景/道具，避免 @ 列表为空
  if (!filtered.length && (charSet || sceneSet || propSet)) return toOut(false)
  return filtered
}

function assetMentionToken(type: string, name: string): string {
  if (type === 'scene') return name.split(' · ')[0]?.trim() || name
  return name
}

/** 统一 @ 引用候选：资产 + 项目风格 + 风格目录 */
export async function listMentionables(dramaId?: number | null, episodeId?: number | null): Promise<MentionOption[]> {
  const items: MentionOption[] = []
  const assets = await listMentionableAssets(dramaId, episodeId)
  for (const a of assets) {
    items.push({
      token: assetMentionToken(a.type, a.name),
      label: a.name,
      group: a.group,
      category: 'asset',
      type: a.type,
      id: a.id,
      image_url: a.image_url,
    })
  }

  if (!dramaId || dramaId <= 0) return items

  const [drama] = await db.select().from(schema.dramas).where(eq(schema.dramas.id, dramaId))
  const presets = await db.select().from(schema.stylePresets)
  const activePresets = presets.filter(p => p.isActive).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.id - b.id)

  if (drama?.style) {
    const bound = activePresets.find(p => p.value === drama.style)
      || presets.find(p => p.value === drama.style)
    if (bound) {
      items.push({
        token: '项目风格',
        label: `项目风格 · ${bound.name}`,
        group: '项目',
        category: 'project',
        type: 'project_style',
        id: bound.id,
        key: bound.value,
        badge: '当前',
      })
    }
  }

  for (const p of activePresets) {
    items.push({
      token: p.name,
      label: p.name,
      group: '风格',
      category: 'catalog',
      type: 'style_preset',
      id: p.id,
      key: p.value,
    })
  }

  return items
}

export function findLatestGeneratedArtifact(
  history: Array<{ role: string; content: AssistantMessageContent }>,
): { taskId: number; url: string } | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]
    if (m.role !== 'assistant') continue
    const arts = m.content?.artifacts || []
    for (let j = arts.length - 1; j >= 0; j--) {
      const a = arts[j] as { taskId?: number; task_id?: number; url?: string; status?: string }
      const url = (a.url || '').trim()
      const taskId = a.taskId ?? a.task_id
      if (!url || !taskId) continue
      if (a.status === 'processing' || a.status === 'failed') continue
      return { taskId: Number(taskId), url }
    }
  }
  return null
}

function refsHaveImageSource(refs?: AssistantRef[]): boolean {
  return (refs || []).some(r => {
    const n = normalizeRef(r)
    if (n.category === 'generated' && !!n.image_url) return true
    if (n.category === 'asset' && n.id) return true
    return false
  })
}

/** 从库中读取资产当前图片（不信任前端缓存的 image_url） */
export async function resolveAssetImageUrl(
  type: string,
  id: number,
  dramaId: number,
): Promise<string | null> {
  if (!id || !dramaId) return null
  if (type === 'character') {
    const [c] = await db.select().from(schema.characters).where(eq(schema.characters.id, id))
    if (c && c.dramaId === dramaId && !c.deletedAt && c.imageUrl) return c.imageUrl
  } else if (type === 'scene') {
    const [s] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, id))
    if (s && s.dramaId === dramaId && !s.deletedAt && s.imageUrl) return s.imageUrl
  } else if (type === 'prop') {
    const [p] = await db.select().from(schema.props).where(eq(schema.props.id, id))
    if (p && p.dramaId === dramaId && !p.deletedAt && p.imageUrl) return p.imageUrl
  }
  return null
}

export async function enrichRefs(refs: AssistantRef[], dramaId?: number | null): Promise<AssistantRef[]> {
  if (!dramaId || dramaId <= 0) return (refs || []).map(r => normalizeRef(r))
  const out: AssistantRef[] = []
  for (const raw of refs || []) {
    const r = normalizeRef(raw)
    if (r.category === 'asset' && r.id) {
      const dbUrl = await resolveAssetImageUrl(r.type, r.id, dramaId)
      if (dbUrl) r.image_url = dbUrl
    }
    out.push(r)
  }
  return out
}
export function normalizeRef(raw: Partial<AssistantRef> & { type?: string }): AssistantRef {
  const type = raw.type || 'character'
  let category: AssistantRefCategory = raw.category as AssistantRefCategory
  if (!category) {
    if (type === 'project_style') category = 'project'
    else if (type === 'style_preset') category = 'catalog'
    else if (type === 'image') category = 'generated'
    else category = 'asset'
  }
  return {
    category,
    type,
    id: raw.id ?? undefined,
    key: raw.key,
    name: raw.name || '',
    token: raw.token,
    image_url: raw.image_url,
  }
}

async function resolveStylePrompt(ref: AssistantRef, dramaId?: number | null): Promise<string> {
  if (ref.type === 'project_style') {
    return dramaId ? getDramaStylePrompt(dramaId) : ''
  }
  if (ref.type === 'style_preset') {
    if (ref.id) {
      const [p] = await db.select().from(schema.stylePresets).where(eq(schema.stylePresets.id, ref.id))
      return p?.prompt || ''
    }
    if (ref.key) {
      const [p] = await db.select().from(schema.stylePresets).where(eq(schema.stylePresets.value, ref.key))
      return p?.prompt || ''
    }
  }
  return ''
}

function refTag(ref: AssistantRef): string {
  const idPart = ref.id != null ? `#${ref.id}` : ''
  return `[${ref.category}/${ref.type}${idPart}]`
}

async function formatRefLines(refs: AssistantRef[] | undefined, dramaId?: number | null): Promise<string> {
  if (!refs?.length) return ''
  const lines: string[] = []
  for (const raw of refs) {
    const r = normalizeRef(raw)
    const tag = refTag(r)
    if (r.category === 'asset') {
      const base = `- ${tag} ${r.name || ''}`.trim()
      if (r.image_url) {
        lines.push(`${base}（有参考图 ${r.image_url}；改图/换风格请调用 edit_image，reference_assets: [{ type: "${r.type}", id: ${r.id} }]）`)
      } else {
        lines.push(base)
      }
      continue
    }
    if (r.category === 'generated' && r.image_url) {
      lines.push(
        `- ${tag} ${r.name || ''}（助手生成图 ${r.image_url}；改图请 edit_image，reference_urls: ["${r.image_url}"]）`,
      )
      continue
    }
    if (r.type === 'style_preset' || r.type === 'project_style') {
      const prompt = await resolveStylePrompt(r, dramaId)
      if (!prompt) {
        lines.push(`- ${tag} ${r.name || ''}（风格不可用或未配置）`)
      } else {
        lines.push(
          `- ${tag} ${r.name || ''}（视觉风格英文词：${prompt}；调用 generate_image 或 edit_image 时须拼在 prompt 最前，格式 \`${prompt}, {画面/修改描述}\`，若已含相同风格词勿重复）`,
        )
      }
    }
  }
  return lines.join('\n')
}

function formatAttachmentLines(attachments: AssistantMessageContent['attachments']): string {
  if (!attachments?.length) return ''
  return attachments.map(a => `- ${a.name || '附件'} ${a.url}（改图可传 reference_urls）`).join('\n')
}

async function appendUserContext(
  text: string,
  refs?: AssistantRef[],
  attachments?: AssistantMessageContent['attachments'],
  dramaId?: number | null,
  opts?: { latestGenerated?: { taskId: number; url: string } | null },
): Promise<string> {
  let out = text
  const refBlock = await formatRefLines(refs, dramaId)
  if (refBlock) out += `\n\n【引用】\n${refBlock}`
  const attBlock = formatAttachmentLines(attachments)
  if (attBlock) out += `\n\n附件：\n${attBlock}`
  if (opts?.latestGenerated?.url && !refsHaveImageSource(refs)) {
    const { taskId, url } = opts.latestGenerated
    out += `\n\n【最近生成图】task_id=${taskId} ${url}\n（用户若要修改「这张图 / 刚才的图 / 图片里」等且未 @ 其他参考图，请调用 edit_image，reference_urls: ["${url}"]）`
  }
  return out
}

export async function toModelMessages(
  history: Array<{ role: string; content: AssistantMessageContent }>,
  current: {
    text: string
    snapshot: string
    refs?: AssistantRef[]
    attachments?: AssistantMessageContent['attachments']
    dramaId?: number | null
    latestGenerated?: { taskId: number; url: string } | null
  },
) {
  const recent = history.slice(-HISTORY_LIMIT)
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []
  const dramaId = current.dramaId && current.dramaId > 0 ? current.dramaId : null
  const latestGenerated = current.latestGenerated ?? null

  for (const m of recent) {
    const text = (m.content.text || '').trim()
    if (!text && !m.content.refs?.length && !m.content.attachments?.length && !m.content.artifacts?.length) continue
    if (m.role === 'assistant') {
      messages.push({ role: 'assistant', content: formatAssistantHistoryContent(m.content) })
      continue
    }
    messages.push({
      role: 'user',
      content: await appendUserContext(text || '（无文字）', m.content.refs, m.content.attachments, dramaId),
    })
  }

  const liveText = await appendUserContext(
    `${current.snapshot}\n\n【用户】\n${current.text || '（无文字）'}`,
    current.refs,
    current.attachments,
    dramaId,
    { latestGenerated },
  )
  messages.push({ role: 'user', content: liveText })
  return messages
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripAtTokens(text: string, refs?: AssistantRef[]): string {
  let out = text
  for (const raw of refs || []) {
    const token = raw.token || raw.name
    if (!token) continue
    out = out.replace(new RegExp(`@${escapeRegExp(token)}`, 'g'), ' ')
  }
  return out.replace(/\s+/g, ' ').trim()
}

async function collectRefImageUrls(refs?: AssistantRef[], dramaId?: number | null): Promise<string[]> {
  const urls: string[] = []
  for (const raw of refs || []) {
    const r = normalizeRef(raw)
    if (r.category === 'generated' && r.image_url) {
      urls.push(r.image_url)
      continue
    }
    if (r.category === 'asset' && r.id) {
      const url = r.image_url || (dramaId ? await resolveAssetImageUrl(r.type, r.id, dramaId) : null)
      if (url) urls.push(url)
    }
  }
  return [...new Set(urls.filter(Boolean))]
}

async function buildImageEditPrompt(text: string, refs?: AssistantRef[], dramaId?: number | null): Promise<string> {
  let prompt = stripAtTokens(text, refs) || text.trim()
  const styleParts: string[] = []
  for (const raw of refs || []) {
    const r = normalizeRef(raw)
    if (r.type !== 'style_preset' && r.type !== 'project_style') continue
    const sp = await resolveStylePrompt(r, dramaId)
    if (sp) styleParts.push(sp)
  }
  const styles = [...new Set(styleParts)]
  if (styles.length) prompt = `${styles.join(', ')}, ${prompt}`
  return prompt.trim()
}

/** 模型未调 edit_image 时，根据 @引用/最近生成图 服务端直接入队图生图 */
export async function tryDirectImageEdit(opts: {
  text: string
  refs?: AssistantRef[]
  attachments?: AssistantMessageContent['attachments']
  latestGenerated?: { taskId: number; url: string } | null
  dramaId?: number | null
  imageModel?: string
  img2imgConfigId?: number
}): Promise<{ task_id: number; kind: string; prompt: string; reference_urls: string[] } | null> {
  const dramaId = opts.dramaId && opts.dramaId > 0 ? opts.dramaId : null
  if (!dramaId) return null

  const hasGeneratedRef = (opts.refs || []).some(r => {
    const n = normalizeRef(r)
    return n.category === 'generated' && !!n.image_url
  })
  const hasAssetRef = (opts.refs || []).some(r => {
    const n = normalizeRef(r)
    return n.category === 'asset' && !!n.id
  })
  const stripped = stripAtTokens(opts.text, opts.refs)
  const looksLikeEdit = IMAGE_EDIT_HINT.test(stripped) || IMAGE_EDIT_HINT.test(opts.text)

  const shouldEdit = (hasGeneratedRef && !!stripped)
    || (hasAssetRef && looksLikeEdit)
    || (opts.attachments?.length && looksLikeEdit)
    || (!hasGeneratedRef && !hasAssetRef && !!opts.latestGenerated?.url && looksLikeEdit)

  if (!shouldEdit) return null

  let referenceUrls = await collectRefImageUrls(opts.refs, dramaId)
  if (!referenceUrls.length && opts.attachments?.length) {
    referenceUrls = [...new Set(opts.attachments.map(a => a.url).filter(Boolean))]
  }
  // 用户 @ 了资产/生成图时，禁止回退到「最近生成图」，避免改错图
  if (!referenceUrls.length && !hasAssetRef && !hasGeneratedRef && opts.latestGenerated?.url) {
    referenceUrls = [opts.latestGenerated.url]
  }
  if (!referenceUrls.length) return null

  const prompt = await buildImageEditPrompt(opts.text, opts.refs, dramaId)
  if (!prompt) return null

  const taskId = await generateImageEdit({
    dramaId,
    prompt,
    model: opts.imageModel,
    configId: opts.img2imgConfigId,
    referenceImages: referenceUrls,
  })
  logTaskProgress('Assistant', 'direct-image-edit', { taskId, prompt: prompt.slice(0, 120), refs: referenceUrls.length })
  return { task_id: taskId, kind: 'image', prompt, reference_urls: referenceUrls }
}

function flattenToolResultEntries(result: any): any[] {
  const entries: any[] = []
  const push = (list: unknown) => {
    if (Array.isArray(list)) entries.push(...list)
  }
  push(result?.toolResults)
  if (Array.isArray(result?.steps)) {
    for (const step of result.steps) {
      push(step?.toolResults)
      push(step?.toolCalls)
    }
  }
  if (Array.isArray(result?.messages)) {
    for (const msg of result.messages) {
      push(msg?.toolResults)
    }
  }
  return entries
}

export function collectToolOutcomes(result: any) {
  const toolCalls = result?.toolCalls || []
  const toolResults = flattenToolResultEntries(result)
  const normalizeName = (entry: any) => entry?.toolName || entry?.payload?.toolName || entry?.tool?.id || entry?.name || null
  const normalizeResult = (entry: any) => {
    const raw = entry?.result ?? entry?.output ?? entry?.data ?? entry?.payload?.result ?? null
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) } catch { return { text: raw } }
    }
    return raw
  }

  const imageTasks: Array<{ task_id: number; kind: string }> = []
  const proposals: Array<{ action: string; warning?: string; reason?: string }> = []
  let didWrite = false
  const normalizedCalls = toolCalls.map((tc: any) => ({
    toolName: normalizeName(tc),
    args: tc?.args ?? tc?.input ?? tc?.payload?.args ?? null,
  }))
  const normalizedResults = toolResults.map((tr: any) => {
    const toolName = normalizeName(tr)
    const parsed = normalizeResult(tr)
    if (parsed?.task_id) imageTasks.push({ task_id: Number(parsed.task_id), kind: parsed.kind || 'image' })
    if (parsed?.status === 'needs_confirmation' && parsed.action) {
      proposals.push({ action: parsed.action, warning: parsed.warning, reason: parsed.reason })
    }
    if (parsed?.created || parsed?.saved) didWrite = true
    return { toolName, result: parsed }
  })

  return { imageTasks, proposals, didWrite, toolCalls: normalizedCalls, toolResults: normalizedResults }
}

async function breakdownMessage(episodeId: number) {
  const [cl, sl, pl] = await Promise.all([
    db.select().from(schema.episodeCharacters).where(eq(schema.episodeCharacters.episodeId, episodeId)),
    db.select().from(schema.episodeScenes).where(eq(schema.episodeScenes.episodeId, episodeId)),
    db.select().from(schema.episodeProps).where(eq(schema.episodeProps.episodeId, episodeId)),
  ])
  const chars = cl.length
    ? (await db.select().from(schema.characters)).filter(c => cl.some(l => l.characterId === c.id) && !c.deletedAt)
    : []
  const scenes = sl.length
    ? (await db.select().from(schema.scenes)).filter(s => sl.some(l => l.sceneId === s.id) && !s.deletedAt)
    : []
  const props = pl.length
    ? (await db.select().from(schema.props)).filter(p => pl.some(l => l.propId === p.id) && !p.deletedAt)
    : []
  const charList = chars.length ? chars.map(c => `${c.name}(ID:${c.id})`).join('、') : '（当前集还没有角色）'
  const sceneList = scenes.length ? scenes.map(s => `${s.location} · ${s.time || '未设时间'}(ID:${s.id})`).join('、') : '（当前集还没有场景）'
  const propList = props.length ? props.map(p => `${p.name}(ID:${p.id})`).join('、') : '（当前集还没有道具）'
  return `请基于当前集剧本拆分分镜（不需要生成视频提示词，video_prompt 在视频生成阶段按需生成）。

当前集已有角色：${charList}
当前集已有场景：${sceneList}
当前集已有道具：${propList}

绑定要求：
- 每个镜头必须根据剧本内容，从上述当前集已有角色中选出出场的角色绑定 character_ids（ID 必须来自上述列表；有角色出场就必须绑定，不要遗漏）
- 每个镜头尽量匹配上述已有场景填写 scene_id（ID 必须来自上述列表），不要凭空创造新场景
- 每个镜头出现关键道具（被使用、交接、特写或在画面中明显可见）时，从上述当前集已有道具中绑定 prop_ids（ID 必须来自上述列表）；没有道具出现可传空数组
- 只有纯环境空镜头才可以不绑定角色`
}

export async function runPipelineAction(opts: {
  action: string
  dramaId: number
  episodeId: number
  model?: string
  configId?: number
}) {
  const { action, dramaId, episodeId, model, configId } = opts
  const requestContext = buildAgentRequestContext({
    episodeId,
    dramaId,
    modelOverride: model,
    textConfigId: configId,
  })

  if (action === 'video_prompts') {
    const result = await startVideoPromptBatch(episodeId, dramaId, { model, configId })
    return { ok: true, action, async: true, total: result.total, started: result.started, already_running: result.total === -1 }
  }

  const agentType = action === 'extractor' ? 'extractor'
    : action === 'storyboard_breaker' ? 'storyboard_breaker'
      : 'script_rewriter'
  const agent = mastra.getAgent(agentType)
  if (!agent) throw new Error(`Agent ${agentType} 不可用`)

  const message = action === 'extractor'
    ? '请从本集剧本中提取角色、场景和关键道具，与项目已有数据去重合并后保存并关联到当前集。'
    : action === 'storyboard_breaker'
      ? await breakdownMessage(episodeId)
      : '请读取剧本并改写为格式化剧本，然后保存'

  const result = await agent.generate([{ role: 'user', content: message }], { maxSteps: 20, requestContext })
  return { ok: true, action, async: false, text: result.text || '' }
}

export function serializeThread(thread: typeof schema.assistantThreads.$inferSelect) {
  return toSnakeCase(thread)
}
