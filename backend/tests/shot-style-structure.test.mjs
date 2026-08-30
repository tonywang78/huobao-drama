import { readFileSync, existsSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = new URL('..', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')
const workspaceRoot = path.join(fileURLToPath(root), 'workspace')

test('schema and mysql include shot_style', () => {
  const schema = read('src/db/schema.ts')
  const mysql = read('src/db/mysql-schema.ts')
  assert.match(schema, /shotStyle: varchar\('shot_style'/)
  assert.match(mysql, /shot_style VARCHAR\(32\) DEFAULT 'default'/)
  assert.match(mysql, /ADD COLUMN `shot_style` VARCHAR\(32\) DEFAULT/)
  assert.match(mysql, /shot_style/)
})

test('shot-style service normalizes and loads skill packs', () => {
  const svc = read('src/services/shot-style.ts')
  assert.match(svc, /SHOT_STYLE_VALUES/)
  assert.match(svc, /normalizeShotStyle/)
  assert.match(svc, /loadShotStyleSkill/)
  assert.match(svc, /applyShotStyle/)
  assert.match(svc, /buildApplyShotStyleUserMessage/)
  assert.match(svc, /mastra\.getAgent\('storyboard_breaker'\)/)
})

test('shot-styles skill packs exist with matching frontmatter names', () => {
  const packs = [
    { dir: 'fight', name: 'fight' },
    { dir: 'documentary', name: 'documentary' },
    { dir: 'art-film', name: 'art-film' },
  ]
  for (const p of packs) {
    const file = path.join(workspaceRoot, 'skills', 'shot-styles', p.dir, 'SKILL.md')
    assert.ok(existsSync(file), `missing ${file}`)
    const body = readFileSync(file, 'utf8')
    assert.match(body, new RegExp(`name:\\s*${p.name}`))
    assert.match(body, /## 拆镜规则/)
    assert.match(body, /## video_prompt 规则/)
  }
})

test('fight skill prefers continuous one-shot over hard multi-cuts', () => {
  const body = readFileSync(
    path.join(workspaceRoot, 'skills', 'shot-styles', 'fight', 'SKILL.md'),
    'utf8',
  )
  assert.match(body, /一镜到底|跟拍/)
  assert.match(body, /镜头继续|跟拍接上|动作不停/)
  assert.match(body, /1[–-]2\s*个/)
  assert.doesNotMatch(body, /3-4\s*个【镜头N】/)
  assert.doesNotMatch(body, /鼓励硬切/)
})

test('storyboard-breaker defers fight continuity to fight skill pack', () => {
  const breaker = read('workspace/skills/storyboard-breaker/SKILL.md')
  assert.match(breaker, /shot_style=fight/)
  assert.match(breaker, /一镜到底|长镜跟拍/)
  assert.match(breaker, /不按.*2[–-]4\s*子镜头硬切/)
})

test('storyboard tools and routes persist shot_style', () => {
  const tools = read('src/agents/tools/storyboard-tools.ts')
  const route = read('src/routes/storyboards.ts')
  assert.match(tools, /shot_style: z\.enum/)
  assert.match(tools, /shotStyle: normalizeShotStyle/)
  assert.match(tools, /shot_style: sb\.shotStyle/)
  assert.match(route, /shot_style: 'shotStyle'/)
  assert.match(route, /app\.post\('\/:id\/apply-shot-style'/)
  assert.match(route, /applyShotStyle\(/)
})

test('video prompt message injects shot_style block', () => {
  const engine = read('src/services/video-engine.ts')
  const batch = read('src/services/video-prompts.ts')
  assert.match(engine, /shotStyle\?:/)
  assert.match(engine, /当前镜头风格规范/)
  assert.match(batch, /loadShotStyleSkill/)
  assert.match(batch, /normalizeShotStyle\(sb\.shotStyle\)/)
  assert.match(batch, /styleSkill/)
})

test('skills map registers shot-styles for storyboard_breaker', () => {
  const skills = read('src/agents/skills.ts')
  assert.match(skills, /SHOT_STYLE_SKILL_PREFIX = 'shot-styles'/)
  assert.match(skills, /storyboard_breaker: \['storyboard-breaker', 'shot-styles'\]/)
  assert.match(skills, /isShotStyleSkill/)
})
