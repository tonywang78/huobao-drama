import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('reference images normalize local static paths from absolute and full URLs', () => {
  const gen = read('src/services/generation.ts')
  assert.match(gen, /function extractLocalStaticPath/)
  assert.match(gen, /fetchImageAsCompressedDataUrl/)
})

test('generate_image tool routes to img2img when references are present', () => {
  const tools = read('src/agents/tools/assistant-tools.ts')
  assert.match(tools, /async function enqueueImageWithRefs/)
  assert.match(tools, /resolveToolReferenceUrls/)
  assert.match(tools, /getAssistantRefs/)
  assert.match(tools, /generateImageEdit\(/)
})

test('assistant chat injects user refs into request context and ref fallback', () => {
  const route = read('src/routes/assistant.ts')
  const svc = read('src/services/assistant.ts')
  const intent = read('src/services/assistant-image-intent.ts')
  assert.match(route, /assistantRefs: refs/)
  assert.match(route, /assistantAttachments: attachments/)
  assert.match(route, /needsRefFallback/)
  assert.match(route, /shouldSkipDirectImageEditFallback/)
  assert.match(svc, /shouldDirectImageEdit/)
  assert.match(svc, /export function toolCallUsedReferenceImages/)
  assert.match(intent, /looksLikeFieldEditIntent/)
})
