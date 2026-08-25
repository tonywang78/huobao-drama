import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildVideoPromptUserMessage,
  fallbackVideoEngine,
  loadVideoEngineSkill,
  resolveVideoEngine,
  videoEngineSkillId,
} from '../src/services/video-engine.ts'
import { refreshSkillWorkspaces } from '../src/agents/skills.ts'

test('fallbackVideoEngine maps provider when settings missing', () => {
  assert.equal(fallbackVideoEngine('minimax'), 'minimax-h3')
  assert.equal(fallbackVideoEngine('volcengine'), 'seedance')
  assert.equal(fallbackVideoEngine('comfyui'), 'default')
  assert.equal(fallbackVideoEngine(null), 'default')
})

test('resolveVideoEngine prefers settings.videoEngine over provider', () => {
  assert.equal(
    resolveVideoEngine({ provider: 'comfyui', settings: { videoEngine: 'minimax-h3' } }),
    'minimax-h3',
  )
  assert.equal(
    resolveVideoEngine({ provider: 'minimax', settings: null }),
    'minimax-h3',
  )
  assert.equal(
    resolveVideoEngine({ provider: 'comfyui', settings: { workflowApi: {} } }),
    'default',
  )
  assert.equal(
    resolveVideoEngine({ provider: 'comfyui', settings: JSON.stringify({ videoEngine: 'seedance' }) }),
    'seedance',
  )
})

test('videoEngineSkillId follows Skills UI path', () => {
  assert.equal(videoEngineSkillId('minimax-h3'), 'prompt-generator/video-engines/minimax-h3')
})

test('loadVideoEngineSkill reads minimax-h3 via workspace filesystem', async () => {
  await refreshSkillWorkspaces()
  const body = await loadVideoEngineSkill('minimax-h3')
  assert.ok(body.includes('minimax-h3'))
  assert.ok(body.includes('多参考图'))
})

test('buildVideoPromptUserMessage embeds engine skill', async () => {
  const skill = await loadVideoEngineSkill('minimax-h3')
  const msg = buildVideoPromptUserMessage({
    storyboardNumber: 3,
    storyboardId: 42,
    configLabel: 'Comfy · MiniMax H3 (comfyui)',
    engine: 'minimax-h3',
    engineSkill: skill,
  })
  assert.match(msg, /videoEngine: minimax-h3/)
  assert.match(msg, /当前引擎规范/)
  assert.ok(msg.includes('多参考图'))
  assert.match(msg, /分镜 #3\(ID:42\)/)
})
