<template>
  <div class="comfy-bindings">
    <div class="comfy-bindings-toolbar">
      <div class="comfy-bindings-title">
        <span class="field-label">参数绑定</span>
        <span class="field-hint">类似 UE 的 Source → Pin：输入字段绑定到节点 inputs，输出指定 history 取哪个节点</span>
      </div>
      <div class="comfy-bindings-actions">
        <button type="button" class="btn btn-ghost btn-sm" :disabled="!canParse" @click="parseWorkflow">解析 API JSON</button>
        <button type="button" class="btn btn-ghost btn-sm" :disabled="!hasParsedGraph" @click="autoGuess">自动猜测</button>
        <button type="button" class="btn btn-ghost btn-sm" :disabled="!hasAnyBinding" @click="clearBindings">清空</button>
      </div>
    </div>

    <div v-if="parseError" class="comfy-bindings-error">{{ parseError }}</div>
    <div v-else-if="!hasParsedGraph" class="comfy-bindings-empty">
      粘贴或载入 API JSON 后点击「解析」，将列出可绑定的输入 Pin 与输出节点。
    </div>

    <template v-else>
      <!-- 输入绑定 -->
      <div class="comfy-bindings-section-label">输入（Inputs）</div>
      <p v-if="refImageSlotCount === 0" class="field-hint comfy-bindings-ref-hint">
        未检测到 <code>LoadImage</code>（或 <code>{{ imagePlaceholderExample }}</code>）：参考图数组将无法注入。请在 workflow 中加入 LoadImage 后重新解析。
      </p>
      <p v-else-if="serviceType === 'video'" class="field-hint comfy-bindings-ref-hint">
        参考图按数组下标注入（最多 {{ maxRefImages }} 张）。须绑到<strong>已接入下游</strong>的 LoadImage（如接到 MiniMax 的 ref_image_0…），不要绑到图上孤立的 LoadImage。视频顺序：场景 → 角色… → 道具…；与 <code>@图片N</code> 一致。
      </p>
      <p v-else class="field-hint comfy-bindings-ref-hint">
        参考图按数组下标注入（当前 {{ refImageSlotCount }} 槽 / 最多 {{ maxRefImages }}）。优先绑已接入下游的 <code>LoadImage.image</code>。
      </p>
      <div class="comfy-bindings-table">
        <div class="comfy-bindings-head">
          <span>Source（业务字段）</span>
          <span class="comfy-bindings-arrow" aria-hidden="true" />
          <span>Target Pin（节点 · 类型 · 输入）</span>
        </div>
        <div
          v-for="src in sources"
          :key="src.key"
          class="comfy-bindings-row"
          :class="{ bound: !!localBindings[src.key] }"
        >
          <div class="comfy-bindings-source">
            <span class="comfy-bindings-dot" :class="{ on: !!localBindings[src.key] }" />
            <div>
              <div class="comfy-bindings-source-label">{{ src.label }}</div>
              <div class="comfy-bindings-source-key">{{ src.key }}</div>
            </div>
          </div>
          <div class="comfy-bindings-link" aria-hidden="true">→</div>
          <BaseSelect
            class="comfy-bindings-select"
            :model-value="pinValue(src.key)"
            :options="pinSelectOptions"
            :placeholder="'未绑定'"
            searchable
            @update:model-value="(v) => setBinding(src.key, v)"
          />
        </div>
      </div>

      <!-- 输出绑定 -->
      <div class="comfy-bindings-section-label">输出（Output）</div>
      <div class="comfy-bindings-table">
        <div class="comfy-bindings-head">
          <span>Result</span>
          <span class="comfy-bindings-arrow" aria-hidden="true" />
          <span>Output Node（节点 · 类型 · 通道）</span>
        </div>
        <div class="comfy-bindings-row" :class="{ bound: !!localBindings.output }">
          <div class="comfy-bindings-source">
            <span class="comfy-bindings-dot" :class="{ on: !!localBindings.output }" />
            <div>
              <div class="comfy-bindings-source-label">{{ outputSourceLabel }}</div>
              <div class="comfy-bindings-source-key">output</div>
            </div>
          </div>
          <div class="comfy-bindings-link" aria-hidden="true">→</div>
          <BaseSelect
            class="comfy-bindings-select"
            :model-value="pinValue('output')"
            :options="outputSelectOptions"
            :placeholder="outputPins.length ? '未绑定（将取首个媒体）' : '未识别到输出节点'"
            searchable
            @update:model-value="(v) => setBinding('output', v)"
          />
        </div>
      </div>
      <div v-if="!outputPins.length" class="field-hint">
        未识别到 Save/Preview/Video 类节点。可将任意节点作为输出候选的「auto」通道，或完善 workflow 后重新解析。
      </div>
    </template>

    <div v-if="hasParsedGraph" class="field-hint comfy-bindings-meta">
      输入 Pin {{ pins.length }} · 参考图槽 {{ refImageSlotCount }} · 输出候选 {{ outputPins.length }} · 已绑定 {{ boundCount }} 项。
      Bindings 优先于 JSON 内占位符（如 <code>{{ placeholderExample }}</code>）。
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import BaseSelect from '~/components/BaseSelect.vue'

