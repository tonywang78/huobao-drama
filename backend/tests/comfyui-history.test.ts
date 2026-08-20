import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isPromptInComfyQueuePayload,
  parseComfyHistory,
} from '../src/services/adapters/comfyui-common.ts'

/** RunningHub 实测：mp4 落在 images，且只有 status_str=success */
const runningHubHistory = {
  '2090462714383269889': {
    outputs: {
      '92': {
        images: [{
          filename: 'MiniMax_H3_00001_prlvg_1787240406.mp4',
          subfolder: '0cf5b8aebf695755a4f6346138c63a31/video',
          type: 'output',
        }],
      },
    },
    status: { status_str: 'success' },
  },
}

const baseConfig = {
  provider: 'comfyui',
  baseUrl: 'https://www.runninghub.cn/proxy-plus/demo-key',
  apiKey: '',
  model: 'comfy',
}

test('parseComfyHistory completes RunningHub video in images + status_str success', () => {
  const parsed = parseComfyHistory(
    runningHubHistory,
    '2090462714383269889',
    baseConfig,
    true,
  )
  assert.equal(parsed.status, 'completed')
  assert.match(String(parsed.mediaUrl), /MiniMax_H3_00001_prlvg_1787240406\.mp4/)
  assert.match(String(parsed.mediaUrl), /subfolder=/)
})

test('parseComfyHistory recovers when output binding points to videos channel', () => {
  const parsed = parseComfyHistory(
    runningHubHistory,
    '2090462714383269889',
    {
      ...baseConfig,
      settings: {
        bindings: {
          output: { nodeId: '92', input: 'videos' },
        },
      },
    },
    true,
  )
  assert.equal(parsed.status, 'completed')
  assert.match(String(parsed.mediaUrl), /\.mp4/)
})

test('parseComfyHistory fails on interrupted status', () => {
  const parsed = parseComfyHistory(
    {
      abc: {
        outputs: {},
        status: { status_str: 'interrupted' },
      },
    },
    'abc',
    baseConfig,
    true,
  )
  assert.equal(parsed.status, 'failed')
  assert.match(String(parsed.error), /取消|中断/)
})

test('isPromptInComfyQueuePayload detects running and pending ids', () => {
  const queue = {
    queue_running: [[0, 'run-1', {}]],
    queue_pending: [[1, 'pend-2', {}]],
  }
  assert.equal(isPromptInComfyQueuePayload(queue, 'run-1'), true)
  assert.equal(isPromptInComfyQueuePayload(queue, 'pend-2'), true)
  assert.equal(isPromptInComfyQueuePayload(queue, 'missing'), false)
  assert.equal(isPromptInComfyQueuePayload({ queue_running: [], queue_pending: [] }, 'x'), false)
})
