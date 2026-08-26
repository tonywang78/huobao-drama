import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readEpisodeWorkbenchSources } from './episode-workbench-sources.mjs'

const episode = readEpisodeWorkbenchSources()

test('storyboard workbench exposes first-last frame slots and generate actions', () => {
  assert.match(episode, /function genFirstLastVid/)
  assert.match(episode, /function batchFirstLastVideos/)
  assert.match(episode, /function genStoryboardFrame/)
  assert.match(episode, /reference_mode: 'first_last'/)
  assert.match(episode, /first_frame_url/)
  assert.match(episode, /last_frame_url/)
  assert.match(episode, /首尾帧出视频/)
  assert.match(episode, /hasFirstLastService/)
  assert.match(episode, /aiConfigAPI\.list\('first_last'\)/)
  assert.match(episode, /请先在设置中添加首尾帧服务/)
  assert.match(episode, /video-gen-method/)
  assert.match(episode, /batchSelectedReferenceVideos/)
  assert.match(episode, /参考生成/)
})
