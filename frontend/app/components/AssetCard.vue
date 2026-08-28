<script setup>
import { Loader2 } from 'lucide-vue-next'

const props = defineProps({
  type: { type: String, required: true }, // character | scene | prop
  title: { type: String, default: '' },
  tag: { type: String, default: '' },
  metaLines: { type: Array, default: () => [] },
  finalPromptLabel: { type: String, default: '' },
  finalPrompt: { type: String, default: '' },
  finalPromptPlaceholder: { type: String, default: '' },
  imageSrc: { type: String, default: '' },
  hasImage: { type: Boolean, default: false },
  pending: { type: Boolean, default: false },
  uploading: { type: Boolean, default: false },
  downloadHref: { type: String, default: '' },
  downloadName: { type: String, default: '' },
  downloadTitle: { type: String, default: '下载图片' },
  uploadTitle: { type: String, default: '上传图片' },
  duplicateTitle: { type: String, default: '复制资产' },
  duplicating: { type: Boolean, default: false },
  previewTitle: { type: String, default: '' },
  selected: { type: Boolean, default: false },
  selectMode: { type: Boolean, default: false },
  deleteTitle: { type: String, default: '移除' },
  thumbSrc: { type: String, default: '' },
})

defineEmits([
  'click', 'delete', 'toggle-select', 'generate', 'upload', 'duplicate', 'preview', 'thumb-error',
])

const badgeText = computed(() => {
  if (props.hasImage) return '已生成'
  if (props.pending) return '生成中'
  return '待生成'
})

const primaryLabel = computed(() => {
  if (props.pending) return '生成中'
  if (props.hasImage) return '重绘'
  return '生成'
})

const coverThumb = computed(() => props.thumbSrc || props.imageSrc)
</script>

<template>
  <article
    class="card asset-card asset-click-card"
    :class="{ 'is-selected': selectMode && selected }"
    tabindex="0"
    role="button"
    @click="$emit('click')"
    @keydown.enter.prevent="$emit('click')"
    @keydown.space.prevent="$emit('click')"
  >
    <span
      v-if="selectMode"
      class="shot-check asset-check"
      :class="{ on: selected }"
      @click.stop="$emit('toggle-select')"
    >
      <svg v-if="selected" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </span>
    <button v-else class="asset-del-btn" type="button" :title="deleteTitle" @click.stop="$emit('delete')">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>

    <div class="asset-cover wide">
      <img
        v-if="hasImage && coverThumb"
        :src="coverThumb"
        class="previewable-image"
        loading="lazy"
        @error="$emit('thumb-error', $event)"
        @click.stop="selectMode ? $emit('toggle-select') : $emit('preview')"
      />
      <div v-else class="asset-cover-empty">
        <svg v-if="type === 'character'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <svg v-else-if="type === 'scene'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
      </div>
      <span class="asset-cover-badge" :class="hasImage ? 'is-ready' : (pending ? 'is-pending' : '')">{{ badgeText }}</span>
    </div>

    <div class="asset-body">
      <div class="asset-head-row">
        <strong class="asset-name" :title="title">{{ title }}</strong>
        <span v-if="tag" class="tag">{{ tag }}</span>
      </div>
      <div
        v-for="(line, i) in metaLines"
        :key="i"
        class="asset-meta asset-desc dim"
        :title="line"
      >{{ line }}</div>
      <div class="asset-final-prompt" :title="finalPrompt || finalPromptPlaceholder">
        <span class="afp-label">{{ finalPromptLabel }}</span>
        <span :class="['afp-text', !finalPrompt && 'dim']">{{ finalPrompt || finalPromptPlaceholder }}</span>
      </div>
    </div>

    <div class="asset-foot">
      <div class="asset-foot-actions">
        <button class="btn btn-sm" type="button" :disabled="pending" @click.stop="$emit('generate')">
          <Loader2 v-if="pending" :size="11" class="animate-spin" />
          {{ primaryLabel }}
        </button>
        <button class="btn btn-sm asset-foot-icon-btn" type="button" :title="uploadTitle" :disabled="uploading" @click.stop="$emit('upload')">
          <Loader2 v-if="uploading" :size="11" class="animate-spin" />
          <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        </button>
        <button class="btn btn-sm asset-foot-icon-btn" type="button" :title="duplicateTitle" :disabled="duplicating" @click.stop="$emit('duplicate')">
          <Loader2 v-if="duplicating" :size="11" class="animate-spin" />
          <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <a
          v-if="hasImage && downloadHref"
          :href="downloadHref"
          :download="downloadName"
          class="btn btn-sm asset-foot-icon-btn"
          :title="downloadTitle"
          @click.stop
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </a>
      </div>
    </div>
  </article>
</template>
