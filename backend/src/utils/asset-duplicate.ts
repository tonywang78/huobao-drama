/**
 * 角色 / 场景 / 道具：同剧复制为新实体（文本 + 主图字段，不拷图历史 / 分镜绑定）
 */
import { eq } from 'drizzle-orm'
import { db, getInsertId, schema } from '../db/index.js'
import { now } from './response.js'
import { linkCharToEpisode, linkPropToEpisode, linkSceneToEpisode } from './episode-assets.js'

const COPY_SUFFIX = ' 副本'

export type DuplicateResult<T> =
  | { ok: true; row: T }
  | { ok: false; code: 'not_found' | 'bad_episode'; message: string }

async function assertEpisodeInDrama(episodeId: number, dramaId: number): Promise<DuplicateResult<never> | null> {
  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId))
  if (!ep || ep.deletedAt || ep.dramaId !== dramaId) {
    return { ok: false, code: 'bad_episode', message: '集不存在或不属于当前项目' }
  }
  return null
}

function withCopySuffix(label: string | null | undefined) {
  const base = String(label || '').trim() || '未命名'
  return `${base}${COPY_SUFFIX}`
}

export async function duplicateCharacter(
  id: number,
  episodeId?: number | null,
): Promise<DuplicateResult<typeof schema.characters.$inferSelect>> {
  const [src] = await db.select().from(schema.characters).where(eq(schema.characters.id, id))
  if (!src || src.deletedAt) return { ok: false, code: 'not_found', message: '角色不存在' }

  const epId = episodeId != null ? Number(episodeId) : null
  if (epId) {
    const bad = await assertEpisodeInDrama(epId, src.dramaId)
    if (bad) return bad
  }

  const ts = now()
  const res = await db.insert(schema.characters).values({
    dramaId: src.dramaId,
    name: withCopySuffix(src.name),
    role: src.role || '',
    description: src.description || '',
    appearance: src.appearance || '',
    styling: src.styling || '',
    personality: src.personality || null,
    finalPrompt: src.finalPrompt || null,
    imageUrl: src.imageUrl || null,
    localPath: src.localPath || null,
    referenceImages: src.referenceImages || null,
    seedValue: src.seedValue || null,
    createdAt: ts,
    updatedAt: ts,
  })
  const newId = getInsertId(res)
  if (epId) await linkCharToEpisode(epId, newId)

  const [row] = await db.select().from(schema.characters).where(eq(schema.characters.id, newId))
  return { ok: true, row }
}

export async function duplicateScene(
  id: number,
  episodeId?: number | null,
): Promise<DuplicateResult<typeof schema.scenes.$inferSelect>> {
  const [src] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, id))
  if (!src || src.deletedAt) return { ok: false, code: 'not_found', message: '场景不存在' }

  const epId = episodeId != null ? Number(episodeId) : null
  if (epId) {
    const bad = await assertEpisodeInDrama(epId, src.dramaId)
    if (bad) return bad
  }

  const ts = now()
  const res = await db.insert(schema.scenes).values({
    dramaId: src.dramaId,
    episodeId: epId || null,
    location: withCopySuffix(src.location),
    time: src.time || '',
    prompt: src.prompt || '',
    lighting: src.lighting || '',
    finalPrompt: src.finalPrompt || null,
    storyboardCount: src.storyboardCount ?? 1,
    imageUrl: src.imageUrl || null,
    localPath: src.localPath || null,
    status: src.status || 'pending',
    createdAt: ts,
    updatedAt: ts,
  })
  const newId = getInsertId(res)
  if (epId) await linkSceneToEpisode(epId, newId)

  const [row] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, newId))
  return { ok: true, row }
}

export async function duplicateProp(
  id: number,
  episodeId?: number | null,
): Promise<DuplicateResult<typeof schema.props.$inferSelect>> {
  const [src] = await db.select().from(schema.props).where(eq(schema.props.id, id))
  if (!src || src.deletedAt) return { ok: false, code: 'not_found', message: '道具不存在' }

  const epId = episodeId != null ? Number(episodeId) : null
  if (epId) {
    const bad = await assertEpisodeInDrama(epId, src.dramaId)
    if (bad) return bad
  }

  const ts = now()
  const res = await db.insert(schema.props).values({
    dramaId: src.dramaId,
    name: withCopySuffix(src.name),
    type: src.type || '',
    description: src.description || '',
    prompt: src.prompt || null,
    finalPrompt: src.finalPrompt || null,
    imageUrl: src.imageUrl || null,
    localPath: src.localPath || null,
    referenceImages: src.referenceImages || null,
    createdAt: ts,
    updatedAt: ts,
  })
  const newId = getInsertId(res)
  if (epId) await linkPropToEpisode(epId, newId)

  const [row] = await db.select().from(schema.props).where(eq(schema.props.id, newId))
  return { ok: true, row }
}