const props = defineProps({
  /** API workflow JSON 文本（可空，空则由父级载入默认后再解析） */
  workflowJson: { type: String, default: '' },
  /** 当前绑定表（含特殊键 output） */
  modelValue: { type: Object, default: () => ({}) },
  serviceType: { type: String, default: 'image' },
})

const emit = defineEmits(['update:modelValue', 'parsed'])

/** 与项目视频参考图上限一致（见 getShotReferenceImages） */
const MAX_REF_IMAGES = 9
const maxRefImages = MAX_REF_IMAGES

const CORE_SOURCES = [
  { key: 'prompt', label: 'Prompt', group: 'Text' },
  { key: 'negativePrompt', label: 'Negative Prompt', group: 'Text' },
  { key: 'width', label: 'Width', group: 'Size' },
  { key: 'height', label: 'Height', group: 'Size' },
  { key: 'seed', label: 'Seed', group: 'Sampler' },
  { key: 'duration', label: 'Duration（秒）', group: 'Video' },
  { key: 'aspectRatio', label: 'Aspect Ratio', group: 'Video' },
]

const OUTPUT_NODE_RE = /Save|Preview|VideoCombine|VHS_|ImageOutput|AnimateDiff|CreateVideo|LoadVideo/i

const pins = ref([])
const outputPins = ref([])
const parseError = ref('')
const localBindings = reactive({})
const placeholderExample = '{{PROMPT}}'
const imagePlaceholderExample = '{{IMAGE_N}}'
/** 最近一次解析的 API 节点图，供自动猜测判断「是否被其它节点引用」 */
const lastWorkflow = ref(null)

function maxPlaceholderImageIndex() {
  let max = 0
  for (const p of pins.value) {
    const s = typeof p.sample === 'string' ? p.sample : ''
    for (const m of s.matchAll(/\{\{IMAGE_(\d+)\}\}/g)) {
      max = Math.max(max, Number(m[1]))
    }
  }
  return max
}

function loadImageNodeCount() {
  const linked = collectLinkedNodeIds(lastWorkflow.value)
  const all = []
  for (const p of pins.value) {
    if (/LoadImage/i.test(p.classType) && p.input === 'image') all.push(p.nodeId)
  }
  const uniqueAll = [...new Set(all)]
  if (!uniqueAll.length) return 0
  // 优先只计「被其它节点连线引用」的 LoadImage（真正接到采样器/参考槽的）
  const wired = uniqueAll.filter((id) => linked.has(id))
  return (wired.length ? wired : uniqueAll).length
}

