/**
 * 技能管理路由 — 全部经 Mastra Workspace API 读写
 * 文件操作 jail 在 backend/workspace/ 目录内
 */
import { Hono } from 'hono'
import { success, badRequest } from '../utils/response.js'
import {
  listAgentSkillCatalog,
  refreshSkillWorkspaces,
  skillsManagerWorkspace,
  AGENT_BASE_SKILLS,
} from '../agents/skills.js'

const app = new Hono()
const fsm = () => skillsManagerWorkspace.filesystem!
const skillFile = (id: string) => `skills/${id}/SKILL.md`
const SKILL_ID_SEGMENT = /^[a-z0-9-]+$/

// GET /skills — List all skills (经 workspace.skills 原生发现)
app.get('/', async (c) => {
  const metas = await skillsManagerWorkspace.skills?.list() || []
  return success(c, metas.map(meta => ({
    id: meta.path.replace(/^skills\//, ''),
    name: meta.name,
    description: meta.description || '',
  })))
})

// GET /skills/catalog/:agentType — 底座 + 可选 Skill
app.get('/catalog/:agentType', async (c) => {
  try {
    const agentType = c.req.param('agentType')
    if (!AGENT_BASE_SKILLS[agentType]) return badRequest(c, `Unknown agent type: ${agentType}`)
    const catalog = await listAgentSkillCatalog(agentType)
    return success(c, catalog)
  } catch (err: any) {
    return badRequest(c, err.message || 'Failed to load catalog')
  }
})

// GET /skills/:id — Get skill content (raw, 含 frontmatter 供编辑)
app.get('/*', async (c) => {
  const id = c.req.path.slice('/api/v1/skills/'.length)
  if (id.startsWith('catalog/')) return badRequest(c, 'Not found')
  if (!await fsm().exists(skillFile(id))) return badRequest(c, 'Skill not found')
  const content = await fsm().readFile(skillFile(id), { encoding: 'utf-8' })
  return success(c, { id, content })
})

// PUT /skills/:id — Update skill content
app.put('/*', async (c) => {
  const id = c.req.path.slice('/api/v1/skills/'.length)
  const body = await c.req.json()
  await fsm().writeFile(skillFile(id), body.content, { recursive: true })
  await refreshSkillWorkspaces()
  return success(c)
})

// POST /skills — Create new skill directory
app.post('/', async (c) => {
  const body = await c.req.json()
  const { id, description } = body
  if (!id) return badRequest(c, 'Skill id is required')
  const segments = String(id).split('/')
  if (!segments.every((seg: string) => SKILL_ID_SEGMENT.test(seg))) {
    return badRequest(c, 'Skill id 每段只能包含小写字母、数字和连字符')
  }
  if (await fsm().exists(skillFile(id))) return badRequest(c, 'Skill already exists')

  const name = segments[segments.length - 1]
  const content = `---
name: ${name}
description: ${description || ''}
---

# ${name}

Write your skill content here.
`
  await fsm().writeFile(skillFile(id), content, { recursive: true, overwrite: false })
  await refreshSkillWorkspaces()
  return success(c, { id, name, description: description || '' })
})

// DELETE /skills/:id — Delete skill directory
app.delete('/*', async (c) => {
  const id = c.req.path.slice('/api/v1/skills/'.length)
  if (!await fsm().exists(`skills/${id}`)) return badRequest(c, 'Skill not found')
  await fsm().rmdir(`skills/${id}`, { recursive: true })
  await refreshSkillWorkspaces()
  return success(c)
})

export default app
