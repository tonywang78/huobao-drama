import { Hono } from 'hono'
import { and, desc, eq, gte } from 'drizzle-orm'
import { db, getInsertId, schema } from '../db/index.js'
import { success, created, now, badRequest } from '../utils/response.js'
import { toSnakeCase } from '../utils/transform.js'
import { logTaskPayload, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { applyShotStyle, normalizeShotStyle } from '../services/shot-style.js'
import { formatStoryboardDescription } from '../utils/storyboard-description.js'

const app = new Hono()

async function syncStoryboardCharacters(storyboardId: number, characterIds: number[]) {
  await db.delete(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))


  const uniqueIds = [...new Set((characterIds || []).filter(Boolean))]
  if (!uniqueIds.length) return

  for (const characterId of uniqueIds) {
    await db.insert(schema.storyboardCharacters).values({
      storyboardId,
      characterId,
    })
  }
}

async function getStoryboardCharacterIds(storyboardId: number) {
  const links = await db.select().from(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))
  return links.map(link => link.characterId)
}

async function syncStoryboardProps(storyboardId: number, propIds: number[]) {
  await db.delete(schema.storyboardProps)
    .where(eq(schema.storyboardProps.storyboardId, storyboardId))

  const uniqueIds = [...new Set((propIds || []).filter(Boolean))]
  if (!uniqueIds.length) return

  for (const propId of uniqueIds) {
    await db.insert(schema.storyboardProps).values({
      storyboardId,
      propId,
    })
  }
}

async function getStoryboardPropIds(storyboardId: number) {
  const links = await db.select().from(schema.storyboardProps)
    .where(eq(schema.storyboardProps.storyboardId, storyboardId))
  return links.map(link => link.propId)
}

async function validateStoryboardBindings(episodeId: number, sceneId: number | null | undefined, characterIds: number[] | undefined, propIds?: number[] | undefined) {
  const sceneLinks = await db.select().from(schema.episodeScenes)
    .where(eq(schema.episodeScenes.episodeId, episodeId))
  const episodeSceneIds = new Set(sceneLinks.map(link => link.sceneId))
  const characterLinks = await db.select().from(schema.episodeCharacters)
    .where(eq(schema.episodeCharacters.episodeId, episodeId))
  const episodeCharacterIds = new Set(characterLinks.map(link => link.characterId))
  const propLinks = await db.select().from(schema.episodeProps)
    .where(eq(schema.episodeProps.episodeId, episodeId))
  const episodePropIds = new Set(propLinks.map(link => link.propId))

  if (sceneId != null && !episodeSceneIds.has(sceneId)) {
    throw new Error('scene_id 必须来自当前集已关联场景')
  }

  const invalidCharacterIds = (characterIds || []).filter(id => !episodeCharacterIds.has(id))
  if (invalidCharacterIds.length) {
    throw new Error('character_ids 必须来自当前集已关联角色')
  }

  const invalidPropIds = (propIds || []).filter(id => !episodePropIds.has(id))
  if (invalidPropIds.length) {
    throw new Error('prop_ids 必须来自当前集已关联道具')
  }
}

async function resolveInsertStoryboardNumber(
  episodeId: number,
  afterId: number | null | undefined,
  beforeId: number | null | undefined,
): Promise<{ ok: true, number: number } | { ok: false, message: string }> {
  if (afterId != null && beforeId != null) {
    return { ok: false, message: 'after_storyboard_id 与 before_storyboard_id 不能同时传入' }
  }

  if (afterId != null) {
    const [anchor] = await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, afterId))
    if (!anchor || anchor.episodeId !== episodeId) {
      return { ok: false, message: 'after_storyboard_id 必须属于当前集' }
    }
    return { ok: true, number: anchor.storyboardNumber + 1 }
  }

  if (beforeId != null) {
    const [anchor] = await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, beforeId))
    if (!anchor || anchor.episodeId !== episodeId) {
      return { ok: false, message: 'before_storyboard_id 必须属于当前集' }
    }
    return { ok: true, number: anchor.storyboardNumber }
  }

  const existing = await db.select({ storyboardNumber: schema.storyboards.storyboardNumber })
    .from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
  const maxNum = existing.reduce((m, row) => Math.max(m, row.storyboardNumber || 0), 0)
  return { ok: true, number: maxNum + 1 }
}

async function shiftStoryboardNumbers(episodeId: number, fromNumber: number, ts: string) {
  const toShift = await db.select().from(schema.storyboards)
    .where(and(
      eq(schema.storyboards.episodeId, episodeId),
      gte(schema.storyboards.storyboardNumber, fromNumber),
    ))
    .orderBy(desc(schema.storyboards.storyboardNumber))

  for (const row of toShift) {
    await db.update(schema.storyboards)
      .set({ storyboardNumber: row.storyboardNumber + 1, updatedAt: ts })
      .where(eq(schema.storyboards.id, row.id))
  }
}

async function refreshEpisodeDuration(episodeId: number, ts: string) {
  const rows = await db.select({ duration: schema.storyboards.duration })
    .from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
  const totalSeconds = rows.reduce((sum, row) => sum + (row.duration || 10), 0)
  await db.update(schema.episodes)
    .set({ duration: Math.ceil(totalSeconds / 60), updatedAt: ts })
    .where(eq(schema.episodes.id, episodeId))
}

