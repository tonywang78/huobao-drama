import { toast } from 'vue-sonner'
import { api } from './useApi'

import { skillSelectionStorageKey } from '~/composables/useAgentSkillSelection'

/** 读取 AgentSkillPicker 持久化的 skill_selection；未自定义则 undefined（服务端全量兼容） */
export function readSkillSelectionPayload(agentType: string, scope?: string) {
  try {
    const raw = localStorage.getItem(skillSelectionStorageKey(agentType, scope))
    if (!raw) return undefined
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return undefined
    const out: Record<string, unknown> = {
      include_base: parsed.include_base !== false,
      skill_ids: Array.isArray(parsed.skill_ids) ? parsed.skill_ids.map(String) : [],
    }
    if (typeof parsed.profile_id === 'string' && parsed.profile_id) out.profile_id = parsed.profile_id
    return out
  } catch {
    return undefined
  }
}

export function useAgent() {
  const running = ref(false)
  const runningType = ref<string | null>(null)

  async function run(
    type: string,
    msg: string,
    dramaId: number,
    episodeId: number,
    onDone?: () => void,
    model?: string,
    configId?: number,
  ) {
    if (running.value) { toast.warning('操作执行中'); return }
    running.value = true
    runningType.value = type
    try {
      await api.post<any>(`/agent/${type}/chat`, {
        message: msg,
        drama_id: dramaId,
        episode_id: episodeId,
        model: model || undefined,
        config_id: configId || undefined,
        skill_selection: readSkillSelectionPayload(type),
      })
      toast.success('完成')
      onDone?.()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      running.value = false
      runningType.value = null
    }
  }

  return { running, runningType, run }
}
