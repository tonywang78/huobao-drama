/**
 * Skill selection unit checks (no Mastra runtime)
 */
import assert from 'node:assert/strict'
import { resolveSkillSelection, parseRawSkillSelection, validateSkillIds } from '../src/agents/skills.ts'

// 未传 → null（全量兼容）
assert.equal(resolveSkillSelection('script_rewriter', null), null)
assert.equal(resolveSkillSelection('script_rewriter', parseRawSkillSelection({})), null)

// 显式 include_base + skill_ids
{
  const sel = resolveSkillSelection('script_rewriter', {
    include_base: false,
    skill_ids: [],
  })
  assert.deepEqual(sel, { includeBase: false, skillIds: [], profileId: undefined })
}

// video-engines 拒绝
assert.throws(
  () => validateSkillIds('prompt_generator', ['prompt-generator/video-engines/seedance']),
  /videoEngine/,
)

// 不属于该 Agent
assert.throws(
  () => validateSkillIds('script_rewriter', ['extractor']),
  /不属于/,
)

console.log('skill-selection tests passed')
