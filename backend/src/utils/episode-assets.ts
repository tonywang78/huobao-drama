/**
 * 集 ↔ 角色/场景/道具 关联（幂等挂链 / 断链）
 */
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from './response.js'

export async function linkCharToEpisode(episodeId: number, characterId: number) {
  const existing = await db.select().from(schema.episodeCharacters)
    .where(and(
      eq(schema.episodeCharacters.episodeId, episodeId),
      eq(schema.episodeCharacters.characterId, characterId),
    ))
  if (!existing.length) {
    await db.insert(schema.episodeCharacters).values({ episodeId, characterId, createdAt: now() })
  }
}

export async function linkSceneToEpisode(episodeId: number, sceneId: number) {
  const existing = await db.select().from(schema.episodeScenes)
    .where(and(
      eq(schema.episodeScenes.episodeId, episodeId),
      eq(schema.episodeScenes.sceneId, sceneId),
    ))
  if (!existing.length) {
    await db.insert(schema.episodeScenes).values({ episodeId, sceneId, createdAt: now() })
  }
}

export async function linkPropToEpisode(episodeId: number, propId: number) {
  const existing = await db.select().from(schema.episodeProps)
    .where(and(
      eq(schema.episodeProps.episodeId, episodeId),
      eq(schema.episodeProps.propId, propId),
    ))
  if (!existing.length) {
    await db.insert(schema.episodeProps).values({ episodeId, propId, createdAt: now() })
  }
}

export async function unlinkCharFromEpisode(episodeId: number, characterId: number) {
  await db.delete(schema.episodeCharacters)
    .where(and(
      eq(schema.episodeCharacters.episodeId, episodeId),
      eq(schema.episodeCharacters.characterId, characterId),
    ))
}

export async function unlinkSceneFromEpisode(episodeId: number, sceneId: number) {
  await db.delete(schema.episodeScenes)
    .where(and(
      eq(schema.episodeScenes.episodeId, episodeId),
      eq(schema.episodeScenes.sceneId, sceneId),
    ))
}

export async function unlinkPropFromEpisode(episodeId: number, propId: number) {
  await db.delete(schema.episodeProps)
    .where(and(
      eq(schema.episodeProps.episodeId, episodeId),
      eq(schema.episodeProps.propId, propId),
    ))
}
