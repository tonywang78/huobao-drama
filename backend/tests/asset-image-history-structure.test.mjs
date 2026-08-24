import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('GET /tasks supports asset image history filters', () => {
  const route = read('src/routes/tasks.ts')
  assert.match(route, /character_id/)
  assert.match(route, /scene_id/)
  assert.match(route, /prop_id/)
  assert.match(route, /r\.characterId === Number\(characterId\)/)
  assert.match(route, /r\.sceneId === Number\(sceneId\)/)
  assert.match(route, /r\.propId === Number\(propId\)/)
})

test('asset image history utility records upload tasks', () => {
  const util = read('src/utils/asset-image-history.ts')
  assert.match(util, /recordAssetImageHistory/)
  assert.match(util, /shouldRecordImageHistory/)
  assert.match(util, /skip_image_history/)
  assert.match(util, /params\.source \|\| 'upload'/)
})

test('character/scene/prop PUT routes record upload image history', () => {
  for (const file of ['src/routes/characters.ts', 'src/routes/scenes.ts', 'src/routes/props.ts']) {
    const route = read(file)
    assert.match(route, /recordAssetImageHistory/)
    assert.match(route, /shouldRecordImageHistory/)
  }
})
