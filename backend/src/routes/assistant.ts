/**
 * 工作室助手路由 — 线程、多轮对话、工序确认
 */
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest, notFound } from '../utils/response.js'
import { mastra } from '../mastra/index.js'
import { buildAgentRequestContext, type AssistantUiContext } from '../agents/context.js'
import {
  appendMessage,
  buildContextSnapshot,
  collectToolOutcomes,
  enrichRefs,
  tryDirectImageEdit,
  createSnippet,
  deleteSnippet,
  getOrCreateThread,
  listMentionableAssets,
  findLatestGeneratedArtifact,
  listMentionables,
  listSnippets,
  listThreadMessages,
  parseMessageContent,
  runPipelineAction,
  serializeThread,
  toModelMessages,
  updateMessageContent,
  updateSnippet,
  type AssistantMessageContent,
} from '../services/assistant.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

const app = new Hono()

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : null
}

function parseUiContext(raw: unknown): AssistantUiContext {
  const u = (raw && typeof raw === 'object') ? raw as Record<string, any> : {}
  return {
    route: u.route || undefined,
    drama_id: num(u.drama_id),
    episode_id: num(u.episode_id),
    episode_number: num(u.episode_number),
    stage: u.stage || undefined,
    script_step: typeof u.script_step === 'number' ? u.script_step : undefined,
    prod_tab: u.prod_tab || undefined,
    selected_asset: u.selected_asset?.id ? {
      type: u.selected_asset.type,
      id: Number(u.selected_asset.id),
    } : null,
    selected_storyboard_id: num(u.selected_storyboard_id),
  }
}

// GET /assistant/thread?drama_id=&episode_id=
app.get('/thread', async (c) => {
  const dramaId = num(c.req.query('drama_id'))
  const episodeId = num(c.req.query('episode_id'))
  const thread = await getOrCreateThread({ dramaId, episodeId })
  if (!thread) return badRequest(c, '无法创建对话线程')
  const messages = await listThreadMessages(thread.id)
  const assets = await listMentionableAssets(thread.dramaId, thread.episodeId)
  const mentions = await listMentionables(thread.dramaId, thread.episodeId)
  const snippets = await listSnippets(thread.dramaId)
  return success(c, {
    thread: serializeThread(thread),
    messages,
    assets,
    mentions,
    snippets,
  })
})

// GET /assistant/snippets?drama_id=
app.get('/snippets', async (c) => {
  const dramaId = num(c.req.query('drama_id'))
  const snippets = await listSnippets(dramaId)
  return success(c, { items: snippets })
})

// POST /assistant/snippets
app.post('/snippets', async (c) => {
  const body = await c.req.json()
  let dramaId: number | null = null
  if (body.drama_id != null && body.drama_id !== '') {
    dramaId = num(body.drama_id)
    if (!dramaId) return badRequest(c, 'drama_id 无效')
  }
  try {
    const row = await createSnippet({
      title: String(body.title || ''),
      body: String(body.body || ''),
      dramaId,
      sortOrder: Number(body.sort_order ?? body.sortOrder ?? 0),
    })
    return success(c, row)
  } catch (err: any) {
    return badRequest(c, err?.message || '创建失败')
  }
})

// PUT /assistant/snippets/:id
app.put('/snippets/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!id) return badRequest(c, 'id 无效')
  const body = await c.req.json()
  let dramaId: number | null | undefined
  if ('drama_id' in body || 'dramaId' in body) {
    const raw = body.drama_id ?? body.dramaId
    dramaId = raw === null ? null : num(raw)
  }
  try {
    const row = await updateSnippet(id, {
      title: body.title != null ? String(body.title) : undefined,
      body: body.body != null ? String(body.body) : undefined,
      dramaId,
      sortOrder: body.sort_order != null || body.sortOrder != null
        ? Number(body.sort_order ?? body.sortOrder)
        : undefined,
    })
    if (!row) return notFound(c, '常用提示词不存在')
    return success(c, row)
  } catch (err: any) {
    return badRequest(c, err?.message || '更新失败')
  }
})

// DELETE /assistant/snippets/:id
app.delete('/snippets/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!id) return badRequest(c, 'id 无效')
  const ok = await deleteSnippet(id)
  if (!ok) return notFound(c, '常用提示词不存在')
  return success(c, { ok: true })
})

