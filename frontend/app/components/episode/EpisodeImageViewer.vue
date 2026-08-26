<script setup>
import { Loader2, Plus, X, ListTodo, Upload, Play, MapPin } from 'lucide-vue-next'

const wb = useEpisodeWorkbenchInject()
</script>

<template>
      <div v-if="wb.imageViewer.open && wb.imageViewer.src" class="overlay image-viewer-overlay" @click.self="wb.closeImageViewer">
        <div class="dialog image-viewer-dialog">
          <div class="image-viewer-head">
            <div class="image-viewer-title">{{ wb.imageViewer.title || '图片预览' }}</div>
            <button class="btn btn-ghost btn-icon" @click="wb.closeImageViewer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="image-viewer-body">
            <img :src="wb.imageViewer.src" :alt="wb.imageViewer.title || '图片预览'" class="image-viewer-img" />
          </div>
        </div>
      </div>
</template>
