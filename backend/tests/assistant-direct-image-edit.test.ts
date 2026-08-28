import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  looksLikeFieldEditIntent,
  looksLikeImageEditIntent,
  shouldDirectImageEdit,
  shouldSkipDirectImageEditFallback,
} from '../src/services/assistant-image-intent.ts'

const root = new URL('..', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')

test('field edit phrases are not treated as image-edit intent', () => {
  assert.equal(looksLikeFieldEditIntent('把外貌改成短发圆脸'), true)
  assert.equal(looksLikeFieldEditIntent('修改角色样貌描述'), true)
  assert.equal(looksLikeFieldEditIntent('更新 appearance 字段'), true)
  assert.equal(looksLikeFieldEditIntent('改一下 final_prompt'), true)

  assert.equal(looksLikeImageEditIntent('把外貌改成短发圆脸'), false)
  assert.equal(looksLikeImageEditIntent('修改角色样貌描述'), false)
  assert.equal(looksLikeImageEditIntent('更新 appearance 字段'), false)
})

test('explicit image-edit phrases still match', () => {
  assert.equal(looksLikeImageEditIntent('把图片里的人去掉'), true)
  assert.equal(looksLikeImageEditIntent('改图：背景暗一点'), true)
  assert.equal(looksLikeImageEditIntent('换背景成海边'), true)
  assert.equal(looksLikeImageEditIntent('图生图换衣服'), true)
})

test('shouldDirectImageEdit does not fire for asset field edits with @asset', () => {
  const base = {
    text: '@小明 把外貌改成短发圆脸',
    stripped: '把外貌改成短发圆脸',
    hasGeneratedRef: false,
    hasAssetRef: true,
    hasAttachment: false,
    hasLatestGenerated: false,
  }
  assert.equal(shouldDirectImageEdit(base), false)
})

test('shouldDirectImageEdit does not fire merely because asset has image and text is non-empty', () => {
  assert.equal(shouldDirectImageEdit({
    text: '@小明 帮我看看这个角色设定怎么样',
    stripped: '帮我看看这个角色设定怎么样',
    hasGeneratedRef: false,
    hasAssetRef: true,
    hasAttachment: false,
    hasLatestGenerated: false,
  }), false)
})

test('shouldDirectImageEdit still fires for clear img2img with asset ref', () => {
  assert.equal(shouldDirectImageEdit({
    text: '@小明 改图，把背景换成夜晚街道',
    stripped: '改图，把背景换成夜晚街道',
    hasGeneratedRef: false,
    hasAssetRef: true,
    hasAttachment: false,
    hasLatestGenerated: false,
  }), true)
})

test('shouldSkipDirectImageEditFallback after successful field write', () => {
  assert.equal(shouldSkipDirectImageEditFallback({
    imageTasksLength: 0,
    needsRefFallback: true,
    didWrite: true,
  }), true)
  assert.equal(shouldSkipDirectImageEditFallback({
    imageTasksLength: 0,
    needsRefFallback: false,
    didWrite: false,
  }), false)
})

test('update_asset tool and skill document field edits', () => {
  const tools = read('src/agents/tools/assistant-tools.ts')
  const skill = read('workspace/skills/studio-assistant/SKILL.md')
  const route = read('src/routes/assistant.ts')

  assert.match(tools, /id: 'update_asset'/)
  assert.match(tools, /updateAsset/)
  assert.match(skill, /update_asset/)
  assert.match(skill, /改字段/)
  assert.match(route, /shouldSkipDirectImageEditFallback/)
})
