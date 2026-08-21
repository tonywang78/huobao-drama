import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('prompt_generator only gets update_storyboard_video_prompt tool', () => {
  const agents = read('src/agents/index.ts')
  const toolsBlock = agents.match(
    /prompt_generator:\s*\{[\s\S]*?updateStoryboardVideoPrompt:\s*storyboardTools\.updateStoryboardVideoPrompt,?\s*\},/,
  )
  assert.ok(toolsBlock, 'prompt_generator should wire updateStoryboardVideoPrompt')
  assert.doesNotMatch(toolsBlock[0], /updateStoryboard:\s*storyboardTools\.updateStoryboard/)
  assert.match(agents, /update_storyboard_video_prompt/)
})

test('update_storyboard_video_prompt tool only writes video_prompt', () => {
  const tools = read('src/agents/tools/storyboard-tools.ts')
  assert.match(tools, /id:\s*'update_storyboard_video_prompt'/)
  assert.match(tools, /videoPrompt:\s*video_prompt/)
  assert.match(tools, /function hasDefinedField/)
  assert.match(tools, /function hasPresentField/)
})

test('video-prompt skill saves via dedicated tool', () => {
  const skill = read('workspace/skills/prompt-generator/video-prompt/SKILL.md')
  assert.match(skill, /update_storyboard_video_prompt/)
  assert.doesNotMatch(skill, /调用 `update_storyboard` 仅更新/)
})
