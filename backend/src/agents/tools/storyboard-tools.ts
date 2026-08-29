/**
 * 分镜拆解 Agent 工具
 * 模块级单例 — episodeId + dramaId 通过 RequestContext 按请求注入
 */
import { createTool } from '@mastra/core/tools'
import type { ToolExecutionContext } from '@mastra/core/tools'
import { z } from 'zod'
import { db, getInsertId, schema } from '../../db/index.js'
import { eq } from 'drizzle-orm'
import { now } from '../../utils/response.js'
import { linkCharToEpisode, linkPropToEpisode, linkSceneToEpisode } from '../../utils/episode-assets.js'
import { logTaskProgress, logTaskSuccess } from '../../utils/task-logger.js'
import { getDramaId, getEpisodeId } from '../context.js'
import { normalizeShotStyle } from '../../services/shot-style.js'
import { formatStoryboardDescription } from '../../utils/storyboard-description.js'

async function syncStoryboardCharacters(storyboardId: number, characterIds: number[]) {
  await db.delete(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))


  const uniqueIds = [...new Set(characterIds.filter(Boolean))]
  if (!uniqueIds.length) return

  for (const characterId of uniqueIds) {
    await db.insert(schema.storyboardCharacters).values({
      storyboardId,
      characterId,
    })
  }
}

async function syncStoryboardProps(storyboardId: number, propIds: number[]) {
  await db.delete(schema.storyboardProps)
    .where(eq(schema.storyboardProps.storyboardId, storyboardId))

  const uniqueIds = [...new Set(propIds.filter(Boolean))]
  if (!uniqueIds.length) return

  for (const propId of uniqueIds) {
    await db.insert(schema.storyboardProps).values({
      storyboardId,
      propId,
    })
  }
}

async function getEpisodeSceneIds(episodeId: number) {
  const links = await db.select().from(schema.episodeScenes)
    .where(eq(schema.episodeScenes.episodeId, episodeId))
  return new Set(links.map(link => link.sceneId))
}

async function getEpisodeCharacterIds(episodeId: number) {
  const links = await db.select().from(schema.episodeCharacters)
    .where(eq(schema.episodeCharacters.episodeId, episodeId))
  return new Set(links.map(link => link.characterId))
}

async function getEpisodePropIds(episodeId: number) {
  const links = await db.select().from(schema.episodeProps)
    .where(eq(schema.episodeProps.episodeId, episodeId))
  return new Set(links.map(link => link.propId))
}

async function validateStoryboardBindings(episodeId: number, dramaId: number, sceneId: number | null | undefined, characterIds: number[] | undefined, propIds?: number[] | undefined) {
  const episodeSceneIds = await getEpisodeSceneIds(episodeId)
  const episodeCharacterIds = await getEpisodeCharacterIds(episodeId)
  const episodePropIds = await getEpisodePropIds(episodeId)

  // 场景/角色/道具属于本剧但尚未关联到当前集时，自动补关联（拆分时即完成绑定）
  if (sceneId != null && !episodeSceneIds.has(sceneId)) {
    const [scene] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, sceneId))
    if (!scene || scene.dramaId !== dramaId || scene.deletedAt) {
      throw new Error(`scene_id ${sceneId} 不属于当前项目`)
    }
    await linkSceneToEpisode(episodeId, sceneId)
  }

  const uniqueCharacterIds = [...new Set((characterIds || []).filter(Boolean))]
  for (const characterId of uniqueCharacterIds) {
    if (episodeCharacterIds.has(characterId)) continue
    const [character] = await db.select().from(schema.characters).where(eq(schema.characters.id, characterId))
    if (!character || character.dramaId !== dramaId || character.deletedAt) {
      throw new Error(`character_id ${characterId} 不属于当前项目`)
    }
    await linkCharToEpisode(episodeId, characterId)
  }

  const uniquePropIds = [...new Set((propIds || []).filter(Boolean))]
  for (const propId of uniquePropIds) {
    if (episodePropIds.has(propId)) continue
    const [prop] = await db.select().from(schema.props).where(eq(schema.props.id, propId))
    if (!prop || prop.dramaId !== dramaId || prop.deletedAt) {
      throw new Error(`prop_id ${propId} 不属于当前项目`)
    }
    await linkPropToEpisode(episodeId, propId)
  }
}

