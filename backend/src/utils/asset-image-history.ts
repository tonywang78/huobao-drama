import { db, getInsertId, schema } from '../db/index.js'
import { now } from './response.js'

export interface RecordAssetImageHistoryParams {
  dramaId: number
  localPath: string
  characterId?: number
  sceneId?: number
  propId?: number
  source?: 'upload' | 'generation'
}

/** 上传或手动切换主图时写入 sys_task，供素材历史列表展示 */
export async function recordAssetImageHistory(params: RecordAssetImageHistoryParams): Promise<number> {
  const ts = now()
  const res = await db.insert(schema.sysTask).values({
    type: 'image',
    dramaId: params.dramaId,
    characterId: params.characterId,
    sceneId: params.sceneId,
    propId: params.propId,
    localPath: params.localPath,
    resultUrl: params.localPath,
    status: 'completed',
    params: JSON.stringify({ source: params.source || 'upload' }),
    createdAt: ts,
    updatedAt: ts,
    completedAt: ts,
  })
  return getInsertId(res)
}

export function shouldRecordImageHistory(
  body: Record<string, unknown>,
  currentImageUrl: string | null | undefined,
  newImageUrl: string | undefined,
): boolean {
  if (body.skip_image_history || body.skipImageHistory) return false
  if (newImageUrl === undefined || !newImageUrl) return false
  return newImageUrl !== (currentImageUrl || '')
}
