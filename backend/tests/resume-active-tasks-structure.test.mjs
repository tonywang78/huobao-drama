import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('server resumes in-flight generation polls after restart', () => {
  const generation = read('src/services/generation.ts')
  const index = read('src/index.ts')

  assert.match(generation, /export async function resumeActiveTasks/)
  assert.match(generation, /resume-skip-no-task-id|no-task-id/)
  assert.match(generation, /activePollIds|pollInFlight/)
  assert.match(index, /resumeActiveTasks/)
  // 只续轮询，禁止对已有 taskId 的任务再次 /prompt
  const resumeFn = generation.slice(generation.indexOf('resumeActiveTasks'))
  assert.doesNotMatch(resumeFn.slice(0, 1200), /buildGenerateRequest/)
})
