import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('first_last service type is official for MiniMax and ComfyUI', () => {
  const ai = read('src/services/ai.ts')
  const schema = read('src/db/schema.ts')
  const mysql = read('src/db/mysql-schema.ts')

  assert.match(ai, /ServiceType = 'text' \| 'image' \| 'video' \| 'img2img' \| 'first_last'/)
  assert.match(ai, /first_last:\s*\[\s*'minimax',\s*'comfyui'\s*\]/)
  assert.match(schema, /firstLastConfigId: int\('first_last_config_id'\)/)
  assert.match(mysql, /first_last_config_id INT/)
  assert.match(mysql, /ADD COLUMN `first_last_config_id`/)
})

test('tasks route first_last mode requires both frames and locks first_last config', () => {
  const route = read('src/routes/tasks.ts')

  assert.match(route, /body\.reference_mode === 'first_last'/)
  assert.match(route, /首尾帧模式必须同时提供 first_frame_url 和 last_frame_url/)
  assert.match(route, /firstFrameUrl: isFirstLast \? body\.first_frame_url/)
  assert.match(route, /lastFrameUrl: isFirstLast \? body\.last_frame_url/)
  assert.match(route, /ep\?\.firstLastConfigId/)
  assert.match(route, /referenceImageUrls: isFirstLast \? undefined/)
})

test('video generation persists first_last serviceType and falls back to first_last config', () => {
  const service = read('src/services/generation.ts')

  assert.match(service, /params\.referenceMode === 'first_last'/)
  assert.match(service, /getActiveConfig\(serviceType\)/)
  assert.match(service, /请先在设置中添加首尾帧服务/)
  assert.match(service, /当前视频服务不支持首尾帧/)
  assert.match(service, /serviceType === 'first_last'/)
  assert.match(service, /ep\.firstLastConfigId/)
})

test('storyboard PUT accepts first and last frame image fields', () => {
  const route = read('src/routes/storyboards.ts')
  assert.match(route, /first_frame_image: 'firstFrameImage'/)
  assert.match(route, /last_frame_image: 'lastFrameImage'/)
})

test('ComfyUI first_last path uses dedicated bindings and does not mix frames into reference images', () => {
  const adapter = read('src/services/adapters/comfyui-video.ts')
  const common = read('src/services/adapters/comfyui-common.ts')
  const workflow = read('src/services/adapters/comfyui/workflows/first-last-default.api.json')

  assert.match(adapter, /hasFirstLastFrameInjection/)
  assert.match(adapter, /请在设置中为该 ComfyUI 首尾帧配置绑定首帧和尾帧节点/)
  assert.match(adapter, /buildComfyPromptRequest\(\s*config,\s*'first_last'/)
  assert.match(adapter, /firstFrame: firstName/)
  assert.match(adapter, /lastFrame: lastName/)
  assert.doesNotMatch(adapter, /record\.firstFrameUrl \? \[record\.firstFrameUrl\]/)
  assert.match(common, /hasFirstLastFrameInjection/)
  assert.match(common, /FIRST_FRAME/)
  assert.match(common, /LAST_FRAME/)
  assert.match(common, /first_frame:/)
  assert.match(common, /last_frame:/)
  assert.match(workflow, /\{\{FIRST_FRAME\}\}/)
  assert.match(workflow, /\{\{LAST_FRAME\}\}/)
  assert.match(workflow, /LoadImage/)
})

test('MiniMax adapter still emits first_frame and last_frame roles', () => {
  const adapter = read('src/services/adapters/minimax-video.ts')
  assert.match(adapter, /role: 'first_frame'/)
  assert.match(adapter, /role: 'last_frame'/)
})
