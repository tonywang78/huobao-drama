<script setup>
import { Loader2, Plus, X, ListTodo, Upload, Play, MapPin } from 'lucide-vue-next'

const wb = useEpisodeWorkbenchInject()
</script>

<template>
      <div v-if="wb.activeMerge" class="overlay image-viewer-overlay" @click.self="wb.activeMerge = null">
        <div class="dialog image-viewer-dialog merge-viewer-dialog">
          <div class="image-viewer-head">
            <div class="image-viewer-title">成片预览</div>
            <span class="dim" style="font-size:11px">{{ wb.formatHistoryTime(wb.activeMerge.created_at) }}<template v-if="wb.activeMerge.duration"> · {{ wb.activeMerge.duration }}s</template></span>
            <a :href="'/' + wb.activeMerge.merged_url" download class="btn btn-sm" style="margin-left:auto">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              下载成片
            </a>
            <button class="btn btn-ghost btn-icon" @click="wb.activeMerge = null">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="merge-viewer-body">
            <video
              :key="wb.activeMerge.id"
              :src="'/' + wb.activeMerge.merged_url"
              controls
              autoplay
              playsinline
              class="merge-viewer-video"
            />
          </div>
        </div>
      </div>
</template>