/** API JSON 里 inputs 为 ["nodeId", slot] 的上游节点 */
function collectLinkedNodeIds(workflow) {
  const ids = new Set()
  if (!workflow || typeof workflow !== 'object') return ids
  for (const node of Object.values(workflow)) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) continue
    const inputs = node.inputs
    if (!inputs || typeof inputs !== 'object') continue
    for (const val of Object.values(inputs)) {
      if (isLinkInput(val)) ids.add(String(val[0]))
    }
  }
  return ids
}

/** LoadImage 排序：已接入下游的优先，再按 nodeId；孤儿节点（无连线）排最后 */
function rankedLoadImagePins() {
  const linked = collectLinkedNodeIds(lastWorkflow.value)
  return pins.value
    .filter((p) => /LoadImage/i.test(p.classType) && p.input === 'image')
    .sort((a, b) => {
      const aw = linked.has(a.nodeId) ? 0 : 1
      const bw = linked.has(b.nodeId) ? 0 : 1
      if (aw !== bw) return aw - bw
      return Number(a.nodeId) - Number(b.nodeId)
    })
}

/** 槽位数跟图走：LoadImage 个数与 {{IMAGE_N}} 取大，上限 9；不含历史绑定以免删节点后槽位不缩 */
const refImageSlotCount = computed(() => {
  const n = Math.max(loadImageNodeCount(), maxPlaceholderImageIndex())
  return Math.min(MAX_REF_IMAGES, n)
})

function pruneOrphanImageBindings() {
  const max = Math.min(MAX_REF_IMAGES, Math.max(loadImageNodeCount(), maxPlaceholderImageIndex()))
  let changed = false
  for (const k of Object.keys(localBindings)) {
    const m = /^image_(\d+)$/.exec(k)
    if (m && Number(m[1]) > max) {
      delete localBindings[k]
      changed = true
    }
  }
  return changed
}

const sources = computed(() => {
  const isVideo = props.serviceType === 'video'
  const core = CORE_SOURCES.filter((s) => {
    if (!isVideo && (s.key === 'duration' || s.key === 'aspectRatio')) return false
    return true
  })
  const beforeVideo = core.filter((s) => s.key !== 'duration' && s.key !== 'aspectRatio')
  const video = core.filter((s) => s.key === 'duration' || s.key === 'aspectRatio')
  const images = []
  for (let i = 1; i <= refImageSlotCount.value; i++) {
    images.push({
      key: `image_${i}`,
      label: `参考图 #${i}（数组第 ${i} 项）`,
      group: 'Reference',
    })
  }
  return [...beforeVideo, ...images, ...video]
})

const outputSourceLabel = computed(() => (props.serviceType === 'video' ? 'Primary Video / Media' : 'Primary Image'))

const canParse = computed(() => !!(props.workflowJson || '').trim())
const hasParsedGraph = computed(() => pins.value.length > 0 || outputPins.value.length > 0)
const hasAnyBinding = computed(() => Object.values(localBindings).some((b) => b?.nodeId && b?.input))
const boundCount = computed(() => Object.values(localBindings).filter((b) => b?.nodeId && b?.input).length)

const pinSelectOptions = computed(() => {
  const opts = [{ label: '（未绑定）', value: '' }]
  for (const p of pins.value) {
    opts.push({
      label: `${p.nodeId} · ${p.classType} · ${p.input}`,
      value: pinKey(p),
      group: p.classType,
    })
  }
  return opts
})

const outputSelectOptions = computed(() => {
  const opts = [{ label: '（未绑定 · 自动取首个媒体）', value: '' }]
  for (const p of outputPins.value) {
    opts.push({
      label: `${p.nodeId} · ${p.classType} · ${p.field}`,
      value: `${p.nodeId}::${p.field}`,
      group: p.classType,
    })
  }
  return opts
})

function pinKey(p) {
  return `${p.nodeId}::${p.input}`
}

function parsePinKey(value) {
  if (!value || typeof value !== 'string') return null
  const i = value.indexOf('::')
  if (i <= 0) return null
  return { nodeId: value.slice(0, i), input: value.slice(i + 2) }
}

function pinValue(sourceKey) {
  const b = localBindings[sourceKey]
  if (!b?.nodeId || !b?.input) return ''
  return `${b.nodeId}::${b.input}`
}

