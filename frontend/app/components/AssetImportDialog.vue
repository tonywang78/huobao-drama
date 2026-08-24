<template>
  <Teleport to="body">
    <div v-if="open" class="overlay" @click.self="close">
      <div class="dialog import-dialog" role="dialog" aria-modal="true" aria-label="导入资产文件">
        <div class="dialog-header">
          <h2 class="dialog-title">导入资产文件</h2>
          <button type="button" class="btn btn-ghost btn-icon" :disabled="parsing || confirming" @click="close">
            <X :size="16" />
          </button>
        </div>

        <div v-if="step === 'input'" class="dialog-body import-body">
          <p class="import-hint">上传 .md / .txt，或直接粘贴文本。系统会用 Agent 识别角色、场景、道具，确认后再入库。</p>
          <label class="btn import-file-btn">
            <Upload :size="14" />
            选择文件
            <input type="file" accept=".md,.txt,text/plain,text/markdown" hidden @change="onPickFile" />
          </label>
          <div v-if="filename" class="dim import-filename">{{ filename }}</div>
          <textarea
            v-model="pasteText"
            class="textarea import-textarea"
            rows="12"
            placeholder="在此粘贴 Markdown / 文本内容…"
          />
        </div>

        <div v-else class="dialog-body import-body">
          <div class="import-toolbar">
            <span class="dim">识别到 {{ rows.length }} 项，已选 {{ selectedCount }}</span>
            <div class="import-toolbar-actions">
              <button type="button" class="btn btn-sm" @click="toggleAll(true)">全选</button>
              <button type="button" class="btn btn-sm" @click="toggleAll(false)">全不选</button>
              <button type="button" class="btn btn-sm" @click="step = 'input'">返回修改</button>
            </div>
          </div>
          <div class="import-list">
            <label v-for="r in rows" :key="r.key" class="import-row">
              <input v-model="r.selected" type="checkbox" />
              <div class="import-row-main">
                <div class="import-row-head">
                  <select v-model="r.type" class="input import-type" @click.stop>
                    <option v-for="t in typeOptions" :key="t.value" :value="t.value">{{ t.label }}</option>
                  </select>
                  <input v-model="r.name" class="input import-name" @click.stop />
                  <span class="tag mono">{{ r.confidence }}</span>
                </div>
                <div class="import-summary dim">{{ r.summary || '无中文摘要' }}</div>
                <button type="button" class="btn btn-ghost btn-sm" @click.prevent="r.openPrompt = !r.openPrompt">
                  {{ r.openPrompt ? '收起提示词' : '查看 final_prompt' }}
                </button>
                <pre v-if="r.openPrompt" class="import-prompt">{{ r.final_prompt || '（空）' }}</pre>
              </div>
            </label>
          </div>
        </div>

        <div class="dialog-footer">
          <button type="button" class="btn" :disabled="parsing || confirming" @click="close">取消</button>
          <button
            v-if="step === 'input'"
            type="button"
            class="btn btn-primary"
            :disabled="parsing || !pasteText.trim()"
            @click="startParse"
          >
            <Loader2 v-if="parsing" :size="14" class="animate-spin" />
            {{ parsing ? '识别中…' : '开始识别' }}
          </button>
          <button
            v-else
            type="button"
            class="btn btn-primary"
            :disabled="confirming || !selectedCount"
            @click="confirmImport"
          >
            <Loader2 v-if="confirming" :size="14" class="animate-spin" />
            {{ confirming ? '导入中…' : `导入 ${selectedCount} 项` }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Loader2, Upload, X } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { dramaAPI } from '~/composables/useApi'

const props = defineProps({
  open: { type: Boolean, default: false },
  dramaId: { type: Number, required: true },
  episodeId: { type: Number, default: 0 },
})
const emit = defineEmits(['close', 'imported'])

const typeOptions = [
  { value: 'character', label: '角色' },
  { value: 'scene', label: '场景' },
  { value: 'prop', label: '道具' },
]

const step = ref('input')
const parsing = ref(false)
const confirming = ref(false)
const pasteText = ref('')
const filename = ref('')
const rows = ref([])

watch(() => props.open, (v) => {
  if (!v) return
  step.value = 'input'
  parsing.value = false
  confirming.value = false
  pasteText.value = ''
  filename.value = ''
  rows.value = []
})

