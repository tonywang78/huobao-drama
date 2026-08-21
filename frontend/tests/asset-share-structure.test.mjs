import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('useApi exposes episode linkAssets and unlink helpers', () => {
  const useApi = read('app/composables/useApi.ts')

  assert.match(useApi, /availableAssets:/)
  assert.match(useApi, /linkAssets:/)
  assert.match(useApi, /unlinkCharacter:/)
  assert.match(useApi, /unlinkScene:/)
  assert.match(useApi, /unlinkProp:/)
  assert.match(useApi, /\/link-assets/)
  assert.match(useApi, /\/available-assets\?type=/)
})

test('episode workbench can pick from library and unlink instead of soft-delete', () => {
  const page = read('app/views/drama/episode.vue')

  assert.match(page, /从素材库选入/)
  assert.match(page, /openAssetPick\(/)
  assert.match(page, /confirmAssetPick/)
  assert.match(page, /episodeAPI\.linkAssets/)
  assert.match(page, /episodeAPI\.unlinkCharacter/)
  assert.match(page, /episodeAPI\.unlinkScene/)
  assert.match(page, /episodeAPI\.unlinkProp/)
  assert.match(page, /从本集移除/)
  assert.match(page, /其他集与项目素材库仍保留/)
  // 本集工作台不再调用实体软删
  assert.doesNotMatch(page, /characterAPI\.del\(/)
  assert.doesNotMatch(page, /sceneAPI\.del\(/)
  assert.doesNotMatch(page, /propAPI\.del\(/)
  assert.doesNotMatch(page, /从本剧所有集中移除/)
})

test('drama detail materials hide soft-deleted assets', () => {
  const page = read('app/views/drama/detail.vue')
  assert.match(page, /deleted_at \|\| m\.deletedAt/)
})

test('drama detail material library supports hard delete', () => {
  const page = read('app/views/drama/detail.vue')
  assert.match(page, /askDeleteMaterial/)
  assert.match(page, /confirmDeleteMaterial/)
  assert.match(page, /characterAPI\.del\(/)
  assert.match(page, /sceneAPI\.del\(/)
  assert.match(page, /propAPI\.del\(/)
  assert.match(page, /永久删除/)
  assert.match(page, /不可恢复/)
})
