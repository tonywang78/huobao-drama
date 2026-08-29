/**
 * Agent 工作区（Workspace）— Mastra 原生能力
 * 每个 Agent 一个 Workspace：
 * - filesystem：jail 到 backend/workspace/ 目录，Agent 获得文件读写工具
 * - skills：从 workspace/skills/ 下注册各 Agent 专属的 SKILL.md
 * 注入 instructions 时仍拼接技能全文（原生注入只有元数据，全文注入保证行为一致）
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Workspace, LocalFilesystem } from '@mastra/core/workspace'
import { getSkillProfile } from './skill-profiles.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const WORKSPACE_DIR = path.resolve(__dirname, '../../workspace')
const SKILLS_DIR = path.join(WORKSPACE_DIR, 'skills')

// 启动时确保工作目录存在（Agent 文件读写的 jail 根）
fs.mkdirSync(SKILLS_DIR, { recursive: true })

/**
 * 每个 Agent 注册的 skill 目录（相对 workspace/skills/，含子规范目录；目录名需符合 Agent Skills 规范：小写+连字符）
 *
 * 注意：`prompt-generator/video-engines/*` 也在 Skills 高级配置里维护（属 prompt_generator 前缀），
 * 但故意不列入本 map —— 避免注入角色/场景/道具提示词；生成 video_prompt 时由 video-engine 服务按
 * settings.videoEngine 按需读取并写入 user message。
 * `shot-styles/*` 挂在 storyboard_breaker 下供拆镜识别；prompt_generator 侧按分镜 shot_style 写入 user message。
 */
const AGENT_SKILL_MAP: Record<string, string[]> = {
  script_rewriter: ['script-rewriter'],
  extractor: ['extractor'],
  // shot-styles：拆镜时注入戏种运镜包；prompt_generator 不挂此处（改由 user message 按需注入）
  storyboard_breaker: ['storyboard-breaker', 'shot-styles'],
  prompt_generator: [
    'prompt-generator/character-prompt',
    'prompt-generator/scene-prompt',
    'prompt-generator/prop-prompt',
    'prompt-generator/video-prompt',
  ],
  asset_importer: ['asset-importer'],
  storyboard_importer: ['storyboard-importer'],
  studio_assistant: ['studio-assistant'],
}

/** 各 Agent 底座 skill（关闭 include_base 时不再注入） */
export const AGENT_BASE_SKILLS: Record<string, string[]> = {
  script_rewriter: ['script-rewriter'],
  extractor: ['extractor'],
  storyboard_breaker: ['storyboard-breaker'],
  prompt_generator: [
    'prompt-generator/character-prompt',
    'prompt-generator/scene-prompt',
    'prompt-generator/prop-prompt',
    'prompt-generator/video-prompt',
  ],
  asset_importer: ['asset-importer'],
  storyboard_importer: ['storyboard-importer'],
  studio_assistant: ['studio-assistant'],
}

/** 视频引擎 skill 相对 workspace 的路径前缀（Skills UI / 按需加载共用） */
export const VIDEO_ENGINE_SKILL_PREFIX = 'prompt-generator/video-engines'

/** 镜头风格包前缀（拆镜 Agent 可注入；视频提示词由 shot_style 按需读取） */
export const SHOT_STYLE_SKILL_PREFIX = 'shot-styles'

export type SkillCatalogItem = {
  id: string
  name: string
  description: string
}

export type SkillCatalog = {
  agent_type: string
  base: SkillCatalogItem[]
  optional: SkillCatalogItem[]
}

/** 请求体原始选择（未解析） */
export type RawSkillSelection = {
  profile_id?: string
  include_base?: boolean
  skill_ids?: string[]
}

/** 解析后的选择（注入用） */
export type ResolvedSkillSelection = {
  includeBase: boolean
  skillIds: string[]
  profileId?: string
}

/** 每个 Agent 的 Workspace（filesystem 工作目录 + 原生技能注册）
 *  skills 用动态解析器按目录前缀匹配：设置页新建的子技能无需重启即可被发现 */
export const skillWorkspaces: Record<string, Workspace> = Object.fromEntries(
  Object.entries(AGENT_SKILL_MAP).map(([agentType, prefixes]) => [
    agentType,
    new Workspace({
      id: `workspace-${agentType}`,
      name: `${agentType} workspace`,
      filesystem: new LocalFilesystem({ basePath: WORKSPACE_DIR }),
      skills: () => scanSkillPaths().filter(p =>
        prefixes.some(prefix => p === `skills/${prefix}` || p.startsWith(`skills/${prefix}/`))),
    }),
  ]),
)

/** 递归扫描 workspace/skills/ 下所有含 SKILL.md 的目录（相对 workspace 根的路径） */
function scanSkillPaths(): string[] {
  const found: string[] = []
  const walk = (dir: string, prefix: string) => {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      const full = path.join(dir, entry.name)
      if (fs.existsSync(path.join(full, 'SKILL.md'))) found.push(`skills/${rel}`)
      walk(full, rel)
    }
  }
  walk(SKILLS_DIR, '')
  return found
}

