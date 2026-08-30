import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('prompt_generator video prompt format uses @name references instead of XML tags', () => {
  const agents = read('src/agents/index.ts')
  const skill = read('workspace/skills/prompt-generator/video-prompt/SKILL.md')
  const engine = read('src/services/video-engine.ts')

  // 场景/角色/道具用 @名字 引用（名字必须与列表完全一致）
  assert.match(agents, /@场景名/)
  assert.match(agents, /@角色名/)
  assert.match(agents, /@道具名/)
  assert.match(agents, /@志远 → @图片1志远/)
  assert.match(agents, /场景\/角色\/道具列表/)
  assert.doesNotMatch(agents, /<location>/)
  assert.doesNotMatch(agents, /<role>/)

  // SKILL.md 同步：绑定道具出现时必须 @道具名
  assert.match(skill, /@场景名/)
  assert.match(skill, /@角色名/)
  assert.match(skill, /@道具名/)
  assert.match(skill, /必须写 `@道具名`/)
  assert.match(skill, /@小明.*@图片1小明/)
  assert.doesNotMatch(skill, /<location>/)
  assert.doesNotMatch(skill, /<role>/)

  // 用户消息拼装也要求三类引用
  assert.match(engine, /@角色名\/@场景名\/@道具名/)
})