// PUT /assistant/messages/:id — 回写生图 artifact URL
app.put('/messages/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [row] = await db.select().from(schema.assistantMessages).where(eq(schema.assistantMessages.id, id))
  if (!row) return notFound(c, '消息不存在')
  const current = parseMessageContent(row.content)
  const patch: Partial<AssistantMessageContent> = {}
  if (Array.isArray(body.artifacts)) patch.artifacts = body.artifacts
  const merged = await updateMessageContent(id, patch)
  return success(c, { id, content: merged || current })
})

// POST /assistant/chat
app.post('/chat', async (c) => {
  const body = await c.req.json()
  const ui = parseUiContext(body.ui_context)
  const dramaId = num(body.drama_id) || ui.drama_id
  const episodeId = num(body.episode_id) || ui.episode_id
  const text = String(body.message || body.text || '').trim()
  const rawRefs = Array.isArray(body.refs) ? body.refs : []
  const refs = await enrichRefs(rawRefs, dramaId)
  const attachments = Array.isArray(body.attachments) ? body.attachments : []
  if (!text && !refs.length && !attachments.length) return badRequest(c, 'message required')

  const thread = await getOrCreateThread({ dramaId, episodeId })
  if (!thread) return badRequest(c, '无法创建对话线程')

  logTaskStart('Assistant', 'chat', { threadId: thread.id, dramaId, episodeId, stage: ui.stage })

  const history = await listThreadMessages(thread.id)
  const snapshot = await buildContextSnapshot(
    { ...ui, drama_id: dramaId, episode_id: episodeId },
    { compact: history.length > 0 },
  )
  const latestGenerated = findLatestGeneratedArtifact(history)
  const userContent: AssistantMessageContent = { text, refs, attachments }
  await appendMessage(thread.id, 'user', userContent)

  const agent = mastra.getAgent('studio_assistant')
  if (!agent) return badRequest(c, '工作室助手未注册')

  const requestContext = buildAgentRequestContext({
    episodeId: episodeId || 0,
    dramaId: dramaId || 0,
    modelOverride: body.model || undefined,
    textConfigId: body.config_id || undefined,
    imageConfigId: body.image_config_id || undefined,
    img2imgConfigId: body.img2img_config_id || undefined,
    imageModelOverride: body.image_model || undefined,
    uiContext: { ...ui, drama_id: dramaId, episode_id: episodeId },
  })

  const messages = await toModelMessages(
    history.map(m => ({ role: m.role, content: m.content })),
    { text, snapshot, refs, attachments, dramaId: dramaId || null, latestGenerated },
  )

  return streamSSE(c, async (sse) => {
    const send = (event: string, data: unknown) => sse.writeSSE({ event, data: JSON.stringify(data) })
    try {
      let textOut = ''
      let rawResult: any = null
      try {
        const streamed: any = await agent.stream(messages as any, { maxSteps: 12, requestContext })
        if (streamed?.textStream) {
          for await (const chunk of streamed.textStream) {
            const delta = typeof chunk === 'string' ? chunk : (chunk?.textDelta || chunk?.text || '')
            if (!delta) continue
            textOut += delta
            await send('text-delta', { text: delta })
          }
        }
        rawResult = typeof streamed?.getFullOutput === 'function'
          ? await streamed.getFullOutput()
          : streamed
        if (!textOut) textOut = rawResult?.text || ''
      } catch (streamErr: any) {
        logTaskError('Assistant', 'stream-fallback', { error: streamErr?.message })
        rawResult = await agent.generate(messages as any, { maxSteps: 12, requestContext })
        textOut = rawResult?.text || ''
        if (textOut) await send('text', { text: textOut })
      }

      let outcomes = collectToolOutcomes(rawResult)
      if (!outcomes.imageTasks.length) {
        const direct = await tryDirectImageEdit({
          text,
          refs,
          attachments,
          latestGenerated,
          dramaId,
          imageModel: body.image_model || undefined,
          img2imgConfigId: body.img2img_config_id || undefined,
        })
        if (direct) {
          outcomes = {
            ...outcomes,
            imageTasks: [{ task_id: direct.task_id, kind: direct.kind }],
            toolCalls: [
              ...outcomes.toolCalls,
              {
                toolName: 'edit_image',
                args: { prompt: direct.prompt, reference_urls: direct.reference_urls },
              },
            ],
          }
          if (/task_id:\s*\d+/i.test(textOut)) {
            textOut = textOut.replace(/task_id:\s*\d+/gi, `task_id: ${direct.task_id}`)
          } else if (!textOut.trim()) {
            textOut = `已开始改图，完成后会出现在这条消息里。（task_id: ${direct.task_id}）`
          }
        }
      }
      if (!textOut && outcomes.proposals[0]) {
        textOut = `将执行「${outcomes.proposals[0].action}」。${outcomes.proposals[0].warning || ''}请在下方确认。`
        await send('text', { text: textOut })
      }
      if (!textOut && outcomes.imageTasks.length) {
        textOut = '已开始生成图片，完成后会出现在这条消息里，可一键创建为资产。'
        await send('text', { text: textOut })
      }

      for (const call of outcomes.toolCalls) {
        await send('tool-call', call)
      }
      for (const task of outcomes.imageTasks) {
        await send('image-task', task)
      }
      if (outcomes.proposals[0]) {
        await send('needs_confirmation', outcomes.proposals[0])
      }

      const artifacts = outcomes.imageTasks.map(t => ({
        type: 'image' as const,
        taskId: t.task_id,
        status: 'processing',
      }))
      const assistantContent: AssistantMessageContent = {
        text: textOut,
        toolCalls: outcomes.toolCalls,
        artifacts,
        proposal: outcomes.proposals[0] || undefined,
      }
      const messageId = await appendMessage(thread.id, 'assistant', assistantContent)
      logTaskSuccess('Assistant', 'chat', { threadId: thread.id, messageId, tools: outcomes.toolCalls.map((t: { toolName: string | null }) => t.toolName) })
      await send('done', {
        message_id: messageId,
        thread_id: thread.id,
        text: textOut,
        artifacts,
        proposal: outcomes.proposals[0] || null,
        did_write: outcomes.didWrite,
      })
    } catch (err: any) {
      logTaskError('Assistant', 'chat', { error: err?.message })
      await send('error', { message: err?.message || '助手执行失败' })
    }
  })
})