function setBinding(sourceKey, pinVal) {
  const target = parsePinKey(pinVal)
  if (!target) {
    delete localBindings[sourceKey]
  } else {
    localBindings[sourceKey] = target
  }
  emitBindings()
}

function emitBindings() {
  const out = {}
  for (const [k, v] of Object.entries(localBindings)) {
    if (v?.nodeId && v?.input) out[k] = { nodeId: String(v.nodeId), input: String(v.input) }
  }
  emit('update:modelValue', out)
}

function syncFromModel() {
  for (const k of Object.keys(localBindings)) delete localBindings[k]
  const src = props.modelValue || {}
  for (const [k, v] of Object.entries(src)) {
    if (v?.nodeId && v?.input) localBindings[k] = { nodeId: String(v.nodeId), input: String(v.input) }
  }
}

watch(() => props.modelValue, syncFromModel, { deep: true, immediate: true })

/** 连接线型 input：["nodeId", slot] — 不可当可写 Pin */
function isLinkInput(v) {
  return Array.isArray(v) && v.length === 2 && (typeof v[0] === 'string' || typeof v[0] === 'number') && typeof v[1] === 'number'
}

function extractPins(workflow) {
  const list = []
  if (!workflow || typeof workflow !== 'object') return list
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) continue
    const classType = node.class_type || node.type || 'Unknown'
    const inputs = node.inputs
    if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) continue
    for (const [input, val] of Object.entries(inputs)) {
      if (isLinkInput(val)) continue
      if (val !== null && typeof val === 'object') continue
      list.push({
        nodeId: String(nodeId),
        classType: String(classType),
        input: String(input),
        sample: val,
      })
    }
  }
  return list.sort((a, b) => Number(a.nodeId) - Number(b.nodeId) || a.input.localeCompare(b.input))
}

function fieldsForOutputClass(classType, preferVideo) {
  if (/VHS_|VideoCombine|SaveVideo|CreateVideo|LoadVideo|Animate/i.test(classType)) {
    return preferVideo ? ['videos', 'gifs', 'images', 'auto'] : ['gifs', 'videos', 'images', 'auto']
  }
  if (/SaveAnimated|Gif/i.test(classType)) {
    return ['gifs', 'images', 'auto']
  }
  if (/SaveImage|PreviewImage/i.test(classType)) {
    return ['images', 'auto']
  }
  return preferVideo ? ['videos', 'gifs', 'images', 'auto'] : ['images', 'gifs', 'videos', 'auto']
}

function extractOutputPins(workflow) {
  const list = []
  if (!workflow || typeof workflow !== 'object') return list
  const preferVideo = props.serviceType === 'video'
  const nodes = Object.entries(workflow)
    .filter(([, node]) => node && typeof node === 'object' && !Array.isArray(node))
    .map(([nodeId, node]) => ({
      nodeId: String(nodeId),
      classType: String(node.class_type || node.type || 'Unknown'),
    }))

  let candidates = nodes.filter((n) => OUTPUT_NODE_RE.test(n.classType))
  // 兜底：没有任何 Save/Preview 时，列出全部节点的 auto，避免无法配置输出
  if (!candidates.length) {
    candidates = nodes.map((n) => ({ ...n, fallback: true }))
  }

  for (const n of candidates) {
    const fields = n.fallback ? ['auto'] : fieldsForOutputClass(n.classType, preferVideo)
    for (const field of fields) {
      list.push({
        nodeId: n.nodeId,
        classType: n.classType,
        field,
      })
    }
  }
  return list.sort((a, b) => Number(a.nodeId) - Number(b.nodeId) || a.field.localeCompare(b.field))
}

