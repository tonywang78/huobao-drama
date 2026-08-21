/**
 * 项目素材库硬删除：级联清理关联后物理删除资产行
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from './response.js'

export async function hardDeleteCharacter(characterId: number) {
  await db.delete(schema.episodeCharacters)
    .where(eq(schema.episodeCharacters.characterId, characterId))
  await db.delete(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.characterId, characterId))
  await db.delete(schema.sysTask)
    .where(eq(schema.sysTask.characterId, characterId))
  await db.delete(schema.characters)
    .where(eq(schema.characters.id, characterId))
}

export async function hardDeleteScene(sceneId: number) {
  await db.delete(schema.episodeScenes)
    .where(eq(schema.episodeScenes.sceneId, sceneId))
  await db.update(schema.storyboards)
    .set({ sceneId: null, updatedAt: now() })
    .where(eq(schema.storyboards.sceneId, sceneId))
  await db.delete(schema.sysTask)
    .where(eq(schema.sysTask.sceneId, sceneId))
  await db.delete(schema.scenes)
    .where(eq(schema.scenes.id, sceneId))
}

export async function hardDeleteProp(propId: number) {
  await db.delete(schema.episodeProps)
    .where(eq(schema.episodeProps.propId, propId))
  await db.delete(schema.storyboardProps)
    .where(eq(schema.storyboardProps.propId, propId))
  await db.delete(schema.sysTask)
    .where(eq(schema.sysTask.propId, propId))
  await db.delete(schema.props)
    .where(eq(schema.props.id, propId))
}
