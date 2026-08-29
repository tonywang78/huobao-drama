/**
 * Skill Profile 路由 — 按 Agent 管理预设
 */
import { Hono } from 'hono'
import { success, badRequest } from '../utils/response.js'
import { AGENT_BASE_SKILLS } from '../agents/skills.js'
import {
  createSkillProfile,
  deleteSkillProfile,
  listSkillProfiles,
  updateSkillProfile,
} from '../agents/skill-profiles.js'
import { validateSkillIds } from '../agents/skills.js'

const app = new Hono()

function assertAgentType(agentType: string) {
  if (!AGENT_BASE_SKILLS[agentType]) throw new Error(`Unknown agent type: ${agentType}`)
}

// GET /skill-profiles/:agentType
app.get('/:agentType', async (c) => {
  try {
    const agentType = c.req.param('agentType')
    assertAgentType(agentType)
    return success(c, listSkillProfiles(agentType))
  } catch (err: any) {
    return badRequest(c, err.message || 'Failed to list profiles')
  }
})

// POST /skill-profiles/:agentType
app.post('/:agentType', async (c) => {
  try {
    const agentType = c.req.param('agentType')
    assertAgentType(agentType)
    const body = await c.req.json()
    const skillIds = Array.isArray(body.skill_ids) ? body.skill_ids.map(String) : []
    validateSkillIds(agentType, skillIds)
    const profile = createSkillProfile(agentType, {
      id: body.id,
      name: body.name,
      description: body.description,
      include_base: body.include_base,
      skill_ids: skillIds,
    })
    return success(c, profile)
  } catch (err: any) {
    return badRequest(c, err.message || 'Failed to create profile')
  }
})

// PUT /skill-profiles/:agentType/:id
app.put('/:agentType/:id', async (c) => {
  try {
    const agentType = c.req.param('agentType')
    const id = c.req.param('id')
    assertAgentType(agentType)
    const body = await c.req.json()
    if (Array.isArray(body.skill_ids)) validateSkillIds(agentType, body.skill_ids.map(String))
    const profile = updateSkillProfile(agentType, id, {
      name: body.name,
      description: body.description,
      include_base: body.include_base,
      skill_ids: body.skill_ids,
    })
    return success(c, profile)
  } catch (err: any) {
    return badRequest(c, err.message || 'Failed to update profile')
  }
})

// DELETE /skill-profiles/:agentType/:id
app.delete('/:agentType/:id', async (c) => {
  try {
    const agentType = c.req.param('agentType')
    const id = c.req.param('id')
    assertAgentType(agentType)
    deleteSkillProfile(agentType, id)
    return success(c)
  } catch (err: any) {
    return badRequest(c, err.message || 'Failed to delete profile')
  }
})

export default app
