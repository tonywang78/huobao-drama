import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyBindings,
  hasFirstLastFrameInjection,
  injectPlaceholders,
} from '../src/services/adapters/comfyui-common.ts'
import { ComfyUIVideoAdapter } from '../src/services/adapters/comfyui-video.ts'
import { MiniMaxVideoAdapter } from '../src/services/adapters/minimax-video.ts'

const baseConfig = {
  provider: 'comfyui',
  baseUrl: 'http://127.0.0.1:8188',
  apiKey: '',
  model: 'comfyui-first-last-default',
  serviceType: 'first_last' as const,
}

test('hasFirstLastFrameInjection accepts bindings or placeholders, otherwise fails', () => {
  assert.equal(hasFirstLastFrameInjection({
    ...baseConfig,
    settings: {
      workflowApi: {
        '1': { class_type: 'LoadImage', inputs: { image: 'x.png' } },
      },
      bindings: {},
    },
  }), false)

  assert.equal(hasFirstLastFrameInjection({
    ...baseConfig,
    settings: {
      workflowApi: {
        '17': { class_type: 'LoadImage', inputs: { image: '{{FIRST_FRAME}}' } },
        '18': { class_type: 'LoadImage', inputs: { image: '{{LAST_FRAME}}' } },
      },
    },
  }), true)

  assert.equal(hasFirstLastFrameInjection({
    ...baseConfig,
    settings: {
      workflowApi: {
        '17': { class_type: 'LoadImage', inputs: { image: 'x.png' } },
        '18': { class_type: 'LoadImage', inputs: { image: 'y.png' } },
      },
      bindings: {
        first_frame: { nodeId: '17', input: 'image' },
        last_frame: { nodeId: '18', input: 'image' },
      },
    },
  }), true)
})

test('first/last frames inject via dedicated keys, not image_N', () => {
  const workflow = {
    '17': { class_type: 'LoadImage', inputs: { image: '{{FIRST_FRAME}}' } },
    '18': { class_type: 'LoadImage', inputs: { image: '{{LAST_FRAME}}' } },
    '19': { class_type: 'LoadImage', inputs: { image: '{{IMAGE_1}}' } },
  }
  const withPlaceholders = injectPlaceholders(structuredClone(workflow), {
    firstFrame: 'first.png',
    lastFrame: 'last.png',
  }) as typeof workflow
  assert.equal(withPlaceholders['17'].inputs.image, 'first.png')
  assert.equal(withPlaceholders['18'].inputs.image, 'last.png')
  assert.equal(withPlaceholders['19'].inputs.image, '')

  const withBindings = applyBindings(
    {
      '17': { class_type: 'LoadImage', inputs: { image: 'x.png' } },
      '18': { class_type: 'LoadImage', inputs: { image: 'y.png' } },
      '19': { class_type: 'LoadImage', inputs: { image: 'keep.png' } },
    },
    {
      first_frame: { nodeId: '17', input: 'image' },
      last_frame: { nodeId: '18', input: 'image' },
      image_1: { nodeId: '19', input: 'image' },
    },
    { firstFrame: 'first.png', lastFrame: 'last.png' },
  ) as typeof workflow
  assert.equal(withBindings['17'].inputs.image, 'first.png')
  assert.equal(withBindings['18'].inputs.image, 'last.png')
  assert.equal(withBindings['19'].inputs.image, 'keep.png')
})

test('ComfyUI first_last rejects configs that cannot inject both frames', async () => {
  const adapter = new ComfyUIVideoAdapter()
  await assert.rejects(
    () => adapter.buildGenerateRequest(
      {
        ...baseConfig,
        settings: {
          workflowApi: {
            '1': { class_type: 'LoadImage', inputs: { image: 'foo.png' } },
          },
          bindings: {},
        },
      },
      {
        id: 1,
        prompt: 'walk',
        referenceMode: 'first_last',
        firstFrameUrl: 'http://example.com/first.png',
        lastFrameUrl: 'http://example.com/last.png',
      },
    ),
    /请在设置中为该 ComfyUI 首尾帧配置绑定首帧和尾帧节点/,
  )
})

test('MiniMax adapter emits first_frame and last_frame roles', () => {
  const adapter = new MiniMaxVideoAdapter()
  const req = adapter.buildGenerateRequest(
    { provider: 'minimax', baseUrl: 'https://api.minimaxi.com', apiKey: 'k', model: 'MiniMax-H3' },
    {
      id: 1,
      model: 'MiniMax-H3',
      prompt: '镜头从门口推到窗边',
      referenceMode: 'first_last',
      firstFrameUrl: 'https://cdn.example.com/first.png',
      lastFrameUrl: 'https://cdn.example.com/last.png',
      duration: 6,
    },
  )
  const content = (req.body as { content: Array<{ role?: string; type: string }> }).content
  assert.equal(content.some(item => item.role === 'first_frame'), true)
  assert.equal(content.some(item => item.role === 'last_frame'), true)
  assert.equal(content.some(item => item.role === 'reference_image'), false)
})
