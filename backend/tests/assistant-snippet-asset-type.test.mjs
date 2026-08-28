import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('assistant_snippets schema has asset_type and system_key', () => {
  const schema = read('src/db/schema.ts')
  const mysql = read('src/db/mysql-schema.ts')

  assert.match(schema, /assetType: varchar\('asset_type'/)
  assert.match(schema, /systemKey: varchar\('system_key'/)
  assert.match(mysql, /assistantSnippetSeeds/)
  assert.match(mysql, /character\.standardize/)
  assert.match(mysql, /scene\.fixed_view/)
  assert.match(mysql, /prop\.white_bg/)
  assert.match(mysql, /ADD COLUMN `asset_type`/)
  assert.match(mysql, /ADD COLUMN `system_key`/)
})

test('assistant service formats typed snippets with full body', () => {
  const svc = read('src/services/assistant.ts')
  assert.match(svc, /normalizeSnippetAssetType/)
  assert.match(svc, /preferAssetType/)
  assert.match(svc, /fullBodyLimit/)
  assert.match(svc, /ASSET_TYPE_LABEL/)
})

test('studio assistant skill documents typed snippets', () => {
  const skill = read('workspace/skills/studio-assistant/SKILL.md')
  assert.match(skill, /标准化/)
  assert.match(skill, /\[角色\]/)
  assert.match(skill, /全文/)
})