function parseWorkflow() {
  parseError.value = ''
  const raw = (props.workflowJson || '').trim()
  if (!raw) {
    parseError.value = '请先粘贴或载入 API JSON'
    pins.value = []
    outputPins.value = []
    return
  }
  try {
    const parsed = JSON.parse(raw)
    // 兼容误贴 { prompt: {..nodes} }
    const workflow = parsed?.prompt && typeof parsed.prompt === 'object' ? parsed.prompt : parsed
    if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) {
      throw new Error('根对象应为 ComfyUI API prompt 节点图')
    }
    pins.value = extractPins(workflow)
    outputPins.value = extractOutputPins(workflow)
    lastWorkflow.value = workflow
    if (!pins.value.length && !outputPins.value.length) {
      parseError.value = '未找到可绑定的输入 Pin 或输出节点'
    }
    if (pruneOrphanImageBindings()) emitBindings()
    emit('parsed', { pinCount: pins.value.length, outputCount: outputPins.value.length, refImageSlots: refImageSlotCount.value })
  } catch (e) {
    pins.value = []
    outputPins.value = []
    lastWorkflow.value = null
    parseError.value = e.message || 'JSON 解析失败'
  }
}

function findPin(predicate) {
  return pins.value.find(predicate)
}

function autoGuess() {
  if (!hasParsedGraph.value) parseWorkflow()
  if (!hasParsedGraph.value) return

  const next = { ...Object.fromEntries(Object.entries(localBindings).filter(([k]) => k === 'output')) }

  // 已有占位符的优先认领
  for (const p of pins.value) {
    const s = typeof p.sample === 'string' ? p.sample : ''
    if (s === '{{PROMPT}}' || s.includes('{{PROMPT}}')) next.prompt = { nodeId: p.nodeId, input: p.input }
    if (s === '{{NEGATIVE_PROMPT}}' || s.includes('{{NEGATIVE_PROMPT}}')) next.negativePrompt = { nodeId: p.nodeId, input: p.input }
    if (s === '{{WIDTH}}') next.width = { nodeId: p.nodeId, input: p.input }
    if (s === '{{HEIGHT}}') next.height = { nodeId: p.nodeId, input: p.input }
    if (s === '{{SEED}}') next.seed = { nodeId: p.nodeId, input: p.input }
    if (s === '{{DURATION}}') next.duration = { nodeId: p.nodeId, input: p.input }
    if (s === '{{ASPECT_RATIO}}') next.aspectRatio = { nodeId: p.nodeId, input: p.input }
    const img = s.match(/\{\{IMAGE_(\d+)\}\}/)
    if (img) next[`image_${img[1]}`] = { nodeId: p.nodeId, input: p.input }
  }

  const clipTexts = pins.value.filter((p) => /CLIPTextEncode/i.test(p.classType) && p.input === 'text')
  if (!next.prompt && clipTexts[0]) next.prompt = { nodeId: clipTexts[0].nodeId, input: clipTexts[0].input }
  if (!next.negativePrompt && clipTexts[1]) next.negativePrompt = { nodeId: clipTexts[1].nodeId, input: clipTexts[1].input }

  if (!next.prompt) {
    const p = findPin((x) => x.input === 'prompt') || findPin((x) => x.input === 'text')
    if (p) next.prompt = { nodeId: p.nodeId, input: p.input }
  }
  if (!next.width) {
    const w = findPin((p) => p.input === 'width')
    if (w) next.width = { nodeId: w.nodeId, input: w.input }
  }
  if (!next.height) {
    const h = findPin((p) => p.input === 'height')
    if (h) next.height = { nodeId: h.nodeId, input: h.input }
  }
  if (!next.seed) {
    const s = findPin((p) => /seed/i.test(p.input))
    if (s) next.seed = { nodeId: s.nodeId, input: s.input }
  }

  const loadImages = rankedLoadImagePins()
  loadImages.slice(0, MAX_REF_IMAGES).forEach((p, i) => {
    const key = `image_${i + 1}`
    if (!next[key]) next[key] = { nodeId: p.nodeId, input: p.input }
  })
  // 去掉超出当前槽位的旧 image_*（autoGuess 重建 next 时也清掉）
  for (const k of Object.keys(next)) {
    const m = /^image_(\d+)$/.exec(k)
    if (m && Number(m[1]) > Math.min(MAX_REF_IMAGES, Math.max(loadImageNodeCount(), maxPlaceholderImageIndex()))) {
      delete next[k]
    }
  }

  if (!next.duration) {
    const d = findPin((p) => /duration|length|frames/i.test(p.input))
    if (d) next.duration = { nodeId: d.nodeId, input: d.input }
  }
  if (!next.aspectRatio) {
    const a = findPin((p) => /aspect|ratio/i.test(p.input))
    if (a) next.aspectRatio = { nodeId: a.nodeId, input: a.input }
  }

  // 输出：优先 SaveVideo / SaveImage / CreateVideo
  if (!next.output && outputPins.value.length) {
    const preferVideo = props.serviceType === 'video'
    const preferred = outputPins.value.find((p) => {
      if (preferVideo) {
        return /SaveVideo|CreateVideo|VHS_|VideoCombine/i.test(p.classType) && (p.field === 'videos' || p.field === 'gifs' || p.field === 'auto')
      }
      return /SaveImage|PreviewImage/i.test(p.classType) && (p.field === 'images' || p.field === 'auto')
    }) || outputPins.value.find((p) => p.field === 'auto') || outputPins.value[0]
    if (preferred) {
      next.output = { nodeId: preferred.nodeId, input: preferred.field }
    }
  }

  for (const k of Object.keys(localBindings)) delete localBindings[k]
  Object.assign(localBindings, next)
  emitBindings()
}

