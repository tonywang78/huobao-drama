import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('asset-duplicate util copies fields and links without touching history or storyboards', () => {
  const util = read('src/utils/asset-duplicate.ts')

  assert.match(util, /export async function duplicateCharacter/)
  assert.match(util, /export async function duplicateScene/)
  assert.match(util, /export async function duplicateProp/)
  assert.match(util, /COPY_SUFFIX = ' 副本'/)
  assert.match(util, /withCopySuffix/)
  assert.match(util, /linkCharToEpisode/)
  assert.match(util, /linkSceneToEpisode/)
  assert.match(util, /linkPropToEpisode/)
  assert.match(util, /finalPrompt: src\.finalPrompt/)
  assert.match(util, /imageUrl: src\.imageUrl/)
  assert.match(util, /localPath: src\.localPath/)
  assert.match(util, /referenceImages: src\.referenceImages/)
  // 不拷图历史 / 分镜绑定
  assert.doesNotMatch(util, /sysTask|storyboardCharacters|storyboardProps|storyboards/)
})

test('characters scenes props routes expose duplicate endpoints', () => {
  const characters = read('src/routes/characters.ts')
  const scenes = read('src/routes/scenes.ts')
  const props = read('src/routes/props.ts')

  assert.match(characters, /from '\.\.\/utils\/asset-duplicate\.js'/)
  assert.match(characters, /app\.post\('\/:id\/duplicate'/)
  assert.match(characters, /duplicateCharacter/)

  assert.match(scenes, /from '\.\.\/utils\/asset-duplicate\.js'/)
  assert.match(scenes, /app\.post\('\/:id\/duplicate'/)
  assert.match(scenes, /duplicateScene/)

  assert.match(props, /from '\.\.\/utils\/asset-duplicate\.js'/)
  assert.match(props, /app\.post\('\/:id\/duplicate'/)
  assert.match(props, /duplicateProp/)
})