// POST /assistant/confirm
app.post('/confirm', async (c) => {
  const body = await c.req.json()
  const threadId = Number(body.thread_id)
  const messageId = Number(body.message_id)
  if (!threadId || !messageId) return badRequest(c, 'thread_id and message_id required')

  const [thread] = await db.select().from(schema.assistantThreads).where(eq(schema.assistantThreads.id, threadId))
  if (!thread) return notFound(c, '对话不存在')
  const [msg] = await db.select().from(schema.assistantMessages).where(eq(schema.assistantMessages.id, messageId))
  if (!msg || msg.threadId !== threadId) return notFound(c, '消息不存在')

  const content = parseMessageContent(msg.content)
  const action = content.proposal?.action || body.action
  if (!action) return badRequest(c, '没有待确认的工序')
  if (!thread.episodeId || !thread.dramaId) return badRequest(c, '当前对话不在某一集，无法执行工序')

  logTaskStart('Assistant', 'confirm', { action, episodeId: thread.episodeId })
  try {
    const result = await runPipelineAction({
      action,
      dramaId: thread.dramaId,
      episodeId: thread.episodeId,
      model: body.model || undefined,
      configId: body.config_id || undefined,
    })
    const follow = result.async
      ? (result.already_running
        ? '已有视频提示词任务在跑，已接入现有进度。'
        : result.total
          ? `已开始为 ${result.total} 个分镜生成视频提示词。`
          : '没有需要生成视频提示词的分镜。')
      : (result.text ? `已完成：${action}` : `已执行 ${action}`)
    const followId = await appendMessage(threadId, 'assistant', { text: follow })
    logTaskSuccess('Assistant', 'confirm', { action })
    return success(c, { ...result, message_id: followId, text: follow })
  } catch (err: any) {
    logTaskError('Assistant', 'confirm', { action, error: err?.message })
    return badRequest(c, err?.message || '工序执行失败')
  }
})

export default app
