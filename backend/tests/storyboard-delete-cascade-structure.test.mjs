import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('DELETE /storyboards/:id cascades sys_task cleanup', () => {
  const storyboards = read('src/routes/storyboards.ts')
  assert.match(storyboards, /app\.delete\('\/:id'/)
  assert.match(storyboards, /db\.delete\(schema\.sysTask\)\.where\(eq\(schema\.sysTask\.storyboardId, id\)\)/)
  assert.match(storyboards, /db\.delete\(schema\.storyboardCharacters\)/)
  assert.match(storyboards, /db\.delete\(schema\.storyboardProps\)/)
  assert.match(storyboards, /db\.delete\(schema\.storyboards\)\.where\(eq\(schema\.storyboards\.id, id\)\)/)
})
