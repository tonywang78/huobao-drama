import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readEpisodeWorkbenchSources } from './episode-workbench-sources.mjs'
import { readFileSync } from 'node:fs'

const workbench = readEpisodeWorkbenchSources()
const detailPage = readFileSync(new URL('../app/views/drama/detail.vue', import.meta.url), 'utf8')

function fnBody(source, name) {
  const start = source.indexOf(`async function ${name}`)
  assert.notEqual(start, -1, `missing ${name}`)
  const next = source.slice(start + 1).search(/\n  (async )?function /)
  return next === -1 ? source.slice(start) : source.slice(start, start + 1 + next)
}

test('regenerating an asset prompt persists edited description first and always force-regenerates', () => {
  const genFn = fnBody(workbench, 'genAssetFinalPrompt')
  const saveFn = fnBody(workbench, 'saveAssetDetail')

  // 点「重新生成」时先把弹窗里改过的场景描述/光影写回后端
  assert.match(genFn, /persistAssetInfoIfDirty|saveAssetDetail\(\{\s*silent:\s*true/)
  // 用户明确点生成/重新生成时必须 force，避免后端因旧 finalPrompt 直接返回
  assert.match(genFn, /ensureAssetPrompt\(detail\.type, detail\.item\.id, true\)/)
  assert.doesNotMatch(genFn, /const force = !!assetFinalPrompt\.value/)

  // 保存信息字段变更时把最终提示词真正置空（后端不再自动清）
  assert.match(saveFn, /payload\.final_prompt = ''/)
})

test('material library regenerate also saves the edited scene description first', () => {
  const start = detailPage.indexOf('async function generateFinalPrompt')
  const end = detailPage.indexOf('function closeEdit')
  assert.ok(start >= 0 && end > start, 'generateFinalPrompt should precede closeEdit')
  const genFn = detailPage.slice(start, end)
  assert.match(genFn, /sceneAPI\.update/)
  assert.match(genFn, /editDraft\.prompt/)
  assert.match(genFn, /editDraft\.lighting/)
})
