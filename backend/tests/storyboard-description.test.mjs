import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const root = new URL('..', import.meta.url)
const util = readFileSync(new URL('src/utils/storyboard-description.ts', root), 'utf8')
const tools = readFileSync(new URL('src/agents/tools/storyboard-tools.ts', root), 'utf8')
const skill = readFileSync(new URL('workspace/skills/storyboard-breaker/SKILL.md', root), 'utf8')

/** 与 utils/storyboard-description.ts 保持一致，便于纯 node 结构+行为校验 */
function formatStoryboardDescription(text) {
  if (text == null) return ''
  const raw = String(text).replace(/\r\n/g, '\n').trim()
  if (!raw) return ''
  return raw
    .replace(/([^\n])[ \t]*(【镜头\d+】)/g, '$1\n\n$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

test('storyboard description util and save path require newlines', () => {
  assert.match(util, /formatStoryboardDescription/)
  assert.match(util, /【镜头\\d\+】/)
  assert.match(tools, /formatStoryboardDescription\(sb\.description\)/)
  assert.match(tools, /formatStoryboardDescription\(fields\.description/)
  assert.match(skill, /每个 `【镜头N】` 必须单独起一行/)
})

test('formatStoryboardDescription inserts newlines before each 【镜头N】', () => {
  const raw = '【镜头1】中景：海风吹来。旁白：一句话。【镜头2】特写：书页翻飞。【镜头3】近景：按下书页。'
  const out = formatStoryboardDescription(raw)
  assert.equal(out, [
    '【镜头1】中景：海风吹来。旁白：一句话。',
    '',
    '【镜头2】特写：书页翻飞。',
    '',
    '【镜头3】近景：按下书页。',
  ].join('\n'))
})

test('formatStoryboardDescription keeps already-wrapped descriptions', () => {
  const raw = '【镜头1】甲\n\n【镜头2】乙'
  assert.equal(formatStoryboardDescription(raw), '【镜头1】甲\n\n【镜头2】乙')
})
