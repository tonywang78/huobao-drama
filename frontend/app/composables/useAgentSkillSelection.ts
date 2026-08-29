/**
 * 按 Agent 类型管理 Skill 选择（Profile + 底座开关 + 可选多选）
 * 选择结果持久化到 localStorage：huobao:skillSelection:{agentType}
 */
import { computed, ref, watch } from 'vue'
import { skillsAPI, skillProfilesAPI } from '~/composables/useApi'

export type SkillSelectionValue = {
  profile_id?: string
  include_base: boolean
  skill_ids: string[]
}

export function skillSelectionStorageKey(agentType: string, scope?: string) {
  return scope ? `huobao:skillSelection:${agentType}:${scope}` : `huobao:skillSelection:${agentType}`
}

function readStored(agentType: string, scope?: string): SkillSelectionValue | null {
  try {
    const raw = localStorage.getItem(skillSelectionStorageKey(agentType, scope))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      profile_id: typeof parsed.profile_id === 'string' ? parsed.profile_id : undefined,
      include_base: parsed.include_base !== false,
      skill_ids: Array.isArray(parsed.skill_ids) ? parsed.skill_ids.map(String) : [],
    }
  } catch {
    return null
  }
}

function writeStored(agentType: string, value: SkillSelectionValue, scope?: string) {
  try {
    localStorage.setItem(skillSelectionStorageKey(agentType, scope), JSON.stringify(value))
  } catch { /* ignore */ }
}

/** 默认：不传 skill_selection（兼容全量）；UI 展示为「默认全量」态 */
export function defaultSelection(): SkillSelectionValue {
  return { include_base: true, skill_ids: [] }
}

/**
 * @param agentTypeRef string | Ref/Computed
 * @param opts.mode 'compat' = 默认不发送 body（全量）；'explicit' = 始终发送当前选择
 * @param opts.scope 独立存储域，如 shot-detail；不传则与全局 toolbar 共用
 */
export function useAgentSkillSelection(agentType: string | (() => string) | { value: string }, opts: { mode?: 'compat' | 'explicit'; scope?: string } = {}) {
  const mode = opts.mode || 'compat'
  const scope = opts.scope
  const resolveType = () => {
    if (typeof agentType === 'function') return agentType()
    if (agentType && typeof agentType === 'object' && 'value' in agentType) return String(agentType.value)
    return String(agentType)
  }

  const catalog = ref<{ base: any[]; optional: any[] }>({ base: [], optional: [] })
  const profiles = ref<any[]>([])
  const loading = ref(false)
  const selection = ref<SkillSelectionValue>(defaultSelection())
  /** 是否使用自定义选择（false 时 payload 为 undefined，走服务端全量兼容） */
  const customized = ref(false)

  const agentTypeComputed = computed(() => resolveType())

  function hydrateFromStorage() {
    const type = resolveType()
    const stored = readStored(type, scope)
    if (stored) {
      selection.value = stored
      customized.value = true
    } else {
      selection.value = defaultSelection()
      customized.value = false
    }
  }

  async function load() {
    const type = resolveType()
    if (!type) return
    loading.value = true
    try {
      const [cat, profs] = await Promise.all([
        skillsAPI.catalog(type),
        skillProfilesAPI.list(type),
      ])
      catalog.value = {
        base: Array.isArray(cat?.base) ? cat.base : [],
        optional: Array.isArray(cat?.optional) ? cat.optional : [],
      }
      profiles.value = Array.isArray(profs) ? profs : []
      hydrateFromStorage()
      // 清理已删除的 profile / skill
      if (selection.value.profile_id && !profiles.value.some(p => p.id === selection.value.profile_id)) {
        selection.value = { ...selection.value, profile_id: undefined }
      }
      const optionalIds = new Set(catalog.value.optional.map(s => s.id))
      selection.value = {
        ...selection.value,
        skill_ids: selection.value.skill_ids.filter(id => optionalIds.has(id)),
      }
    } finally {
      loading.value = false
    }
  }

  function persist() {
    if (customized.value) writeStored(resolveType(), selection.value, scope)
    else {
      try { localStorage.removeItem(skillSelectionStorageKey(resolveType(), scope)) } catch { /* ignore */ }
    }
  }

  function setCustomized(v: boolean) {
    customized.value = v
    if (!v) selection.value = defaultSelection()
    persist()
  }

  function applyProfile(profileId: string | '') {
    customized.value = true
    if (!profileId) {
      selection.value = { ...selection.value, profile_id: undefined }
      persist()
      return
    }
    const p = profiles.value.find(x => x.id === profileId)
    if (!p) return
    selection.value = {
      profile_id: p.id,
      include_base: p.include_base !== false,
      skill_ids: Array.isArray(p.skill_ids) ? [...p.skill_ids] : [],
    }
    persist()
  }

  function toggleSkill(id: string) {
    customized.value = true
    const set = new Set(selection.value.skill_ids)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    selection.value = {
      ...selection.value,
      profile_id: selection.value.profile_id, // 微调后仍保留 profile 标记
      skill_ids: [...set],
    }
    persist()
  }

  function setIncludeBase(v: boolean) {
    customized.value = true
    selection.value = { ...selection.value, include_base: v }
    persist()
  }

  /** 发给 API 的 skill_selection；compat 模式下未自定义时返回 undefined */
  const payload = computed(() => {
    if (mode === 'compat' && !customized.value) return undefined
    const out: SkillSelectionValue = {
      include_base: selection.value.include_base,
      skill_ids: [...selection.value.skill_ids],
    }
    if (selection.value.profile_id) out.profile_id = selection.value.profile_id
    return out
  })

  const summary = computed(() => {
    if (!customized.value && mode === 'compat') return '默认全量'
    const parts: string[] = []
    if (selection.value.profile_id) {
      const p = profiles.value.find(x => x.id === selection.value.profile_id)
      parts.push(p?.name || selection.value.profile_id)
    }
    parts.push(selection.value.include_base ? '底座开' : '底座关')
    if (selection.value.skill_ids.length) parts.push(`+${selection.value.skill_ids.length}`)
    return parts.join(' · ')
  })

  watch(agentTypeComputed, () => { load() })

  return {
    catalog,
    profiles,
    selection,
    customized,
    loading,
    payload,
    summary,
    load,
    setCustomized,
    applyProfile,
    toggleSkill,
    setIncludeBase,
    persist,
  }
}
