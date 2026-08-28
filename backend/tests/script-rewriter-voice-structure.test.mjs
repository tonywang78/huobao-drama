import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('script rewriter preserves source speech density instead of forcing dialogue', () => {
  const skill = read('workspace/skills/script-rewriter/SKILL.md')
  const agents = read('src/agents/index.ts')
  const tools = read('src/agents/tools/script-tools.ts')

  assert.doesNotMatch(skill, /对话驱动/)
  assert.match(skill, /保留原作说话密度/)
  assert.match(skill, /原文无人说话、纯描述时/)
  assert.match(skill, /仅当原文已有台词时/)

  assert.match(agents, /script_rewriter:[\s\S]*保留原作说话密度/)
  assert.match(agents, /原文无人说话则不要编对白/)

  assert.match(tools, /rewrite_to_screenplay/)
  assert.match(tools, /原文无人说话则不要编对白/)
  assert.match(tools, /保留原作说话密度/)
})
