/**
 * Agent Skill Profile — 文件系统持久化预设
 * 路径：backend/workspace/skill-profiles/{agentType}.json
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const WORKSPACE_DIR = path.resolve(__dirname, '../../workspace')
const PROFILES_DIR = path.join(WORKSPACE_DIR, 'skill-profiles')

fs.mkdirSync(PROFILES_DIR, { recursive: true })

const PROFILE_ID = /^[a-z0-9-]+$/

export interface SkillProfile {
  id: string
  name: string
  description?: string
  include_base: boolean
  skill_ids: string[]
}

export interface SkillProfileFile {
  profiles: SkillProfile[]
}

function profilePath(agentType: string): string {
  return path.join(PROFILES_DIR, `${agentType}.json`)
}

function readFile(agentType: string): SkillProfileFile {
  const p = profilePath(agentType)
  if (!fs.existsSync(p)) return { profiles: [] }
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'))
    const profiles = Array.isArray(raw?.profiles) ? raw.profiles : []
    return {
      profiles: profiles
        .filter((x: any) => x && typeof x.id === 'string' && typeof x.name === 'string')
        .map((x: any) => ({
          id: String(x.id),
          name: String(x.name),
          description: typeof x.description === 'string' ? x.description : '',
          include_base: x.include_base !== false,
          skill_ids: Array.isArray(x.skill_ids) ? x.skill_ids.map(String) : [],
        })),
    }
  } catch {
    return { profiles: [] }
  }
}

function writeFile(agentType: string, data: SkillProfileFile): void {
  fs.writeFileSync(profilePath(agentType), JSON.stringify(data, null, 2), 'utf-8')
}

export function listSkillProfiles(agentType: string): SkillProfile[] {
  return readFile(agentType).profiles
}

export function getSkillProfile(agentType: string, profileId: string): SkillProfile | null {
  return listSkillProfiles(agentType).find(p => p.id === profileId) || null
}

export function createSkillProfile(
  agentType: string,
  input: { id: string; name: string; description?: string; include_base?: boolean; skill_ids?: string[] },
): SkillProfile {
  const id = String(input.id || '').trim()
  if (!PROFILE_ID.test(id)) throw new Error('Profile id 只能包含小写字母、数字和连字符')
  const name = String(input.name || '').trim()
  if (!name) throw new Error('Profile name is required')

  const file = readFile(agentType)
  if (file.profiles.some(p => p.id === id)) throw new Error('Profile already exists')

  const profile: SkillProfile = {
    id,
    name,
    description: input.description || '',
    include_base: input.include_base !== false,
    skill_ids: Array.isArray(input.skill_ids) ? input.skill_ids.map(String) : [],
  }
  file.profiles.push(profile)
  writeFile(agentType, file)
  return profile
}

export function updateSkillProfile(
  agentType: string,
  profileId: string,
  patch: { name?: string; description?: string; include_base?: boolean; skill_ids?: string[] },
): SkillProfile {
  const file = readFile(agentType)
  const idx = file.profiles.findIndex(p => p.id === profileId)
  if (idx < 0) throw new Error('Profile not found')
  const cur = file.profiles[idx]
  const next: SkillProfile = {
    ...cur,
    name: patch.name !== undefined ? String(patch.name).trim() || cur.name : cur.name,
    description: patch.description !== undefined ? String(patch.description) : cur.description,
    include_base: patch.include_base !== undefined ? !!patch.include_base : cur.include_base,
    skill_ids: patch.skill_ids !== undefined
      ? (Array.isArray(patch.skill_ids) ? patch.skill_ids.map(String) : [])
      : cur.skill_ids,
  }
  file.profiles[idx] = next
  writeFile(agentType, file)
  return next
}

export function deleteSkillProfile(agentType: string, profileId: string): void {
  const file = readFile(agentType)
  const next = file.profiles.filter(p => p.id !== profileId)
  if (next.length === file.profiles.length) throw new Error('Profile not found')
  writeFile(agentType, { profiles: next })
}