type ToolContext = ToolExecutionContext | undefined

function requireIds(context: ToolContext): { episodeId: number; dramaId: number } | { error: string } {
  const episodeId = getEpisodeId(context?.requestContext)
  const dramaId = getDramaId(context?.requestContext)
  if (!episodeId || !dramaId) return { error: 'Missing episodeId/dramaId in request context' }
  return { episodeId, dramaId }
}

const readStoryboardContext = createTool({
  id: 'read_storyboard_context',
  description: 'Read the screenplay, characters, scenes, and props for storyboard breakdown.',
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const ids = requireIds(context)
    if ('error' in ids) return ids
    const { episodeId, dramaId } = ids
    const [ep] = await db.select().from(schema.episodes)
      .where(eq(schema.episodes.id, episodeId))
    if (!ep) return { error: 'Episode not found' }
    const script = ep.scriptContent || ep.content
    if (!script) return { error: 'Episode has no script' }

    const charLinks = await db.select().from(schema.episodeCharacters)
      .where(eq(schema.episodeCharacters.episodeId, episodeId))
    const sceneLinks = await db.select().from(schema.episodeScenes)
      .where(eq(schema.episodeScenes.episodeId, episodeId))
    const propLinks = await db.select().from(schema.episodeProps)
      .where(eq(schema.episodeProps.episodeId, episodeId))

    const linkedCharacterIds = new Set(charLinks.map(link => link.characterId))
    const linkedSceneIds = new Set(sceneLinks.map(link => link.sceneId))
    const linkedPropIds = new Set(propLinks.map(link => link.propId))

    const chars = await db.select().from(schema.characters)
      .where(eq(schema.characters.dramaId, dramaId))
    const scns = await db.select().from(schema.scenes)
      .where(eq(schema.scenes.dramaId, dramaId))
    const prps = await db.select().from(schema.props)
      .where(eq(schema.props.dramaId, dramaId))
    const existingStoryboards = await db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.episodeId, episodeId))

    const characters = chars
      .filter(c => !c.deletedAt)
      .filter(c => !linkedCharacterIds.size || linkedCharacterIds.has(c.id))
      .map(c => ({
        id: c.id,
        name: c.name,
        role: c.role || '',
        description: c.description || '',
        appearance: c.appearance || '',
        styling: c.styling || '',
        image_url: c.imageUrl || '',
        reference_images: c.referenceImages || '',
      }))

    const scenes = scns
      .filter(s => !s.deletedAt)
      .filter(s => !linkedSceneIds.size || linkedSceneIds.has(s.id))
      .map(s => ({
        id: s.id,
        location: s.location,
        time: s.time,
        prompt: s.prompt || '',
        lighting: s.lighting || '',
        image_url: s.imageUrl || '',
        storyboard_count: s.storyboardCount || 0,
      }))

    const props = prps
      .filter(p => !p.deletedAt)
      .filter(p => !linkedPropIds.size || linkedPropIds.has(p.id))
      .map(p => ({
        id: p.id,
        name: p.name,
        type: p.type || '',
        description: p.description || '',
        image_url: p.imageUrl || '',
      }))

    const existingStoryboardPayload = await Promise.all(existingStoryboards
      .filter(sb => !sb.deletedAt)
      .map(async (sb) => {
        const links = await db.select().from(schema.storyboardCharacters)
          .where(eq(schema.storyboardCharacters.storyboardId, sb.id))
        const sbPropLinks = await db.select().from(schema.storyboardProps)
          .where(eq(schema.storyboardProps.storyboardId, sb.id))
        return {
          id: sb.id,
          shot_number: sb.storyboardNumber,
          title: sb.title || '',
          scene_id: sb.sceneId,
          character_ids: links.map(link => link.characterId),
          prop_ids: sbPropLinks.map(link => link.propId),
          shot_type: sb.shotType || '',
          duration: sb.duration || 0,
          description: sb.description || '',
          atmosphere: sb.atmosphere || '',
          shot_style: sb.shotStyle || 'default',
          video_prompt: sb.videoPrompt || '',
        }
      }))

    const payload = {
      episode: {
        id: ep.id,
        title: ep.title,
        episode_number: ep.episodeNumber,
        description: ep.description || '',
      },
      script,
      characters,
      scenes,
      props,
      existing_storyboards: existingStoryboardPayload,
    }
    logTaskSuccess('StoryboardTool', 'read-context', {
      episodeId,
      dramaId,
      characters: characters.length,
      scenes: scenes.length,
      props: props.length,
      existingStoryboards: payload.existing_storyboards.length,
      scriptLength: script.length,
    })
    return payload
  },
})

