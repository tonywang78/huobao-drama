/**
 * 最终提示词服务
 * 生图前确保角色/场景/道具已有「最终提示词」：
 * - 角色 → 三视图（character turnaround：正面/侧面/背面）
 * - 场景 → 固定视角 + 前景/中景/后景
 * - 道具 → 白底单品静物（single product shot on pure white background）
 * 缺失时运行 prompt_generator Agent 创作并保存；失败返回 ''，由调用方回退到本地拼接提示词
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { mastra } from '../mastra/index.js'
import { buildAgentRequestContext } from '../agents/context.js'
import type { ResolvedSkillSelection } from '../agents/skills.js'
import { logTaskError, logTaskProgress } from '../utils/task-logger.js'

type CharacterRow = typeof schema.characters.$inferSelect
type SceneRow = typeof schema.scenes.$inferSelect
type PropRow = typeof schema.props.$inferSelect

/** 顶栏选择的文本模型/配置覆盖（不传则跟随 Agent 与文本配置默认） */
export interface PromptAgentOptions {
  model?: string
  configId?: number
  skillSelection?: ResolvedSkillSelection | null
}

async function runPromptAgent(episodeId: number, dramaId: number, message: string, opts?: PromptAgentOptions) {
  const agent = mastra.getAgent('prompt_generator')
  if (!agent) throw new Error('图片提示词 Agent 不可用')
  const requestContext = buildAgentRequestContext({
    episodeId,
    dramaId,
    modelOverride: opts?.model || undefined,
    textConfigId: opts?.configId || undefined,
    skillSelection: opts?.skillSelection || undefined,
  })
  await agent.generate([{ role: 'user', content: message }], { maxSteps: 12, requestContext })
}

function characterPromptRequest(char: CharacterRow) {
  return [
    `为角色「${char.name}」(character_id=${char.id}) 生成三视图最终提示词，并调用 save_character_final_prompt 保存。`,
    '必须依据以下最新字段创作，样貌与妆造的改动必须全部落地，不要只根据角色名想象：',
    `角色名：${char.name || ''}`,
    `定位：${char.role || ''}`,
    `样貌：${char.appearance || char.description || ''}`,
    `妆造：${char.styling || ''}`,
  ].join('\n')
}

function scenePromptRequest(scene: SceneRow) {
  return [
    `为场景「${scene.location}」(scene_id=${scene.id}) 生成固定视角（前景/中景/后景）最终提示词，并调用 save_scene_final_prompt 保存。`,
    '必须依据以下最新字段创作，场景描述与光影的改动必须全部落地，不要只根据地点名想象：',
    `地点：${scene.location || ''}`,
    `时间：${scene.time || ''}`,
    `场景描述：${scene.prompt || ''}`,
    `场景光影：${scene.lighting || ''}`,
  ].join('\n')
}

function propPromptRequest(prop: PropRow) {
  return [
    `为道具「${prop.name}」(prop_id=${prop.id}) 生成白底单品最终提示词，并调用 save_prop_final_prompt 保存。`,
    '必须依据以下最新字段创作，物品外貌的改动必须全部落地，不要只根据道具名想象：',
    `道具名：${prop.name || ''}`,
    `类型：${prop.type || ''}`,
    `物品外貌：${prop.description || ''}`,
  ].join('\n')
}

/** 确保角色拥有三视图最终提示词，返回最终提示词（失败返回 ''）；force 时忽略已有提示词强制重新生成 */
export async function ensureCharacterFinalPrompt(char: CharacterRow, episodeId: number, force = false, opts?: PromptAgentOptions): Promise<string> {
  if (char.finalPrompt && !force) return char.finalPrompt
  try {
    logTaskProgress('FinalPrompt', 'character-generate', { characterId: char.id, episodeId })
    await runPromptAgent(episodeId, char.dramaId, characterPromptRequest(char), opts)
    const [fresh] = await db.select().from(schema.characters).where(eq(schema.characters.id, char.id))
    return fresh?.finalPrompt || ''
  } catch (err: any) {
    logTaskError('FinalPrompt', 'character-generate', { characterId: char.id, error: err.message })
    return ''
  }
}

/** 确保场景拥有固定视角（前中后景）最终提示词，返回最终提示词（失败返回 ''）；force 时忽略已有提示词强制重新生成 */
export async function ensureSceneFinalPrompt(scene: SceneRow, episodeId: number, force = false, opts?: PromptAgentOptions): Promise<string> {
  if (scene.finalPrompt && !force) return scene.finalPrompt
  try {
    logTaskProgress('FinalPrompt', 'scene-generate', { sceneId: scene.id, episodeId })
    await runPromptAgent(episodeId, scene.dramaId, scenePromptRequest(scene), opts)
    const [fresh] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, scene.id))
    return fresh?.finalPrompt || ''
  } catch (err: any) {
    logTaskError('FinalPrompt', 'scene-generate', { sceneId: scene.id, error: err.message })
    return ''
  }
}

/** 确保道具拥有白底单品最终提示词，返回最终提示词（失败返回 ''）；force 时忽略已有提示词强制重新生成 */
export async function ensurePropFinalPrompt(prop: PropRow, episodeId: number, force = false, opts?: PromptAgentOptions): Promise<string> {
  if (prop.finalPrompt && !force) return prop.finalPrompt
  try {
    logTaskProgress('FinalPrompt', 'prop-generate', { propId: prop.id, episodeId })
    await runPromptAgent(episodeId, prop.dramaId, propPromptRequest(prop), opts)
    const [fresh] = await db.select().from(schema.props).where(eq(schema.props.id, prop.id))
    return fresh?.finalPrompt || ''
  } catch (err: any) {
    logTaskError('FinalPrompt', 'prop-generate', { propId: prop.id, error: err.message })
    return ''
  }
}
