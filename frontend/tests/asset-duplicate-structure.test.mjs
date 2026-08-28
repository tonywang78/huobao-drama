import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readEpisodeWorkbenchSources } from './episode-workbench-sources.mjs'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('useApi exposes duplicate for character scene and prop', () => {
  const useApi = read('app/composables/useApi.ts')

  assert.match(useApi, /characterAPI = \{[\s\S]*?duplicate: \(id: number/)
  assert.match(useApi, /sceneAPI = \{[\s\S]*?duplicate: \(id: number/)
  assert.match(useApi, /propAPI = \{[\s\S]*?duplicate: \(id: number/)
  assert.match(useApi, /\/characters\/\$\{id\}\/duplicate/)
  assert.match(useApi, /\/scenes\/\$\{id\}\/duplicate/)
  assert.match(useApi, /\/props\/\$\{id\}\/duplicate/)
})

test('episode workbench detail exposes 复制资产 action', () => {
  const page = readEpisodeWorkbenchSources()

  assert.match(page, /duplicateAsset/)
  assert.match(page, /duplicatingAsset/)
  assert.match(page, /characterAPI\.duplicate/)
  assert.match(page, /sceneAPI\.duplicate/)
  assert.match(page, /propAPI\.duplicate/)
  assert.match(page, /episode_id: epId\.value/)
  assert.match(page, /复制资产/)
})

test('AssetCard foot exposes duplicate icon next to upload/download', () => {
  const card = read('app/components/AssetCard.vue')
  const panel = read('app/components/episode/EpisodeAssetsPanel.vue')

  assert.match(card, /'duplicate'/)
  assert.match(card, /\$emit\('duplicate'\)/)
  assert.match(card, /duplicateTitle/)
  assert.match(panel, /@duplicate="wb\.duplicateAsset\('character', c\)"/)
  assert.match(panel, /@duplicate="wb\.duplicateAsset\('scene', s\)"/)
  assert.match(panel, /@duplicate="wb\.duplicateAsset\('prop', p\)"/)
})

test('drama detail material library exposes 复制资产 without episode_id', () => {
  const page = read('app/views/drama/detail.vue')

  assert.match(page, /duplicateMaterial/)
  assert.match(page, /duplicatingMaterial/)
  assert.match(page, /characterAPI\.duplicate\(m\.id\)/)
  assert.match(page, /sceneAPI\.duplicate\(m\.id\)/)
  assert.match(page, /propAPI\.duplicate\(m\.id\)/)
  assert.match(page, /复制资产/)
  assert.match(page, /@duplicate="duplicateMaterial\(m\)"/)
})
