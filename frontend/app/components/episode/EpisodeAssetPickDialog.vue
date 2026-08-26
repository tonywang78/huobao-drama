<script setup>
import { Loader2, Plus, X, ListTodo, Upload, Play, MapPin } from 'lucide-vue-next'

const wb = useEpisodeWorkbenchInject()
</script>

<template>
      <div v-if="wb.assetPick.open" class="overlay" @click.self="wb.assetPick.open = false">
        <div class="dialog asset-pick-dialog">
          <header class="dialog-head">
            <h2 class="dialog-title">从素材库选入{{ wb.assetPickTypeLabel }}</h2>
            <button class="btn btn-ghost btn-icon" @click="wb.assetPick.open = false">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </header>
          <div class="dialog-body asset-pick-body">
            <div v-if="wb.assetPick.loading" class="asset-pick-empty">
              <Loader2 :size="18" class="animate-spin" style="color:var(--accent)" />
              <span>加载可选项…</span>
            </div>
            <div v-else-if="!wb.assetPick.items.length" class="asset-pick-empty">
              项目素材库暂无未挂本集的{{ wb.assetPickTypeLabel }}
            </div>
            <div v-else class="asset-pick-list">
              <label
                v-for="item in wb.assetPick.items"
                :key="item.id"
                class="asset-pick-row"
                :class="{ on: wb.assetPick.selectedIds.includes(item.id) }"
              >
                <input
                  type="checkbox"
                  :checked="wb.assetPick.selectedIds.includes(item.id)"
                  @change="wb.toggleAssetPick(item.id)"
                />
                <span class="asset-pick-thumb">
                  <img v-if="wb.assetImageSrc(item)" :src="wb.thumbOf(wb.assetImageSrc(item))" loading="lazy" @error="wb.thumbFallback($event, wb.assetImageSrc(item))" />
                  <span v-else class="asset-pick-thumb-empty">无图</span>
                </span>
                <span class="asset-pick-meta">
                  <strong>{{ item.name || item.location || `#${item.id}` }}</strong>
                  <span class="dim">{{ wb.assetPickSubtitle(item) }}</span>
                </span>
              </label>
            </div>
          </div>
          <footer class="dialog-foot">
            <button class="btn" @click="wb.assetPick.open = false">取消</button>
            <button
              class="btn btn-primary"
              :disabled="wb.assetPick.saving || !wb.assetPick.selectedIds.length"
              @click="wb.confirmAssetPick"
            >
              <Loader2 v-if="wb.assetPick.saving" :size="12" class="animate-spin" />
              选入（{{ wb.assetPick.selectedIds.length }}）
            </button>
          </footer>
        </div>
      </div>
</template>