// POST /storyboards
app.post('/', async (c) => {
  const body = await c.req.json()
  const episodeId = Number(body.episode_id)
  if (!episodeId) return badRequest(c, 'episode_id 必填')

  const afterId = body.after_storyboard_id != null ? Number(body.after_storyboard_id) : null
  const beforeId = body.before_storyboard_id != null ? Number(body.before_storyboard_id) : null
  const ts = now()

  const resolved = await resolveInsertStoryboardNumber(episodeId, afterId, beforeId)
  if (!resolved.ok) return badRequest(c, resolved.message)

  logTaskStart('StoryboardAPI', 'create', {
    episodeId,
    shotNumber: resolved.number,
    afterId,
    beforeId,
    sceneId: body.scene_id,
    characterIds: body.character_ids,
  })
  logTaskPayload('StoryboardAPI', 'create body', body)

  try {
    await validateStoryboardBindings(episodeId, body.scene_id, body.character_ids, body.prop_ids)
  } catch (err: any) {
    return badRequest(c, err?.message || '绑定校验失败')
  }

  await shiftStoryboardNumbers(episodeId, resolved.number, ts)

  const res = await db.insert(schema.storyboards).values({
    episodeId,
    storyboardNumber: resolved.number,
    title: body.title,
    description: body.description,
    sceneId: body.scene_id,
    duration: body.duration || 10,
    createdAt: ts,
    updatedAt: ts,
  })
  const insertId = getInsertId(res)
  await syncStoryboardCharacters(insertId, body.character_ids || [])
  await syncStoryboardProps(insertId, body.prop_ids || [])
  await refreshEpisodeDuration(episodeId, ts)

  const [result] = await db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.id, insertId))
  logTaskSuccess('StoryboardAPI', 'create', {
    storyboardId: result.id,
    episodeId: result.episodeId,
    shotNumber: result.storyboardNumber,
  })
  return created(c, {
    ...toSnakeCase(result),
    character_ids: await getStoryboardCharacterIds(result.id),
    prop_ids: await getStoryboardPropIds(result.id),
  })
})

// PUT /storyboards/:id
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [storyboard] = await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, id))
  if (!storyboard) return badRequest(c, '镜头不存在')
  logTaskStart('StoryboardAPI', 'update', {
    storyboardId: id,
    episodeId: storyboard.episodeId,
    fields: Object.keys(body),
  })
  logTaskPayload('StoryboardAPI', 'update body', body)

  const fieldMap: Record<string, string> = {
    title: 'title', description: 'description', shot_type: 'shotType',
    angle: 'angle', movement: 'movement', duration: 'duration',
    video_prompt: 'videoPrompt',
    first_last_prompt: 'firstLastPrompt',
    first_frame_prompt: 'firstFramePrompt',
    last_frame_prompt: 'lastFramePrompt',
    image_prompt: 'imagePrompt', scene_id: 'sceneId', location: 'location',
    time: 'time', atmosphere: 'atmosphere', result: 'result',
    shot_style: 'shotStyle',
    bgm_prompt: 'bgmPrompt', sound_effect: 'soundEffect',
    video_url: 'videoUrl',
    first_frame_image: 'firstFrameImage',
    last_frame_image: 'lastFrameImage',
  }

  const updates: Record<string, any> = { updatedAt: now() }
  for (const [snakeKey, camelKey] of Object.entries(fieldMap)) {
    if (snakeKey in body) {
      let value = body[snakeKey]
      if (snakeKey === 'shot_style') value = normalizeShotStyle(value)
      if (snakeKey === 'description') value = formatStoryboardDescription(value)
      updates[camelKey] = value
    }
  }

  await validateStoryboardBindings(
    storyboard.episodeId,
    'scene_id' in body ? body.scene_id : storyboard.sceneId,
    'character_ids' in body ? body.character_ids : await getStoryboardCharacterIds(id),
    'prop_ids' in body ? body.prop_ids : await getStoryboardPropIds(id),
  )

  await db.update(schema.storyboards).set(updates).where(eq(schema.storyboards.id, id))
  if ('character_ids' in body) await syncStoryboardCharacters(id, body.character_ids || [])
  if ('prop_ids' in body) await syncStoryboardProps(id, body.prop_ids || [])
  logTaskSuccess('StoryboardAPI', 'update', {
    storyboardId: id,
    updatedFields: Object.keys(updates),
    characterIds: body.character_ids,
    propIds: body.prop_ids,
  })
  return success(c)
})

// POST /storyboards/:id/apply-shot-style — 改镜头风格并按风格包重写 description
app.post('/:id/apply-shot-style', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  try {
    const result = await applyShotStyle({
      storyboardId: id,
      shotStyle: body.shot_style ?? body.shotStyle,
      model: body.text_model || body.textModel || body.model,
      configId: body.text_config_id || body.textConfigId || body.config_id || body.configId,
    })
    return success(c, result)
  } catch (err: any) {
    return badRequest(c, err?.message || '应用镜头风格失败')
  }
})

// DELETE /storyboards/:id — 同时清理角色/道具绑定与关联 sys_task（视频生成记录）
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  logTaskStart('StoryboardAPI', 'delete', { storyboardId: id })
  await db.delete(schema.storyboardCharacters).where(eq(schema.storyboardCharacters.storyboardId, id))
  await db.delete(schema.storyboardProps).where(eq(schema.storyboardProps.storyboardId, id))
  await db.delete(schema.sysTask).where(eq(schema.sysTask.storyboardId, id))
  await db.delete(schema.storyboards).where(eq(schema.storyboards.id, id))
  logTaskSuccess('StoryboardAPI', 'delete', { storyboardId: id })
  return success(c)
})

export default app
