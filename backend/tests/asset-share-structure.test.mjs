import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('episode-assets util exposes idempotent link and unlink helpers', () => {
  const util = read('src/utils/episode-assets.ts')

  assert.match(util, /export async function linkCharToEpisode/)
  assert.match(util, /export async function linkSceneToEpisode/)
  assert.match(util, /export async function linkPropToEpisode/)
  assert.match(util, /export async function unlinkCharFromEpisode/)
  assert.match(util, /export async function unlinkSceneFromEpisode/)
  assert.match(util, /export async function unlinkPropFromEpisode/)
  // 幂等：已存在则不重复 insert
  assert.match(util, /if \(!existing\.length\)/)
  // 断链删关联表，不碰实体 deletedAt
  assert.match(util, /db\.delete\(schema\.episodeCharacters\)/)
  assert.match(util, /db\.delete\(schema\.episodeScenes\)/)
  assert.match(util, /db\.delete\(schema\.episodeProps\)/)
  assert.doesNotMatch(util, /deletedAt/)
})

test('episodes route supports link-assets, available-assets, and unlink', () => {
  const route = read('src/routes/episodes.ts')

  assert.match(route, /app\.post\('\/:id\/link-assets'/)
  assert.match(route, /app\.get\('\/:id\/available-assets'/)
  assert.match(route, /app\.delete\('\/:id\/characters\/:assetId'/)
  assert.match(route, /app\.delete\('\/:id\/scenes\/:assetId'/)
  assert.match(route, /app\.delete\('\/:id\/props\/:assetId'/)
  assert.match(route, /character_ids/)
  assert.match(route, /scene_ids/)
  assert.match(route, /prop_ids/)
  assert.match(route, /linkCharToEpisode/)
  assert.match(route, /unlinkCharFromEpisode/)
  assert.match(route, /不属于当前项目或不存在/)
  // unlink 路由体只调用 unlink*，不写实体 deletedAt
  assert.match(route, /await unlinkCharFromEpisode\(episodeId, assetId\)\s*\n\s*return success/)
  assert.match(route, /await unlinkSceneFromEpisode\(episodeId, assetId\)\s*\n\s*return success/)
  assert.match(route, /await unlinkPropFromEpisode\(episodeId, assetId\)\s*\n\s*return success/)
})

test('extract and storyboard tools reuse shared episode-assets link helpers', () => {
  const extract = read('src/agents/tools/extract-tools.ts')
  const storyboard = read('src/agents/tools/storyboard-tools.ts')

  assert.match(extract, /from '\.\.\/\.\.\/utils\/episode-assets\.js'/)
  assert.match(extract, /linkCharToEpisode/)
  assert.match(storyboard, /from '\.\.\/\.\.\/utils\/episode-assets\.js'/)
  assert.match(storyboard, /linkSceneToEpisode/)
})

test('dramas detail filters soft-deleted assets', () => {
  const route = read('src/routes/dramas.ts')
  assert.match(route, /isNull\(schema\.characters\.deletedAt\)/)
  assert.match(route, /isNull\(schema\.scenes\.deletedAt\)/)
  assert.match(route, /isNull\(schema\.props\.deletedAt\)/)
})
