import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readEpisodeWorkbenchSources } from './episode-workbench-sources.mjs'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('useApi exposes episode linkAssets and unlink helpers', () => {
  const useApi = read('app/composables/useApi.ts')

  assert.match(useApi, /availableAssets:/)
  assert.match(useApi, /linkAssets:/)
  assert.match(useApi, /unlinkAssets:/)
  assert.match(useApi, /unlinkCharacter:/)
  assert.match(useApi, /unlinkScene:/)
  assert.match(useApi, /unlinkProp:/)
  assert.match(useApi, /\/link-assets/)
  assert.match(useApi, /\/unlink-assets/)
  assert.match(useApi, /\/available-assets\?type=/)
})

test('episode assets panel supports batch unlink with select-all', () => {
  const page = readEpisodeWorkbenchSources()

  assert.match(page, /批量删除/)
  assert.match(page, /assetSelectMode/)
  assert.match(page, /enterAssetSelectMode/)
  assert.match(page, /exitAssetSelectMode/)
  assert.match(page, /toggleAssetSelect/)
  assert.match(page, /toggleSelectAllAssets/)
  assert.match(page, /askBatchDeleteAssets/)
  assert.match(page, /episodeAPI\.unlinkAssets/)
  assert.match(page, /移除已选/)
  assert.match(page, /全选/)
  assert.match(page, /其他集与项目素材库仍保留/)
  assert.match(page, /从共享库永久删除/)
  assert.match(page, /confirmDeleteAssetFromLibrary/)
  assert.match(page, /characterAPI\.del\(/)
  assert.match(page, /sceneAPI\.del\(/)
  assert.match(page, /propAPI\.del\(/)
  assert.match(page, /secondary-confirm-text="从共享库删除"/)
})

test('episode workbench can pick from library and unlink or hard-delete from shared library', () => {
  const page = readEpisodeWorkbenchSources()

  assert.match(page, /从素材库选入/)
  assert.match(page, /openAssetPick\(/)
  assert.match(page, /confirmAssetPick/)
  assert.match(page, /episodeAPI\.linkAssets/)
  assert.match(page, /episodeAPI\.unlinkCharacter/)
  assert.match(page, /episodeAPI\.unlinkScene/)
  assert.match(page, /episodeAPI\.unlinkProp/)
  assert.match(page, /从本集移除/)
  assert.match(page, /其他集与项目素材库仍保留/)
  assert.match(page, /从共享库删除/)
  assert.match(page, /confirmDeleteAssetFromLibrary/)
  assert.match(page, /characterAPI\.del\(/)
  assert.match(page, /sceneAPI\.del\(/)
  assert.match(page, /propAPI\.del\(/)
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
