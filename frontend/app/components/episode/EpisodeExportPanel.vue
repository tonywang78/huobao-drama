<script setup>
import { Loader2, Plus, X, ListTodo, Upload, Play, MapPin } from 'lucide-vue-next'

const wb = useEpisodeWorkbenchInject()
</script>

<template>
<div class="content-panel">
        <div v-if="!wb.sbs.length" class="step-empty" style="flex:1">
          <div class="empty-visual">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </div>
          <div class="empty-title">尚未准备就绪</div>
          <div class="empty-desc">请先完成分镜和制作流程</div>
          <button class="btn btn-primary" @click="wb.panel = 'script'">前往剧本</button>
        </div>
        <div v-else class="export-split">
          <div class="export-main">
            <!-- 上方:成片列表 -->
            <div class="export-section">
              <div class="export-section-head">
                <span class="export-section-title">成片列表</span>
                <span class="dim" style="font-size:11px">{{ wb.exportMerges.length }} 个</span>
                <button class="btn btn-sm ml-auto" @click="wb.loadExportMerges">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                  刷新
                </button>
              </div>
              <div v-if="wb.exportMerges.length" class="export-merge-strip">
                <div
                  v-for="m in wb.exportMerges"
                  :key="m.id"
                  :class="['merge-card', m.status === 'completed' && m.merged_url && 'playable']"
                  :role="m.status === 'completed' && m.merged_url ? 'button' : undefined"
                  :tabindex="m.status === 'completed' && m.merged_url ? 0 : undefined"
                  @click="m.status === 'completed' && m.merged_url && (wb.activeMerge = m)"
                  @keydown.enter.prevent="m.status === 'completed' && m.merged_url && (wb.activeMerge = m)"
                >
                  <div class="merge-card-thumb">
                    <video
                      v-if="m.status === 'completed' && m.merged_url"
                      :src="'/' + m.merged_url"
                      :poster="wb.posterOf('/' + m.merged_url) || undefined"
                      preload="none"
                      muted
                      playsinline
                      tabindex="-1"
                    />
                    <div v-else :class="['merge-card-pending', m.status === 'failed' && 'is-failed']">
                      {{ m.status === 'failed' ? (m.error_msg || '拼接失败') : '拼接中…' }}
                    </div>
                    <span v-if="m.status === 'completed' && m.merged_url" class="merge-card-play">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                    </span>
                  </div>
                  <div class="merge-card-meta">
                    <span class="mono">{{ wb.formatHistoryTime(m.created_at) }}</span>
                    <span v-if="m.duration">· {{ m.duration }}s</span>
                    <a
                      v-if="m.status === 'completed' && m.merged_url"
                      :href="'/' + m.merged_url"
                      download
                      class="btn btn-sm"
                      @click.stop
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      下载
                    </a>
                  </div>
                </div>
              </div>
              <div v-else class="export-merge-empty">暂无成片，在下方勾选镜头后点击「拼接所选」</div>
            </div>

            <!-- 下方:镜头素材(可勾选) -->
            <div class="export-section export-section-grow">
              <div class="export-section-head">
                <span class="export-section-title">镜头素材</span>
                <span class="dim" style="font-size:11px">{{ wb.shotVidCount }}/{{ wb.sbs.length }} 已生成 · 已选 {{ wb.exportSelectedReadyIds.length }}</span>
                <div class="ml-auto flex gap-1">
                  <button class="btn btn-sm" :disabled="!wb.exportReadyIds.length" @click="wb.toggleSelectAllExport">
                    {{ wb.exportSelectedReadyIds.length === wb.exportReadyIds.length && wb.exportReadyIds.length ? '清空选择' : '全选已生成' }}
                  </button>
                  <button
                    class="btn btn-sm btn-primary"
                    :disabled="!wb.exportSelectedReadyIds.length"
                    @click="wb.doMerge(wb.exportSelectedReadyIds)"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                    拼接所选 ({{ wb.exportSelectedReadyIds.length }})
                  </button>
                </div>
              </div>
              <div class="export-grid">
                <div
                  v-for="(sb, i) in wb.sbs"
                  :key="sb.id"
                  :class="['exp-card', { selected: wb.isExportSelected(sb.id), playable: wb.hasVid(sb) }]"
                  :role="wb.hasVid(sb) ? 'button' : undefined"
                  :tabindex="wb.hasVid(sb) ? 0 : undefined"
                  @click="wb.toggleExportSelect(sb)"
                  @keydown.enter.prevent="wb.toggleExportSelect(sb)"
                >
                  <div class="exp-thumb">
                    <video
                      v-if="wb.hasVid(sb)"
                      :src="'/' + wb.getVideoUrl(sb)"
                      :poster="wb.posterOf('/' + wb.getVideoUrl(sb)) || undefined"
                      preload="none"
                      muted
                      playsinline
                      tabindex="-1"
                    />
                    <div v-else class="exp-thumb-empty">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                    </div>
                    <span class="exp-thumb-index">#{{ String(i+1).padStart(2,'0') }}</span>
                    <span v-if="sb.duration" class="exp-thumb-duration">{{ sb.duration }}s</span>
                    <span v-if="wb.hasVid(sb)" :class="['exp-check', wb.isExportSelected(sb.id) && 'on']">
                      <svg v-if="wb.isExportSelected(sb.id)" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </span>
                  </div>
                  <div class="exp-row-line">
                    <span class="truncate" style="flex:1;font-size:11px">{{ sb.description || sb.title || '—' }}</span>
                    <span :class="['dot', wb.hasVid(sb) && 'ok']" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
</div>
</template>
