import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('collectToolOutcomes dedupes image tasks and ignores step toolCalls', () => {
  const svc = read('src/services/assistant.ts')

  assert.match(svc, /function dedupeImageTasks/)
  assert.match(svc, /imageTasks: dedupeImageTasks\(imageTasks\)/)
  assert.doesNotMatch(svc, /push\(step\?\.toolCalls\)/)
})
