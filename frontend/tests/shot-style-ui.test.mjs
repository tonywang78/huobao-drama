import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')

test('storyboard panel exposes shot style control via apply API', () => {
  const panel = read('app/components/episode/EpisodeStoryboardPanel.vue')
  const wb = read('app/composables/useEpisodeWorkbench.ts')
  const api = read('app/composables/useApi.ts')

  assert.match(panel, /镜头风格/)
  assert.match(panel, /wb\.changeShotStyle/)
  assert.match(panel, /wb\.SHOT_STYLE_OPTIONS/)
  assert.match(panel, /shot-style-chip/)

  assert.match(wb, /changeShotStyle/)
  assert.match(wb, /rewriteShotStyleDescription/)
  assert.match(wb, /applyShotStyle/)
  assert.match(wb, /只改标签，不触发生成/)
  assert.match(panel, /按风格重写/)
  assert.match(api, /applyShotStyle/)
  assert.match(api, /\/apply-shot-style/)
})