const saveStoryboards = createTool({
  id: 'save_storyboards',
  description: 'Save generated storyboards. Replaces all existing storyboards for this episode.',
  inputSchema: z.object({
    storyboards: z.array(z.object({
      shot_number: z.number(),
      title: z.string().optional(),
      shot_type: z.string().optional(),
      angle: z.string().optional(),
      movement: z.string().optional(),
      location: z.string().optional(),
      time: z.string().optional(),
      description: z.string().optional(),
      result: z.string().optional(),
      atmosphere: z.string().optional(),
      shot_style: z.enum(['default', 'documentary', 'art_film', 'fight']).optional()
        .describe('Lens language style: fight / documentary / art_film / default'),
      image_prompt: z.string().optional(),
      video_prompt: z.string().optional(),
      bgm_prompt: z.string().optional(),
      sound_effect: z.string().optional(),
      duration: z.number().optional(),
      scene_id: z.number().nullable().optional(),
      character_ids: z.array(z.number()).optional(),
      prop_ids: z.array(z.number()).optional(),
    })),
  }),
  execute: async ({ storyboards }, context) => {
    const ids = requireIds(context)
    if ('error' in ids) return ids
    const { episodeId, dramaId } = ids
    const ts = now()
    logTaskProgress('StoryboardTool', 'save-begin', {
      episodeId,
      dramaId,
      count: storyboards.length,
      shotNumbers: storyboards.map(sb => sb.shot_number).join(','),
    })
    const existingStoryboardRows = await db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.episodeId, episodeId))
    const existingStoryboardIds = existingStoryboardRows.map(sb => sb.id)
    for (const storyboardId of existingStoryboardIds) {
      await db.delete(schema.storyboardCharacters)
        .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))
      await db.delete(schema.storyboardProps)
        .where(eq(schema.storyboardProps.storyboardId, storyboardId))
    }
    await db.delete(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId))

    let totalDuration = 0
    for (const sb of storyboards) {
      await validateStoryboardBindings(episodeId, dramaId, sb.scene_id, sb.character_ids, sb.prop_ids)
      const res = await db.insert(schema.storyboards).values({
        episodeId,
        storyboardNumber: sb.shot_number,
        title: sb.title, shotType: sb.shot_type,
        angle: sb.angle, movement: sb.movement,
        location: sb.location, time: sb.time,
        description: formatStoryboardDescription(sb.description), result: sb.result,
        atmosphere: sb.atmosphere, shotStyle: normalizeShotStyle(sb.shot_style),
        imagePrompt: sb.image_prompt,
        videoPrompt: sb.video_prompt, bgmPrompt: sb.bgm_prompt,
        soundEffect: sb.sound_effect,
        sceneId: sb.scene_id, duration: sb.duration || 10,
        createdAt: ts, updatedAt: ts,
      })
      await syncStoryboardCharacters(getInsertId(res), sb.character_ids || [])
      await syncStoryboardProps(getInsertId(res), sb.prop_ids || [])
      totalDuration += sb.duration || 10
    }

    await db.update(schema.episodes)
      .set({ duration: Math.ceil(totalDuration / 60), updatedAt: ts })
      .where(eq(schema.episodes.id, episodeId))

    logTaskSuccess('StoryboardTool', 'save-complete', {
      episodeId,
      count: storyboards.length,
      totalDuration,
    })
    return { message: `Saved ${storyboards.length} storyboards`, count: storyboards.length, total_duration: totalDuration }
  },
})

