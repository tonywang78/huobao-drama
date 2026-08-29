<script setup>
import { ref, onMounted, watch, reactive, nextTick } from 'vue'
import { ChevronDown, Settings2 } from 'lucide-vue-next'
import { useAgentSkillSelection } from '~/composables/useAgentSkillSelection'

const props = defineProps({
  agentType: { type: String, required: true },
  variant: { type: String, default: 'compact' },
  /** 触发器上的短标签，如「拆分」「提示词」 */
  label: { type: String, default: '' },
  /** 独立存储域，与顶部 toolbar 选择互不影响 */
  scope: { type: String, default: '' },
})

const open = ref(false)
const rootEl = ref(null)
const panelStyle = ref({})
const skill = reactive(useAgentSkillSelection(() => props.agentType, {
  scope: props.scope || undefined,
}))

onMounted(() => skill.load())
watch(() => props.agentType, () => skill.load())

async function toggle() {
  open.value = !open.value
  if (open.value) await nextTick(() => placePanel())
}

function placePanel() {
  const el = rootEl.value
  if (!el || typeof window === 'undefined') return
  const rect = el.getBoundingClientRect()
  const width = Math.min(360, Math.max(300, window.innerWidth - 24))
  let left = rect.right - width
  if (left < 12) left = 12
  if (left + width > window.innerWidth - 12) left = Math.max(12, window.innerWidth - width - 12)
  let top = rect.bottom + 4
  const maxH = Math.min(420, window.innerHeight - top - 12)
  if (top + 200 > window.innerHeight && rect.top > 220) {
    top = Math.max(12, rect.top - Math.min(maxH, 360) - 4)
  }
  panelStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    width: `${width}px`,
    maxHeight: `${maxH}px`,
    zIndex: 80,
  }
}

defineExpose({
  getPayload: () => skill.payload?.value ?? skill.payload,
  summary: () => skill.summary?.value ?? skill.summary,
  customized: () => skill.customized?.value ?? skill.customized,
  reload: () => skill.load(),
})
</script>

<template>
  <div ref="rootEl" class="asp" :class="[`is-${variant}`, { open }]">
    <button
      type="button"
      class="asp-trigger"
      :class="{ active: skill.customized }"
      :title="(label ? label + ' · ' : '') + skill.summary"
      @click="toggle"
    >
      <Settings2 :size="12" />
      <span v-if="label" class="asp-trigger-name">{{ label }}</span>
      <span class="asp-trigger-label">{{ skill.summary }}</span>
      <ChevronDown :size="11" class="asp-chevron" />
    </button>

    <template v-if="variant === 'block'">
      <div v-if="open" class="asp-panel asp-panel-inline">
        <div class="asp-head">
          <span>{{ label ? `${label} · Skill` : 'Skill 选择' }}</span>
          <button type="button" class="asp-link" @click="skill.setCustomized(false); open = false">恢复默认全量</button>
        </div>
        <p class="asp-hint">可选预设后微调；建议少选以控制提示词体积。</p>
        <label class="asp-field">
          <span class="asp-label">预设 Profile</span>
          <select
            class="input asp-select"
            :value="skill.selection.profile_id || ''"
            @change="skill.applyProfile(($event.target).value)"
          >
            <option value="">不使用预设</option>
            <option v-for="p in skill.profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label class="asp-toggle">
          <input
            type="checkbox"
            :checked="skill.selection.include_base"
            @change="skill.setIncludeBase(($event.target).checked)"
          />
          <span>注入底座 Skill</span>
        </label>
        <div v-if="skill.catalog.base.length" class="asp-base-list">
          <span v-for="b in skill.catalog.base" :key="b.id" class="asp-chip">{{ b.name }}</span>
        </div>
        <div class="asp-label" style="margin-top:8px">可选 Skill</div>
        <div v-if="!skill.catalog.optional.length" class="asp-empty">暂无子 Skill，可在设置页新增</div>
        <label v-for="s in skill.catalog.optional" :key="s.id" class="asp-check">
          <input
            type="checkbox"
            :checked="skill.selection.skill_ids.includes(s.id)"
            @change="skill.toggleSkill(s.id)"
          />
          <span>
            <strong>{{ s.name }}</strong>
            <em v-if="s.description">{{ s.description }}</em>
          </span>
        </label>
      </div>
    </template>

    <Teleport v-else to="body">
      <div v-if="open" class="asp-backdrop" @click="open = false" />
      <div v-if="open" class="asp-panel" :style="panelStyle">
        <div class="asp-head">
          <span>{{ label ? `${label} · Skill` : 'Skill 选择' }}</span>
          <button type="button" class="asp-link" @click="skill.setCustomized(false); open = false">恢复默认全量</button>
        </div>
        <p class="asp-hint">可选预设后微调；建议少选以控制提示词体积。</p>
        <label class="asp-field">
          <span class="asp-label">预设 Profile</span>
          <select
            class="input asp-select"
            :value="skill.selection.profile_id || ''"
            @change="skill.applyProfile(($event.target).value)"
          >
            <option value="">不使用预设</option>
            <option v-for="p in skill.profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label class="asp-toggle">
          <input
            type="checkbox"
            :checked="skill.selection.include_base"
            @change="skill.setIncludeBase(($event.target).checked)"
          />
          <span>注入底座 Skill</span>
        </label>
        <div v-if="skill.catalog.base.length" class="asp-base-list">
          <span v-for="b in skill.catalog.base" :key="b.id" class="asp-chip">{{ b.name }}</span>
        </div>
        <div class="asp-label" style="margin-top:8px">可选 Skill</div>
        <div v-if="!skill.catalog.optional.length" class="asp-empty">暂无子 Skill，可在设置页新增</div>
        <label v-for="s in skill.catalog.optional" :key="s.id" class="asp-check">
          <input
            type="checkbox"
            :checked="skill.selection.skill_ids.includes(s.id)"
            @change="skill.toggleSkill(s.id)"
          />
          <span>
            <strong>{{ s.name }}</strong>
            <em v-if="s.description">{{ s.description }}</em>
          </span>
        </label>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.asp { position: relative; display: inline-flex; flex-direction: column; align-items: flex-start; }
