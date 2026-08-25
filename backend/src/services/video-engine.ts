/**
 * 视频引擎（videoEngine）— 与 ComfyUI/云端 provider 解耦的提示词规则选择
 * settings.videoEngine 优先；未配置时按 provider 回退。
 * 引擎 skill 与 Settings → Agent 高级配置 → Skills 共用同一套 workspace 文件。
 */
import { skillsManagerWorkspace, VIDEO_ENGINE_SKILL_PREFIX } from '../agents/skills.js'

export const VIDEO_ENGINES = ['minimax-h3', 'seedance', 'default'] as const
export type VideoEngine = (typeof VIDEO_ENGINES)[number]

export function isVideoEngine(value: unknown): value is VideoEngine {
  return typeof value === 'string' && (VIDEO_ENGINES as readonly string[]).includes(value)
}

/** 解析配置 settings（可能是 JSON 字符串或对象） */
export function parseConfigSettings(settings: unknown): Record<string, unknown> {
  if (!settings) return {}
  if (typeof settings === 'object' && !Array.isArray(settings)) {
    return settings as Record<string, unknown>
  }
  if (typeof settings === 'string') {
    try {
      const parsed = JSON.parse(settings)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return {}
}

/** 未写 videoEngine 时按 provider 回退 */
export function fallbackVideoEngine(provider?: string | null): VideoEngine {
  const p = (provider || '').toLowerCase()
  if (p === 'minimax') return 'minimax-h3'
  if (p === 'volcengine') return 'seedance'
  return 'default'
}

export function resolveVideoEngine(config: {
  provider?: string | null
  settings?: unknown
} | null | undefined): VideoEngine {
  if (!config) return 'default'
  const settings = parseConfigSettings(config.settings)
  const raw = settings.videoEngine
  if (isVideoEngine(raw)) return raw
  return fallbackVideoEngine(config.provider)
}

export function videoEngineSkillId(engine: VideoEngine): string {
  return `${VIDEO_ENGINE_SKILL_PREFIX}/${engine}`
}

/** 经 Skills workspace 读取引擎增量 skill（与高级配置 CRUD 同源）；缺失返回空串 */
export async function loadVideoEngineSkill(engine: VideoEngine): Promise<string> {
  const file = `skills/${videoEngineSkillId(engine)}/SKILL.md`
  try {
    const fsm = skillsManagerWorkspace.filesystem
    if (!fsm || !(await fsm.exists(file))) return ''
    const content = await fsm.readFile(file, { encoding: 'utf-8' })
    return String(content || '').trim()
  } catch {
    return ''
  }
}

export function buildVideoPromptUserMessage(opts: {
  storyboardNumber: number
  storyboardId: number
  configLabel: string
  engine: VideoEngine
  engineSkill: string
}): string {
  const { storyboardNumber, storyboardId, configLabel, engine, engineSkill } = opts
  const skillBlock = engineSkill
    ? `\n\n## 当前引擎规范（videoEngine=${engine}）\n须遵守下列引擎增量规范；若与底座 video-prompt 冲突，以本段为准。\n\n${engineSkill}`
    : `\n\n当前引擎: ${engine}（无额外引擎 skill 文件，仅遵守底座 video-prompt）。`

  return `请为分镜 #${storyboardNumber}(ID:${storyboardId})生成视频提示词(video_prompt)。
视频配置: ${configLabel}；videoEngine: ${engine}。请以本消息中的 videoEngine 与引擎规范为准生成，不要仅凭配置名称猜测。
请先调用 read_storyboard_context 获取该分镜的画面描述(含【镜头N】子镜头与台词/旁白)、氛围及时长，据此生成 video_prompt(按 3 秒分段换行、用 @角色名/@场景名/@道具名 引用参考素材；段落内允许多镜头切镜，段与段可以是不同景别/角度/对象，但不跨场景，切镜点对齐分镜 description 的【镜头N】结构),然后调用 update_storyboard_video_prompt 保存到分镜 ID:${storyboardId}。不要调用 update_storyboard，不要重新拆分整集。${skillBlock}`
}