/** 字段显式传入且非 undefined（scene_id 允许 null 表示解绑） */
function hasPresentField(fields: Record<string, unknown>, key: string): boolean {
  return key in fields && fields[key] !== undefined
}

/** 字符串/数组等：忽略 null/undefined，避免 LLM 把未用 optional 填成 null 误覆盖 */
function hasDefinedField(fields: Record<string, unknown>, key: string): boolean {
  return hasPresentField(fields, key) && fields[key] !== null
}

const updateStoryboard = createTool({
  id: 'update_storyboard',
  description: 'Update a specific storyboard shot. Only pass fields that should change; omit unused fields.',
  inputSchema: z.object({
    storyboard_id: z.number(),
    title: z.string().optional(),
    shot_type: z.string().optional(),
    angle: z.string().optional(),
    movement: z.string().optional(),
    location: z.string().optional(),
    time: z.string().optional(),
    result: z.string().optional(),
    atmosphere: z.string().optional(),
    shot_style: z.enum(['default', 'documentary', 'art_film', 'fight']).optional(),
    image_prompt: z.string().optional(),
    video_prompt: z.string().optional(),
    bgm_prompt: z.string().optional(),
    sound_effect: z.string().optional(),
    description: z.string().optional(),
    scene_id: z.number().nullable().optional(),
    character_ids: z.array(z.number()).optional(),
    prop_ids: z.array(z.number()).optional(),
    duration: z.number().optional(),
  }),
  execute: async ({ storyboard_id, ...rawFields }, context) => {
    const ids = requireIds(context)
    if ('error' in ids) return ids
    const { episodeId, dramaId } = ids
    const fields = rawFields as Record<string, unknown>
    const [storyboard] = await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboard_id))
    if (!storyboard) return { error: `Storyboard ${storyboard_id} not found` }
    const appliedKeys = Object.keys(fields).filter(k =>
      k === 'scene_id' ? hasPresentField(fields, k) : hasDefinedField(fields, k),
    )
    logTaskProgress('StoryboardTool', 'update-begin', {
      episodeId,
      storyboardId: storyboard_id,
      fields: appliedKeys,
    })

    const currentCharacterIds = hasDefinedField(fields, 'character_ids')
      ? (fields.character_ids as number[])
      : (await db.select().from(schema.storyboardCharacters)
          .where(eq(schema.storyboardCharacters.storyboardId, storyboard_id)))
          .map(link => link.characterId)

    const currentPropIds = hasDefinedField(fields, 'prop_ids')
      ? (fields.prop_ids as number[])
      : (await db.select().from(schema.storyboardProps)
          .where(eq(schema.storyboardProps.storyboardId, storyboard_id)))
          .map(link => link.propId)

    await validateStoryboardBindings(
      episodeId,
      dramaId,
      hasPresentField(fields, 'scene_id') ? (fields.scene_id as number | null) : storyboard.sceneId,
      currentCharacterIds,
      currentPropIds,
    )

    const updates: Record<string, any> = { updatedAt: now() }
    if (hasDefinedField(fields, 'title')) updates.title = fields.title
    if (hasDefinedField(fields, 'shot_type')) updates.shotType = fields.shot_type
    if (hasDefinedField(fields, 'angle')) updates.angle = fields.angle
    if (hasDefinedField(fields, 'movement')) updates.movement = fields.movement
    if (hasDefinedField(fields, 'location')) updates.location = fields.location
    if (hasDefinedField(fields, 'time')) updates.time = fields.time
    if (hasDefinedField(fields, 'result')) updates.result = fields.result
    if (hasDefinedField(fields, 'atmosphere')) updates.atmosphere = fields.atmosphere
    if (hasDefinedField(fields, 'shot_style')) updates.shotStyle = normalizeShotStyle(fields.shot_style)
    if (hasDefinedField(fields, 'image_prompt')) updates.imagePrompt = fields.image_prompt
    if (hasDefinedField(fields, 'video_prompt')) updates.videoPrompt = fields.video_prompt
    if (hasDefinedField(fields, 'bgm_prompt')) updates.bgmPrompt = fields.bgm_prompt
    if (hasDefinedField(fields, 'sound_effect')) updates.soundEffect = fields.sound_effect
    if (hasDefinedField(fields, 'description')) updates.description = formatStoryboardDescription(fields.description as string)
    if (hasPresentField(fields, 'scene_id')) updates.sceneId = fields.scene_id
    if (hasDefinedField(fields, 'duration')) updates.duration = fields.duration
    await db.update(schema.storyboards).set(updates).where(eq(schema.storyboards.id, storyboard_id))
    if (hasDefinedField(fields, 'character_ids')) await syncStoryboardCharacters(storyboard_id, (fields.character_ids as number[]) || [])
    if (hasDefinedField(fields, 'prop_ids')) await syncStoryboardProps(storyboard_id, (fields.prop_ids as number[]) || [])
    logTaskSuccess('StoryboardTool', 'update-complete', {
      episodeId,
      storyboardId: storyboard_id,
      updatedFields: Object.keys(updates),
      characterIds: hasDefinedField(fields, 'character_ids') ? ((fields.character_ids as number[]) || []).join(',') : undefined,
      propIds: hasDefinedField(fields, 'prop_ids') ? ((fields.prop_ids as number[]) || []).join(',') : undefined,
    })
    return { message: `Storyboard ${storyboard_id} updated` }
  },
})

