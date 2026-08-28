/**
 * 工作室助手工具 — 读上下文、列资产、生图/改图、写提示词、建资产、提案工序
 * 生图只入队 sys_task，不在本回合同步等待
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { and, eq, isNull } from 'drizzle-orm'
import { db, getInsertId, schema } from '../../db/index.js'
import { now } from '../../utils/response.js'
import { generateImage, generateImageEdit } from '../../services/generation.js'
import { getDramaStylePrompt } from '../../services/style-preset.js'
import { linkCharToEpisode, linkPropToEpisode, linkSceneToEpisode } from '../../utils/episode-assets.js'
import {
  getDramaId,
  getEpisodeId,
  getImageConfigId,
  getImageModelOverride,
  getImg2imgConfigId,
  getAssistantRefs,
  getAssistantAttachments,
} from '../context.js'
import { collectRefImageUrls } from '../../services/assistant.js'

const PIPELINE_ACTIONS = ['script_rewriter', 'extractor', 'storyboard_breaker', 'video_prompts'] as const

function needDrama(dramaId: number | null) {
  return dramaId ? null : { error: '请先打开一部剧，再使用生产相关能力' }
}

function needEpisode(episodeId: number | null) {
  return episodeId ? null : { error: '请先打开某一集，再使用该能力' }
}

const readEpisodeContent = createTool({
  id: 'read_episode_content',
  description: '读取当前集的原始内容和改写后的格式化剧本全文。',
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const episodeId = getEpisodeId(context?.requestContext)
    const missing = needEpisode(episodeId)
    if (missing) return missing
    const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId!))
    if (!ep || ep.deletedAt) return { error: '剧集不存在' }
    return {
      episode_id: ep.id,
      title: ep.title,
      raw_content: ep.content || '',
      script_content: ep.scriptContent || '',
    }
  },
})

const listAssets = createTool({
  id: 'list_assets',
  description: '列出当前剧（若在某集则优先本集已挂链）的角色、场景、道具摘要，含 id 与是否有图。',
  inputSchema: z.object({
    scope: z.enum(['episode', 'drama']).optional().describe('默认 episode（有集时）否则 drama'),
  }),
  execute: async ({ scope }, context) => {
    const dramaId = getDramaId(context?.requestContext)
    const episodeId = getEpisodeId(context?.requestContext)
    const missing = needDrama(dramaId)
    if (missing) return missing

    const useEpisode = (scope || (episodeId ? 'episode' : 'drama')) === 'episode' && episodeId
    let charIds: number[] | null = null
    let sceneIds: number[] | null = null
    let propIds: number[] | null = null
    if (useEpisode) {
      const [cl, sl, pl] = await Promise.all([
        db.select().from(schema.episodeCharacters).where(eq(schema.episodeCharacters.episodeId, episodeId!)),
        db.select().from(schema.episodeScenes).where(eq(schema.episodeScenes.episodeId, episodeId!)),
        db.select().from(schema.episodeProps).where(eq(schema.episodeProps.episodeId, episodeId!)),
      ])
      charIds = cl.map(r => r.characterId)
      sceneIds = sl.map(r => r.sceneId)
      propIds = pl.map(r => r.propId)
    }

    const [chars, scenes, props] = await Promise.all([
      db.select().from(schema.characters).where(and(eq(schema.characters.dramaId, dramaId!), isNull(schema.characters.deletedAt))),
      db.select().from(schema.scenes).where(and(eq(schema.scenes.dramaId, dramaId!), isNull(schema.scenes.deletedAt))),
      db.select().from(schema.props).where(and(eq(schema.props.dramaId, dramaId!), isNull(schema.props.deletedAt))),
    ])

    return {
      scope: useEpisode ? 'episode' : 'drama',
      characters: chars.filter(c => !charIds || charIds.includes(c.id)).map(c => ({
        id: c.id, name: c.name, role: c.role || '', has_image: !!c.imageUrl,
      })),
      scenes: scenes.filter(s => !sceneIds || sceneIds.includes(s.id)).map(s => ({
        id: s.id, location: s.location, time: s.time || '', has_image: !!s.imageUrl,
      })),
      props: props.filter(p => !propIds || propIds.includes(p.id)).map(p => ({
        id: p.id, name: p.name, type: p.type || '', has_image: !!p.imageUrl,
      })),
    }
  },
})

const getAsset = createTool({
  id: 'get_asset',
  description: '读取单个角色/场景/道具的完整设定与图片地址、最终提示词。',
  inputSchema: z.object({
    type: z.enum(['character', 'scene', 'prop']),
    id: z.number(),
  }),
  execute: async ({ type, id }, context) => {
    const dramaId = getDramaId(context?.requestContext)
    const missing = needDrama(dramaId)
    if (missing) return missing
    if (type === 'character') {
      const [c] = await db.select().from(schema.characters).where(eq(schema.characters.id, id))
      if (!c || c.dramaId !== dramaId || c.deletedAt) return { error: '角色不存在' }
      return {
        type, id: c.id, name: c.name, role: c.role, appearance: c.appearance,
        styling: c.styling, final_prompt: c.finalPrompt, image_url: c.imageUrl,
      }
    }
    if (type === 'scene') {
      const [s] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, id))
      if (!s || s.dramaId !== dramaId || s.deletedAt) return { error: '场景不存在' }
      return {
        type, id: s.id, location: s.location, time: s.time, prompt: s.prompt,
        lighting: s.lighting, final_prompt: s.finalPrompt, image_url: s.imageUrl,
      }
    }
    const [p] = await db.select().from(schema.props).where(eq(schema.props.id, id))
    if (!p || p.dramaId !== dramaId || p.deletedAt) return { error: '道具不存在' }
    return {
      type, id: p.id, name: p.name, prop_type: p.type, description: p.description,
      final_prompt: p.finalPrompt, image_url: p.imageUrl,
    }
  },
})

const listStoryboards = createTool({
  id: 'list_storyboards',
  description: '列出当前集全部分镜段落摘要。',
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const episodeId = getEpisodeId(context?.requestContext)
    const missing = needEpisode(episodeId)
    if (missing) return missing
    const rows = await db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.episodeId, episodeId!))
    const alive = rows.filter(s => !s.deletedAt).sort((a, b) => a.storyboardNumber - b.storyboardNumber)
    return {
      storyboards: alive.map(s => ({
        id: s.id,
        number: s.storyboardNumber,
        duration: s.duration,
        description: (s.description || '').slice(0, 240),
        atmosphere: s.atmosphere || '',
        has_video_prompt: !!(s.videoPrompt || '').trim(),
        has_video: !!s.videoUrl,
      })),
    }
  },
})

const getStoryboard = createTool({
  id: 'get_storyboard',
  description: '读取单个分镜的完整描述、氛围、视频提示词。',
  inputSchema: z.object({ storyboard_id: z.number() }),
  execute: async ({ storyboard_id }, context) => {
    const episodeId = getEpisodeId(context?.requestContext)
    const missing = needEpisode(episodeId)
    if (missing) return missing
    const [s] = await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboard_id))
    if (!s || s.episodeId !== episodeId || s.deletedAt) return { error: '分镜不存在' }
    return {
      id: s.id,
      number: s.storyboardNumber,
      duration: s.duration,
      description: s.description,
      atmosphere: s.atmosphere,
      video_prompt: s.videoPrompt,
      scene_id: s.sceneId,
      video_url: s.videoUrl,
    }
  },
})

async function resolveRefUrls(params: {
  dramaId: number
  referenceUrls?: string[]
  referenceAssetIds?: { type: 'character' | 'scene' | 'prop'; id: number }[]
}): Promise<string[]> {
  const urls = [...(params.referenceUrls || [])]
  for (const ref of params.referenceAssetIds || []) {
    if (ref.type === 'character') {
      const [c] = await db.select().from(schema.characters).where(eq(schema.characters.id, ref.id))
      if (c?.imageUrl && c.dramaId === params.dramaId) urls.push(c.imageUrl)
    } else if (ref.type === 'scene') {
      const [s] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, ref.id))
      if (s?.imageUrl && s.dramaId === params.dramaId) urls.push(s.imageUrl)
    } else {
      const [p] = await db.select().from(schema.props).where(eq(schema.props.id, ref.id))
      if (p?.imageUrl && p.dramaId === params.dramaId) urls.push(p.imageUrl)
    }
  }
  return [...new Set(urls.filter(Boolean))]
}

async function resolveToolReferenceUrls(
  context: { requestContext?: unknown } | undefined,
  dramaId: number,
  referenceUrls?: string[],
  referenceAssets?: { type: 'character' | 'scene' | 'prop'; id: number }[],
): Promise<string[]> {
  let refs = await resolveRefUrls({
    dramaId,
    referenceUrls,
    referenceAssetIds: referenceAssets,
  })
  if (refs.length) return refs

  const ctxRefs = getAssistantRefs(context?.requestContext as any)
  refs = await collectRefImageUrls(ctxRefs, dramaId)
  if (refs.length) return refs

  const attachments = getAssistantAttachments(context?.requestContext as any)
  if (attachments.length) {
    return [...new Set(attachments.map(a => a.url).filter(Boolean))]
  }
  return []
}

async function enqueueImageWithRefs(
  context: { requestContext?: unknown } | undefined,
  dramaId: number,
  prompt: string,
  referenceUrls?: string[],
  referenceAssets?: { type: 'character' | 'scene' | 'prop'; id: number }[],
): Promise<number> {
  const refs = await resolveToolReferenceUrls(context, dramaId, referenceUrls, referenceAssets)
  if (refs.length) {
    return generateImageEdit({
      dramaId,
      prompt,
      model: getImageModelOverride(context?.requestContext as any),
      configId: getImg2imgConfigId(context?.requestContext as any),
      referenceImages: refs,
    })
  }
  return generateImage({
    dramaId,
    prompt,
    model: getImageModelOverride(context?.requestContext as any),
    configId: getImageConfigId(context?.requestContext as any),
  })
}

const generateImageTool = createTool({
  id: 'generate_image',
  description: '根据提示词生成一张图片（不绑定资产）。可附带参考图 URL 或资产 ID。立即返回 task_id，前端轮询完成后出图。',
  inputSchema: z.object({
    prompt: z.string().describe('生图提示词'),
    reference_urls: z.array(z.string()).optional(),
    reference_assets: z.array(z.object({
      type: z.enum(['character', 'scene', 'prop']),
      id: z.number(),
    })).optional(),
  }),
  execute: async ({ prompt, reference_urls, reference_assets }, context) => {
    const dramaId = getDramaId(context?.requestContext)
    const missing = needDrama(dramaId)
    if (missing) return missing
    const taskId = await enqueueImageWithRefs(context, dramaId!, prompt, reference_urls, reference_assets)
    return { status: 'processing', task_id: taskId, kind: 'image' }
  },
})

const editImageTool = createTool({
  id: 'edit_image',
  description: '基于参考图做图生图修改。必须提供参考图 URL 或已有图的资产 ID。',
  inputSchema: z.object({
    prompt: z.string().describe('修改说明'),
    reference_urls: z.array(z.string()).optional(),
    reference_assets: z.array(z.object({
      type: z.enum(['character', 'scene', 'prop']),
      id: z.number(),
    })).optional(),
  }),
  execute: async ({ prompt, reference_urls, reference_assets }, context) => {
    const dramaId = getDramaId(context?.requestContext)
    const missing = needDrama(dramaId)
    if (missing) return missing
    const refs = await resolveToolReferenceUrls(context, dramaId!, reference_urls, reference_assets)
    if (!refs.length) return { error: '图生图需要至少一张参考图（引用资产或上传图片）' }
    const taskId = await generateImageEdit({
      dramaId: dramaId!,
      prompt,
      model: getImageModelOverride(context?.requestContext),
      configId: getImg2imgConfigId(context?.requestContext),
      referenceImages: refs,
    })
    return { status: 'processing', task_id: taskId, kind: 'image' }
  },
})

const saveAssetPrompt = createTool({
  id: 'save_asset_prompt',
  description: '把最终提示词写入已有角色/场景/道具；项目视觉风格会自动拼到最前。不要在 prompt 里写风格词。',
  inputSchema: z.object({
    type: z.enum(['character', 'scene', 'prop']),
    id: z.number(),
    prompt: z.string(),
  }),
  execute: async ({ type, id, prompt }, context) => {
    const dramaId = getDramaId(context?.requestContext)
    const missing = needDrama(dramaId)
    if (missing) return missing
    const stylePrompt = await getDramaStylePrompt(dramaId!)
    const finalPrompt = stylePrompt ? `${stylePrompt}, ${prompt}` : prompt
    if (type === 'character') {
      const [c] = await db.select().from(schema.characters).where(eq(schema.characters.id, id))
      if (!c || c.dramaId !== dramaId) return { error: '角色不存在' }
      await db.update(schema.characters).set({ finalPrompt, updatedAt: now() }).where(eq(schema.characters.id, id))
    } else if (type === 'scene') {
      const [s] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, id))
      if (!s || s.dramaId !== dramaId) return { error: '场景不存在' }
      await db.update(schema.scenes).set({ finalPrompt, updatedAt: now() }).where(eq(schema.scenes.id, id))
    } else {
      const [p] = await db.select().from(schema.props).where(eq(schema.props.id, id))
      if (!p || p.dramaId !== dramaId) return { error: '道具不存在' }
      await db.update(schema.props).set({ finalPrompt, updatedAt: now() }).where(eq(schema.props.id, id))
    }
    return { saved: true, type, id, final_prompt: finalPrompt }
  },
})

const saveVideoPrompt = createTool({
  id: 'save_video_prompt',
  description: '更新单个分镜的 video_prompt，不改动其他字段。',
  inputSchema: z.object({
    storyboard_id: z.number(),
    video_prompt: z.string(),
  }),
  execute: async ({ storyboard_id, video_prompt }, context) => {
    const episodeId = getEpisodeId(context?.requestContext)
    const missing = needEpisode(episodeId)
    if (missing) return missing
    const [s] = await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboard_id))
    if (!s || s.episodeId !== episodeId || s.deletedAt) return { error: '分镜不存在' }
    await db.update(schema.storyboards)
      .set({ videoPrompt: video_prompt, updatedAt: now() })
      .where(eq(schema.storyboards.id, storyboard_id))
    return { saved: true, storyboard_id }
  },
})

const createAsset = createTool({
  id: 'create_asset',
  description: '创建角色/场景/道具，可选带上已生成的图片 URL，并在当前集时自动挂链。',
  inputSchema: z.object({
    type: z.enum(['character', 'scene', 'prop']),
    name: z.string().describe('角色名 / 场景地点 / 道具名'),
    image_url: z.string().optional(),
    role: z.string().optional(),
    appearance: z.string().optional(),
    styling: z.string().optional(),
    time: z.string().optional(),
    prompt: z.string().optional(),
    lighting: z.string().optional(),
    prop_type: z.string().optional(),
    description: z.string().optional(),
  }),
  execute: async (input, context) => {
    const dramaId = getDramaId(context?.requestContext)
    const episodeId = getEpisodeId(context?.requestContext)
    const missing = needDrama(dramaId)
    if (missing) return missing
    const ts = now()
    const imageUrl = input.image_url || null
    if (input.type === 'character') {
      const res = await db.insert(schema.characters).values({
        dramaId: dramaId!,
        name: input.name.trim(),
        role: input.role || '',
        appearance: input.appearance || '',
        styling: input.styling || '',
        imageUrl,
        createdAt: ts,
        updatedAt: ts,
      })
      const id = getInsertId(res)
      if (episodeId) await linkCharToEpisode(episodeId, id)
      return { created: true, type: 'character', id, name: input.name.trim(), linked_episode: !!episodeId }
    }
    if (input.type === 'scene') {
      const res = await db.insert(schema.scenes).values({
        dramaId: dramaId!,
        episodeId: episodeId || undefined,
        location: input.name.trim(),
        time: input.time || '',
        prompt: input.prompt || input.description || input.name,
        lighting: input.lighting || '',
        imageUrl,
        createdAt: ts,
        updatedAt: ts,
      })
      const id = getInsertId(res)
      if (episodeId) await linkSceneToEpisode(episodeId, id)
      return { created: true, type: 'scene', id, location: input.name.trim(), linked_episode: !!episodeId }
    }
    const res = await db.insert(schema.props).values({
      dramaId: dramaId!,
      name: input.name.trim(),
      type: input.prop_type || '',
      description: input.description || '',
      imageUrl,
      createdAt: ts,
      updatedAt: ts,
    })
    const id = getInsertId(res)
    if (episodeId) await linkPropToEpisode(episodeId, id)
    return { created: true, type: 'prop', id, name: input.name.trim(), linked_episode: !!episodeId }
  },
})

const PIPELINE_WARNINGS: Record<string, string> = {
  script_rewriter: '将覆盖当前集的改写剧本（script_content）。原始内容不会被改动。',
  extractor: '将从剧本提取角色/场景/道具并与项目已有数据去重合并，挂到当前集。',
  storyboard_breaker: '将按当前剧本重新生成整集分镜并覆盖已有分镜。',
  video_prompts: '将为本集缺失（或指定）的分镜批量生成视频提示词。',
}

const proposePipeline = createTool({
  id: 'propose_pipeline',
  description: '提案调用现有工序 Agent（改写/提取/拆分镜/批量视频提示词）。只提案不执行，用户确认后才会跑。',
  inputSchema: z.object({
    action: z.enum(PIPELINE_ACTIONS),
    reason: z.string().optional().describe('向用户解释为什么要跑这步'),
  }),
  execute: async ({ action, reason }, context) => {
    const dramaId = getDramaId(context?.requestContext)
    const episodeId = getEpisodeId(context?.requestContext)
    if (!dramaId || !episodeId) return { error: '请先打开某一集再调用工序' }
    return {
      status: 'needs_confirmation',
      action,
      warning: PIPELINE_WARNINGS[action],
      reason: reason || '',
    }
  },
})

export const assistantTools = {
  readEpisodeContent,
  listAssets,
  getAsset,
  listStoryboards,
  getStoryboard,
  generateImageTool,
  editImageTool,
  saveAssetPrompt,
  saveVideoPrompt,
  createAsset,
  proposePipeline,
}

export { PIPELINE_ACTIONS, PIPELINE_WARNINGS }
