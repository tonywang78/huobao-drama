<template>
  <div v-if="history.length" class="asset-image-history">
    <div class="asset-image-history-head">
      <span>历史图片</span>
      <span class="asset-image-history-count">{{ history.length }}</span>
      <button
        v-if="previewImageUrl"
        type="button"
        class="btn btn-sm btn-primary asset-image-history-set-main"
        @click="$emit('set-main')"
      >
        设为主图
      </button>
    </div>
    <div class="asset-image-history-list">
      <div
        v-for="t in history"
        :key="t.id"
        :class="[
          'asset-image-history-item',
          {
            current: isCurrentImage(t),
            viewing: !!previewImageUrl && previewImageUrl === taskImagePath(t),
          },
        ]"
        role="button"
        tabindex="0"
        @click="$emit('preview', t)"
        @keydown.enter.prevent="$emit('preview', t)"
      >
        <img
          :src="thumbOf(normalizeAssetImageSrc(taskImagePath(t)))"
          loading="lazy"
          alt=""
          @error="thumbFallback($event, normalizeAssetImageSrc(taskImagePath(t)))"
        />
        <span class="asset-image-history-time">{{ formatHistoryTime(taskCreatedAt(t)) }}</span>
        <span v-if="isCurrentImage(t)" class="asset-image-history-badge">当前</span>
        <button
          v-else
          type="button"
          class="asset-image-history-del"
          title="删除该记录"
          @click.stop="$emit('remove', t)"
        >
          ×
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import {
  formatHistoryTime,
  normalizeAssetImageSrc,
  taskCreatedAt,
  taskImagePath,
} from '~/composables/useAssetImageHistory'

defineProps({
  history: { type: Array, default: () => [] },
  previewImageUrl: { type: String, default: '' },
  isCurrentImage: { type: Function, required: true },
})

defineEmits(['preview', 'remove', 'set-main'])
</script>

<style scoped>
.asset-image-history {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}
.asset-image-history-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 7px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-2);
}
.asset-image-history-set-main {
  margin-left: auto;
}
.asset-image-history-count {
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-3);
  font-size: 10px;
  font-weight: 750;
}
.asset-image-history-list {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}
.asset-image-history-item {
  position: relative;
  flex: 0 0 72px;
  height: 52px;
  border-radius: 6px;
  overflow: hidden;
  border: 2px solid transparent;
  cursor: pointer;
  background: var(--surface-muted);
}
.asset-image-history-item:hover {
  border-color: var(--border-strong);
}
.asset-image-history-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.asset-image-history-item.current {
  border-color: var(--accent);
}
.asset-image-history-item.viewing {
  border-color: var(--accent-2, var(--accent));
  box-shadow: 0 0 0 1px var(--accent);
}
.asset-image-history-time {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 2px 4px;
  font-size: 9px;
  color: #fff;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.65));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.asset-image-history-badge {
  position: absolute;
  top: 3px;
  right: 3px;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 8px;
  font-weight: 700;
  color: #fff;
  background: var(--accent);
}
.asset-image-history-del {
  display: none;
  position: absolute;
  top: 2px;
  right: 2px;
  width: 16px;
  height: 16px;
  border: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  align-items: center;
  justify-content: center;
}
.asset-image-history-item:hover .asset-image-history-del {
  display: flex;
}
</style>