/** 仅写 video_prompt，供 prompt_generator 使用，从 schema 上杜绝误改 description/atmosphere */
const updateStoryboardVideoPrompt = createTool({
  id: 'update_storyboard_video_prompt',
  description: 'Save video_prompt for one storyboard shot. Only updates video_prompt; cannot change description, atmosphere, or other fields.',
  inputSchema: z.object({
    storyboard_id: z.number(),
    video_prompt: z.string().min(1),
  }),
  execute: async ({ storyboard_id, video_prompt }, context) => {
    const ids = requireIds(context)
    if ('error' in ids) return ids
    const { episodeId } = ids
    const [storyboard] = await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboard_id))
    if (!storyboard) return { error: `Storyboard ${storyboard_id} not found` }
    if (storyboard.episodeId !== episodeId) {
      return { error: `Storyboard ${storyboard_id} does not belong to episode ${episodeId}` }
    }
    logTaskProgress('StoryboardTool', 'update-video-prompt-begin', {
      episodeId,
      storyboardId: storyboard_id,
    })
    await db.update(schema.storyboards).set({
      videoPrompt: video_prompt,
      updatedAt: now(),
    }).where(eq(schema.storyboards.id, storyboard_id))
    logTaskSuccess('StoryboardTool', 'update-video-prompt-complete', {
      episodeId,
      storyboardId: storyboard_id,
      updatedFields: ['updatedAt', 'videoPrompt'],
    })
    return { message: `Storyboard ${storyboard_id} video_prompt updated` }
  },
})

export const storyboardTools = {
  readStoryboardContext,
  saveStoryboards,
  updateStoryboard,
  updateStoryboardVideoPrompt,
}