function clearBindings() {
  for (const k of Object.keys(localBindings)) delete localBindings[k]
  emitBindings()
}

/** 供父组件在载入默认 JSON 后调用 */
function parseAndGuess() {
  parseWorkflow()
  if (hasParsedGraph.value) autoGuess()
}

defineExpose({ parseWorkflow, autoGuess, parseAndGuess, clearBindings })
</script>

<style scoped>
.comfy-bindings {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border, rgba(0, 0, 0, 0.08));
  border-radius: 10px;
  background: var(--bg-1, rgba(0, 0, 0, 0.02));
}
.comfy-bindings-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.comfy-bindings-title { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.comfy-bindings-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.comfy-bindings-section-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-3);
  margin-top: 4px;
}
.comfy-bindings-error {
  font-size: 12px;
  color: var(--danger, #c62828);
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(198, 40, 40, 0.08);
}
.comfy-bindings-empty {
  font-size: 12px;
  color: var(--text-3);
  padding: 10px 0 2px;
}
.comfy-bindings-table { display: flex; flex-direction: column; gap: 6px; }
.comfy-bindings-head {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) 24px minmax(180px, 1.4fr);
  gap: 8px;
  font-size: 11px;
  color: var(--text-3);
  padding: 0 4px 4px;
}
.comfy-bindings-row {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) 24px minmax(180px, 1.4fr);
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--bg-0, #fff);
  border: 1px solid transparent;
}
.comfy-bindings-row.bound { border-color: rgba(46, 125, 50, 0.25); }
.comfy-bindings-source { display: flex; align-items: center; gap: 8px; min-width: 0; }
.comfy-bindings-source-label { font-size: 13px; font-weight: 600; }
.comfy-bindings-source-key { font-size: 10px; color: var(--text-3); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.comfy-bindings-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-3, #999);
  flex-shrink: 0;
}
.comfy-bindings-dot.on { background: #2e7d32; box-shadow: 0 0 0 3px rgba(46, 125, 50, 0.15); }
.comfy-bindings-link {
  text-align: center;
  color: var(--text-3);
  font-size: 12px;
}
.comfy-bindings-meta { margin-top: 2px; }
.comfy-bindings-ref-hint { margin: 0 0 4px; line-height: 1.45; }
@media (max-width: 640px) {
  .comfy-bindings-head { display: none; }
  .comfy-bindings-row {
    grid-template-columns: 1fr;
    gap: 6px;
  }
  .comfy-bindings-link { display: none; }
}
</style>
