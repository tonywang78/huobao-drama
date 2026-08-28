import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('episode asset detail shows img2img snippet chips', () => {
  const dialog = read('app/components/episode/EpisodeAssetDetailDialog.vue')
  assert.match(dialog, /asset-edit-snippet-chips/)
  assert.match(dialog, /applyAssetEditSnippet/)
  assert.match(dialog, /filterSnippetsForAssetType/)
  assert.match(dialog, /assistantAPI\.listSnippets/)
})

test('drama material detail shows img2img snippet chips', () => {
  const detail = read('app/views/drama/detail.vue')
  assert.match(detail, /mat-edit-snippet-chips/)
  assert.match(detail, /applyMatEditSnippet/)
  assert.match(detail, /filterSnippetsForAssetType/)
})

test('assistant snippet forms expose asset_type', () => {
  const panel = read('app/components/assistant/AssistantPanel.vue')
  const assistant = read('app/composables/useStudioAssistant.ts')
  const useApi = read('app/composables/useApi.ts')

  assert.match(panel, /适用资产/)
  assert.match(panel, /snippetSave\.assetType/)
  assert.match(panel, /snippetEdit\.assetType/)
  assert.match(assistant, /asset_type:/)
  assert.match(assistant, /filterSnippetsForAssetType/)
  assert.match(useApi, /asset_type\?:/)
})