/**
 * 技能管理 Workspace（设置页 CRUD 用）
 * skills 用动态解析器，新建/删除技能目录后无需重启即可发现
 */
export const skillsManagerWorkspace = new Workspace({
  id: 'workspace-skills-manager',
  name: 'skills manager',
  filesystem: new LocalFilesystem({ basePath: WORKSPACE_DIR }),
  skills: () => scanSkillPaths(),
})

function formatSkillSection(skillId: string, content: string): string {
  return [`## Skill: ${skillId}`, content].join('\n')
}

function isVideoEngineSkill(relPath: string): boolean {
  return relPath === VIDEO_ENGINE_SKILL_PREFIX || relPath.startsWith(VIDEO_ENGINE_SKILL_PREFIX + '/')
}

export function isShotStyleSkill(relPath: string): boolean {
  return relPath === SHOT_STYLE_SKILL_PREFIX || relPath.startsWith(SHOT_STYLE_SKILL_PREFIX + '/')
}

/** Agent 前缀下全部可发现路径（含 video-engines / shot-styles，供设置页；注入时另滤） */
export function listAgentSkillRelPaths(agentType: string): string[] {
  const prefixes = AGENT_SKILL_MAP[agentType] || []
  if (!prefixes.length) return []
  const allPaths = scanSkillPaths().map(p => p.replace(/^skills\//, ''))
  // prompt_generator：设置页还需看到 video-engines 与 shot-styles；catalog 勾选侧再排除
  const scanPrefixes = agentType === 'prompt_generator'
    ? [...prefixes, VIDEO_ENGINE_SKILL_PREFIX, SHOT_STYLE_SKILL_PREFIX]
    : prefixes
  return allPaths.filter(p =>
    scanPrefixes.some(prefix => p === prefix || p.startsWith(prefix + '/')))
}

function belongsToAgent(agentType: string, skillId: string): boolean {
  const prefixes = AGENT_SKILL_MAP[agentType] || []
  return prefixes.some(prefix => skillId === prefix || skillId.startsWith(prefix + '/'))
}

async function skillMeta(relPath: string): Promise<SkillCatalogItem> {
  const workspace = skillsManagerWorkspace
  const skill = await workspace.skills?.get(`skills/${relPath}`)
  return {
    id: relPath,
    name: skill?.name || relPath.split('/').pop() || relPath,
    description: skill?.description || '',
  }
}

/** 列出 Agent 的底座 + 可选 Skill（不含 video-engines；shot-styles 仅在 storyboard_breaker 作为可选） */
export async function listAgentSkillCatalog(agentType: string): Promise<SkillCatalog> {
  if (!AGENT_SKILL_MAP[agentType]) {
    throw new Error(`Unknown agent type: ${agentType}`)
  }
  const baseIds = new Set(AGENT_BASE_SKILLS[agentType] || [])
  const all = listAgentSkillRelPaths(agentType).filter(p =>
    !isVideoEngineSkill(p) && !(agentType === 'prompt_generator' && isShotStyleSkill(p)))


  // 底座：写死映射里存在的路径（即使暂时没有文件也列出 id）
  const base: SkillCatalogItem[] = []
  for (const id of AGENT_BASE_SKILLS[agentType] || []) {
    base.push(await skillMeta(id))
  }

  const optional: SkillCatalogItem[] = []
  for (const id of all) {
    if (baseIds.has(id)) continue
    optional.push(await skillMeta(id))
  }

  return { agent_type: agentType, base, optional }
}

/**
 * 解析请求中的 skill_selection。
 * 返回 null 表示未传选择 → 调用方走全量兼容注入。
 * 有选择时校验非法 id。
 */
export function resolveSkillSelection(
  agentType: string,
  raw: RawSkillSelection | null | undefined,
): ResolvedSkillSelection | null {
  if (raw == null || typeof raw !== 'object') return null

  const hasProfile = typeof raw.profile_id === 'string' && !!raw.profile_id.trim()
  const hasInclude = typeof raw.include_base === 'boolean'
  const hasIds = Array.isArray(raw.skill_ids)
  if (!hasProfile && !hasInclude && !hasIds) return null

  let includeBase = true
  let skillIds: string[] = []
  let profileId: string | undefined

  if (hasProfile) {
    const profile = getSkillProfile(agentType, String(raw.profile_id).trim())
    if (!profile) throw new Error(`Skill profile not found: ${raw.profile_id}`)
    profileId = profile.id
    includeBase = profile.include_base
    skillIds = [...profile.skill_ids]
  }

  if (hasInclude) includeBase = !!raw.include_base
  if (hasIds) skillIds = raw.skill_ids!.map(String)

  validateSkillIds(agentType, skillIds)
  return { includeBase, skillIds, profileId }
}

/** 解析请求体字段（支持 snake 与已解析对象） */
export function parseRawSkillSelection(body: any): RawSkillSelection | null {
  const raw = body?.skill_selection ?? body?.skillSelection
  if (raw == null || typeof raw !== 'object') return null
  const out: RawSkillSelection = {}
  if (typeof raw.profile_id === 'string') out.profile_id = raw.profile_id
  else if (typeof raw.profileId === 'string') out.profile_id = raw.profileId
  if (typeof raw.include_base === 'boolean') out.include_base = raw.include_base
  else if (typeof raw.includeBase === 'boolean') out.include_base = raw.includeBase
  if (Array.isArray(raw.skill_ids)) out.skill_ids = raw.skill_ids.map(String)
  else if (Array.isArray(raw.skillIds)) out.skill_ids = raw.skillIds.map(String)
  if (out.profile_id === undefined && out.include_base === undefined && out.skill_ids === undefined) {
    return null
  }
  return out
}

export function validateSkillIds(agentType: string, skillIds: string[]): void {
  for (const id of skillIds) {
    if (isVideoEngineSkill(id)) {
      throw new Error(`Skill「${id}」由 videoEngine 按需注入，不能通过 skill_selection 勾选`)
    }
    if (isShotStyleSkill(id) && agentType === 'prompt_generator') {
      throw new Error(`Skill「${id}」由分镜 shot_style 按需注入，不能通过 skill_selection 勾选`)
    }
    if (!belongsToAgent(agentType, id) && !(agentType === 'storyboard_breaker' && isShotStyleSkill(id))) {
      throw new Error(`Skill「${id}」不属于 Agent ${agentType}`)
    }
    const full = path.join(SKILLS_DIR, ...id.split('/'), 'SKILL.md')
    if (!fs.existsSync(full)) {
      throw new Error(`Skill not found: ${id}`)
    }
  }
}

/** 兼容全量：该 Agent 前缀下全部 skill（排除 video-engines） */
function defaultRelPaths(agentType: string): string[] {
  const prefixes = AGENT_SKILL_MAP[agentType] || []
  if (!prefixes.length) return []
  const allPaths = scanSkillPaths().map(p => p.replace(/^skills\//, ''))
  return allPaths.filter(p =>
    !isVideoEngineSkill(p)
    && prefixes.some(prefix => p === prefix || p.startsWith(prefix + '/')))
}

function selectedRelPaths(agentType: string, selection: ResolvedSkillSelection): string[] {
  const paths: string[] = []
  const seen = new Set<string>()
  const push = (id: string) => {
    if (seen.has(id)) return
    seen.add(id)
    paths.push(id)
  }
  if (selection.includeBase) {
    for (const id of AGENT_BASE_SKILLS[agentType] || []) push(id)
  }
  for (const id of selection.skillIds) push(id)
  return paths
}

/** 读取 Agent 专属技能全文
 *  selection 为 null/undefined → 全量兼容；有选择 → 仅底座(可选) + skill_ids */
export async function loadAgentSkills(
  agentType: string,
  selection?: ResolvedSkillSelection | null,
): Promise<string> {
  const workspace = skillWorkspaces[agentType]
  const prefixes = AGENT_SKILL_MAP[agentType] || []
  if (!workspace || !prefixes.length) return ''

  const relPaths = selection
    ? selectedRelPaths(agentType, selection)
    : defaultRelPaths(agentType)

  const contents: string[] = []
  for (const relPath of relPaths) {
    const skill = await workspace.skills?.get(`skills/${relPath}`)
    const body = skill?.instructions?.trim()
    if (body) contents.push(formatSkillSection(relPath, body))
  }

  if (!contents.length) return ''

  return [
    '以下是该 Agent 专属的项目技能规范（SKILL.md）。',
    '不同 Agent 会加载不同 skill；你只需要遵守当前注入的这些技能。',
    '你必须在不违背当前工具边界的前提下优先遵守这些规范；若与用户明确要求冲突，以用户要求为准。',
    '',
    contents.join('\n\n'),
  ].join('\n')
}

/**
 * 强制重新扫描全部 Agent 的技能（SKILL.md 编辑后调用）
 * maybeRefresh 负责感知目录增删（动态 resolver 路径变化），refresh 负责内容更新
 * （目录 mtime 不会因文件内容编辑而更新，单靠 maybeRefresh 的 staleness 检查不可靠）
 */
export async function refreshSkillWorkspaces(): Promise<void> {
  await Promise.all(
    [...Object.values(skillWorkspaces), skillsManagerWorkspace]
      .map(async workspace => {
        await workspace.skills?.maybeRefresh()
        await workspace.skills?.refresh()
      }),
  )
}

export { AGENT_SKILL_MAP }
