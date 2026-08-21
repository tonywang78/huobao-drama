import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('characters route supports manual create and hard delete with cascade', () => {
  const route = read('src/routes/characters.ts')
  const hard = read('src/utils/asset-hard-delete.ts')

  assert.match(route, /app\.post\('\/'/)
  assert.match(route, /name required/)
  assert.match(route, /insert\(schema\.episodeCharacters\)/)
  assert.match(route, /app\.delete\('\/:id'/)
  assert.match(route, /hardDeleteCharacter/)
  assert.match(hard, /db\.delete\(schema\.characters\)/)
  assert.match(hard, /db\.delete\(schema\.episodeCharacters\)/)
  assert.match(hard, /db\.delete\(schema\.storyboardCharacters\)/)
  assert.match(hard, /db\.delete\(schema\.sysTask\)/)
  assert.doesNotMatch(route, /deletedAt: now\(\)/)
})

test('scenes route links new scenes to episode and hard deletes with cascade', () => {
  const route = read('src/routes/scenes.ts')
  const hard = read('src/utils/asset-hard-delete.ts')

  assert.match(route, /app\.post\('\/'/)
  assert.match(route, /location required/)
  assert.match(route, /insert\(schema\.episodeScenes\)/)
  assert.match(route, /app\.delete\('\/:id'/)
  assert.match(route, /hardDeleteScene/)
  assert.match(hard, /db\.delete\(schema\.scenes\)/)
  assert.match(hard, /db\.delete\(schema\.episodeScenes\)/)
  assert.match(hard, /sceneId: null/)
  assert.doesNotMatch(route, /deletedAt: now\(\)/)
})

test('props route supports manual create and hard delete with cascade', () => {
  const route = read('src/routes/props.ts')
  const hard = read('src/utils/asset-hard-delete.ts')

  assert.match(route, /app\.post\('\/'/)
  assert.match(route, /name required/)
  assert.match(route, /insert\(schema\.episodeProps\)/)
  assert.match(route, /app\.delete\('\/:id'/)
  assert.match(route, /hardDeleteProp/)
  assert.match(hard, /db\.delete\(schema\.props\)/)
  assert.match(hard, /db\.delete\(schema\.episodeProps\)/)
  assert.match(hard, /db\.delete\(schema\.storyboardProps\)/)
  assert.doesNotMatch(route, /deletedAt: now\(\)/)
})
