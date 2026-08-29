/**
 * 分镜镜头风格（shot_style）— 戏种运镜标签与风格包按需加载
 * 与项目视觉风格（style_presets）正交：只管镜头语法/节奏，不管美术外观。
 */
import { eq } from 'drizzle-orm'
import { skillsManagerWorkspace, SHOT_STYLE_SKILL_PREFIX } from '../agents/skills.js'
import { buildAgentRequestContext } from '../agents/context.js'
import { mastra } from '../mastra/index.js'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { toSnakeCase } from '../utils/transform.js'

export const SHOT_STYLE_VALUES = ['default', 'documentary', 'art_film', 'fight'] as const
export type ShotStyle = (typeof SHOT_STYLE_VALUES)[number]

/** UI / 文档用元数据；skillDir 为 workspace 目录名（art_film → art-film） */
export const SHOT_STYLES: ReadonlyArray<{
  value: ShotStyle
  label: string
  skillDir: string | null
}> = [
  { value: 'default', label: '默认', skillDir: null },
  { value: 'documentary', label: '纪录片', skillDir: 'documentary' },
  { value: 'art_film', label: '文艺片', skillDir: 'art-film' },
  { value: 'fight', label: '打斗', skillDir: 'fight' },
]

export function isShotStyle(value: unknown): value is ShotStyle {
  return typeof value === 'string' && (SHOT_STYLE_VALUES as readonly string[]).includes(value)
}

/** 非法/空值回落为 default */
export function normalizeShotStyle(value: unknown): ShotStyle {
  if (isShotStyle(value)) return value
  return 'default'
}

export function shotStyleSkillDir(style: ShotStyle): string | null {
  return SHOT_STYLES.find(s => s.value === style)?.skillDir ?? null
}

export function shotStyleSkillId(style: ShotStyle): string | null {
  const dir = shotStyleSkillDir(style)
  return dir ? `${SHOT_STYLE_SKILL_PREFIX}/${dir}` : null
}

/** 经 Skills workspace 读取镜头风格包；default / 缺失返回空串 */
export async function loadShotStyleSkill(style: ShotStyle): Promise<string> {
  const id = shotStyleSkillId(style)
  if (!id) return ''
  const file = `skills/${id}/SKILL.md`
  try {
    const fsm = skillsManagerWorkspace.filesystem
    if (!fsm || !(await fsm.exists(file))) return ''
    const content = await fsm.readFile(file, { encoding: 'utf-8' })
    return String(content || '').trim()
  } catch {
    return ''
  }
}

export function buildApplyShotStyleUserMessage(opts: {
  storyboardNumber: number
  storyboardId: number
  shotStyle: ShotStyle
  styleSkill: string
}): string {
  const { storyboardNumber, storyboardId, shotStyle, styleSkill } = opts
  const skillBlock = styleSkill
    ? `\n\n## 目标镜头风格规范（shot_style=${shotStyle}）\n须按下列风格包重写本分镜的镜头语言；若与底座 storyboard-breaker 冲突，以本段为准。\n\n${styleSkill}`
    : `\n\n目标镜头风格: shot_style=${shotStyle}（无额外风格包文件，按默认叙事镜头语言重写）。`

  return `请按 shot_style=${shotStyle} 重写分镜 #${storyboardNumber}(ID:${storyboardId}) 的镜头描述。

约束：
1. 先调用 read_storyboard_context 读取该分镜现有 description / atmosphere / 绑定与剧本上下文
2. 只重写本分镜的 description、atmosphere、shot_type、angle、movement；必要时可微调 duration（仍须满足台词时长下限与 8-15 秒段落规则）
3. 调用 update_storyboard 保存；可一并写入 shot_style=${shotStyle}（若工具支持）
4. 不要改 scene_id / character_ids / prop_ids，不要调用 save_storyboards，不要重新拆分整集，不要生成 video_prompt
${skillBlock}`
}

async function getStoryboardCharacterIds(storyboardId: number) {
  const links = await db.select().from(schema.storyboardCharacters)
    .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))
  return links.map(link => link.characterId)
}

async function getStoryboardPropIds(storyboardId: number) {
  const links = await db.select().from(schema.storyboardProps)
    .where(eq(schema.storyboardProps.storyboardId, storyboardId))
  return links.map(link => link.propId)
}

/**
 * 写入 shot_style、清空 video_prompt，并同步跑 storyboard_breaker 按风格重写描述。
 */
export async function applyShotStyle(opts: {
  storyboardId: number
  shotStyle: unknown
  model?: string
  configId?: number
}): Promise<Record<string, unknown>> {
  const shotStyle = normalizeShotStyle(opts.shotStyle)
  const [storyboard] = await db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.id, opts.storyboardId))
  if (!storyboard) throw new Error('镜头不存在')

  const [ep] = await db.select().from(schema.episodes)
    .where(eq(schema.episodes.id, storyboard.episodeId))
  if (!ep) throw new Error('所属集不存在')

  const ts = now()
  await db.update(schema.storyboards).set({
    shotStyle,
    videoPrompt: '',
    updatedAt: ts,
  }).where(eq(schema.storyboards.id, opts.storyboardId))

  logTaskStart('ShotStyle', 'apply', {
    storyboardId: opts.storyboardId,
    episodeId: storyboard.episodeId,
    shotStyle,
  })

  const styleSkill = await loadShotStyleSkill(shotStyle)
  const agent = mastra.getAgent('storyboard_breaker')
  if (!agent) throw new Error('分镜拆解 Agent 不可用')

  try {
    await agent.generate([{
      role: 'user',
      content: buildApplyShotStyleUserMessage({
        storyboardNumber: storyboard.storyboardNumber,
        storyboardId: opts.storyboardId,
        shotStyle,
        styleSkill,
      }),
    }], {
      maxSteps: 8,
      requestContext: buildAgentRequestContext({
        episodeId: storyboard.episodeId,
        dramaId: ep.dramaId,
        modelOverride: opts.model || undefined,
        textConfigId: opts.configId || undefined,
      }),
    })
  } catch (err: any) {
    logTaskError('ShotStyle', 'apply', {
      storyboardId: opts.storyboardId,
      shotStyle,
      error: err?.message,
    })
    throw err
  }

  // 确保标签未被 Agent 覆盖丢弃；video_prompt 保持清空
  await db.update(schema.storyboards).set({
    shotStyle,
    videoPrompt: '',
    updatedAt: now(),
  }).where(eq(schema.storyboards.id, opts.storyboardId))

  const [fresh] = await db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.id, opts.storyboardId))
  logTaskSuccess('ShotStyle', 'apply', {
    storyboardId: opts.storyboardId,
    shotStyle,
    hasDescription: !!(fresh?.description || '').trim(),
  })

  return {
    ...toSnakeCase(fresh),
    character_ids: await getStoryboardCharacterIds(opts.storyboardId),
    prop_ids: await getStoryboardPropIds(opts.storyboardId),
  }
}