const selectedCount = computed(() => rows.value.filter(r => r.selected).length)

function close() {
  if (parsing.value || confirming.value) return
  emit('close')
}

async function onPickFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  const name = file.name || ''
  if (!/\.(md|txt)$/i.test(name) && file.type && !/^text\//.test(file.type)) {
    toast.warning('请选择 .md 或 .txt 文本文件')
    return
  }
  filename.value = name
  pasteText.value = await file.text()
}

async function startParse() {
  const content = pasteText.value.trim()
  if (!content) {
    toast.warning('请先粘贴文本或上传文件')
    return
  }
  if (!props.dramaId) {
    toast.warning('项目未加载完成')
    return
  }
  parsing.value = true
  try {
    const res = await dramaAPI.importAssetsParse(props.dramaId, {
      content,
      filename: filename.value || undefined,
      episode_id: props.episodeId || undefined,
    })
    const list = Array.isArray(res?.candidates) ? res.candidates : (Array.isArray(res) ? res : [])
    if (!list.length) {
      toast.warning('未识别到可导入条目')
      return
    }
    rows.value = list.map((c, i) => ({
      key: c.key || `item_${i + 1}`,
      type: ['character', 'scene', 'prop'].includes(c.type) ? c.type : 'scene',
      name: c.name || c.location || `未命名-${i + 1}`,
      summary: c.summary || '',
      final_prompt: c.final_prompt || '',
      role: c.role || '',
      styling: c.styling || '',
      location: c.location || '',
      time: c.time || '',
      lighting: c.lighting || '',
      prop_type: c.prop_type || '',
      confidence: c.confidence || 'medium',
      selected: c.confidence !== 'low',
      openPrompt: false,
    }))
    step.value = 'preview'
  } catch (err) {
    toast.error(err?.message || '识别失败')
  } finally {
    parsing.value = false
  }
}

function toggleAll(on) {
  rows.value.forEach((r) => { r.selected = !!on })
}

async function confirmImport() {
  const items = rows.value.filter(r => r.selected)
  if (!items.length) {
    toast.warning('请至少勾选一项')
    return
  }
  confirming.value = true
  try {
    const result = await dramaAPI.importAssetsConfirm(props.dramaId, {
      episode_id: props.episodeId || undefined,
      items: items.map(r => ({
        type: r.type,
        name: r.name,
        summary: r.summary,
        final_prompt: r.final_prompt,
        role: r.role,
        styling: r.styling,
        location: r.location || (r.type === 'scene' ? r.name : ''),
        time: r.time,
        lighting: r.lighting,
        prop_type: r.prop_type,
        selected: true,
      })),
    })
    toast.success(`导入完成：新增 ${result?.created || 0}，更新 ${result?.updated || 0}`)
    emit('imported', result)
    emit('close')
  } catch (err) {
    toast.error(err?.message || '导入失败')
  } finally {
    confirming.value = false
  }
}
</script>

<style scoped>
.import-dialog {
  width: min(720px, 94vw);
  max-height: min(86vh, 900px);
  display: flex;
  flex-direction: column;
}
.import-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: auto;
}
.import-hint {
  margin: 0;
  font-size: 13px;
  color: var(--text-2);
  line-height: 1.6;
}
.import-file-btn {
  align-self: flex-start;
  display: inline-flex;
  gap: 6px;
  align-items: center;
  cursor: pointer;
}
.import-filename { font-size: 12px; }
.import-textarea {
  width: 100%;
  min-height: 220px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}
.import-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.import-toolbar-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.import-list { display: flex; flex-direction: column; gap: 8px; }
.import-row {
  display: flex;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-card, var(--surface));
  align-items: flex-start;
}
.import-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.import-row-head { display: flex; gap: 8px; align-items: center; }
.import-type { width: 92px; flex: none; }
.import-name { flex: 1; min-width: 0; }
.import-summary { font-size: 12px; line-height: 1.5; white-space: pre-wrap; }
.import-prompt {
  margin: 0;
  padding: 8px;
  border-radius: 8px;
  background: var(--bg-muted, rgba(0,0,0,.04));
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 160px;
  overflow: auto;
}
</style>