.asp-trigger {
  display: inline-flex; align-items: center; gap: 4px;
  height: 28px; padding: 0 8px; border-radius: 6px;
  border: 1px solid var(--border, #e5e7eb); background: var(--bg, #fff);
  color: var(--muted, #6b7280); font-size: 11px; cursor: pointer;
}
.asp-trigger.active { color: var(--accent, #2563eb); border-color: color-mix(in srgb, var(--accent, #2563eb) 40%, var(--border)); }
.asp-trigger-name {
  font-weight: 600;
  color: var(--text-0, #111);
  flex-shrink: 0;
}
.asp-trigger-name::after {
  content: '·';
  margin-left: 2px;
  font-weight: 400;
  color: var(--muted, #6b7280);
}
.asp-trigger-label { max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asp-chevron { opacity: .7; }
.asp-backdrop { position: fixed; inset: 0; z-index: 70; }
.asp-panel {
  overflow: auto;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--border, #e5e7eb);
  background: var(--panel, #fff);
  box-shadow: 0 8px 24px rgba(0,0,0,.12);
  box-sizing: border-box;
}
.asp-panel-inline {
  position: static;
  width: 100%;
  min-width: 280px;
  margin-top: 6px;
  box-shadow: none;
}
.asp-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12px; font-weight: 600; }
.asp-link { border: 0; background: none; color: var(--accent); font-size: 11px; cursor: pointer; white-space: nowrap; }
.asp-hint { margin: 6px 0 10px; font-size: 11px; color: var(--muted, #6b7280); line-height: 1.4; }
.asp-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; width: 100%; }
.asp-label { font-size: 11px; color: var(--muted); }
.asp-select {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  font-size: 12px;
  height: 34px;
  padding: 6px 10px;
}
.asp-toggle { display: flex; align-items: center; gap: 6px; font-size: 12px; margin: 4px 0; }
.asp-base-list { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px; }
.asp-chip { font-size: 10px; padding: 2px 6px; border-radius: 999px; background: var(--bg-muted, #f3f4f6); color: var(--muted); }
.asp-empty { font-size: 11px; color: var(--muted); padding: 4px 0; }
.asp-check { display: flex; gap: 8px; align-items: flex-start; padding: 6px 0; font-size: 12px; border-top: 1px solid var(--border, #eee); }
.asp-check strong { display: block; font-weight: 600; }
.asp-check em { display: block; font-style: normal; font-size: 11px; color: var(--muted); margin-top: 2px; }
</style>
