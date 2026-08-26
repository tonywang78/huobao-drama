<script setup>
import { Loader2, Plus, X, ListTodo, Upload, Play, MapPin } from 'lucide-vue-next'

const wb = useEpisodeWorkbenchInject()
</script>

<template>
      <div v-if="wb.taskDrawer" class="task-drawer-overlay" @click.self="wb.closeTaskDrawer">
        <aside class="task-drawer" role="dialog" aria-modal="true" aria-label="生成任务列表">
          <header class="task-drawer-head">
            <div>
              <div class="video-task-title">生成任务列表</div>
              <div class="video-task-meta">按创建时间倒序 · {{ wb.genTaskRows.length }} 个任务</div>
            </div>
            <div class="task-drawer-head-actions">
              <button class="btn btn-sm" @click="wb.loadGenTasks">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                刷新
              </button>
              <button class="btn btn-ghost btn-icon" @click="wb.closeTaskDrawer"><X :size="14" /></button>
            </div>
          </header>
          <div class="video-task-metrics task-drawer-metrics">
            <span class="video-task-metric is-pending">{{ wb.genTaskActiveCount }} 生成中</span>
            <span class="video-task-metric is-done">{{ wb.genTaskDoneCount }} 完成</span>
            <span class="video-task-metric is-failed">{{ wb.genTaskFailedCount }} 失败</span>
          </div>
          <div v-if="!wb.genTaskRows.length" class="step-empty task-drawer-empty">
            <div class="empty-visual">
              <ListTodo :size="32" />
            </div>
            <div class="empty-title">暂无生成任务</div>
            <div class="empty-desc">在资产、分镜或视频步骤中触发图片 / 视频生成后,任务会自动出现在这里。</div>
          </div>
          <div v-else class="video-task-table task-drawer-body">
            <div
              v-for="row in wb.genTaskRows"
              :key="row.key"
              :class="['video-task-row', 'gen-task-row', 'is-' + wb.genTaskStateClass(row.status)]"
            >
              <div class="video-task-preview">
                <video
                  v-if="row.previewUrl && (row.kind === 'video' || row.kind === 'merge')"
                  :src="wb.genTaskPreviewSrc(row.previewUrl)"
                  :poster="wb.posterOf(wb.genTaskPreviewSrc(row.previewUrl)) || undefined"
                  controls
                  preload="none"
                  playsinline
                />
                <img
                  v-else-if="row.previewUrl"
                  :src="wb.thumbOf(wb.genTaskPreviewSrc(row.previewUrl))"
                  :alt="row.targetLabel"
                  loading="lazy"
                  @error="wb.thumbFallback($event, wb.genTaskPreviewSrc(row.previewUrl))"
                  @click="wb.openImageViewer(wb.genTaskPreviewSrc(row.previewUrl), row.targetLabel)"
                />
                <div v-else class="video-task-empty">
                  <Loader2 v-if="wb.genTaskStateClass(row.status) === 'pending'" :size="18" class="animate-spin" />
                  <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                </div>
                <span class="video-task-index">{{ wb.genTaskKindLabel(row.kind) }}</span>
              </div>
              <div class="video-task-main">
                <div class="video-task-line">
                  <strong class="video-task-name truncate">{{ row.targetLabel }}</strong>
                </div>
                <div class="video-task-meta-line">
                  <span class="video-task-loc truncate">{{ row.provider }}{{ row.model ? ' · ' + row.model : '' }}</span>
                  <template v-if="wb.genTaskDuration(row)">
                    <span class="video-task-sep">·</span>
                    <span>耗时 {{ wb.genTaskDuration(row) }}</span>
                  </template>
                  <span class="video-task-sep">·</span>
                  <span>#{{ row.id }}</span>
                </div>
                <div v-if="row.errorMsg" class="video-task-error">{{ row.errorMsg }}</div>
              </div>
              <span :class="['video-task-status', 'is-' + wb.genTaskStateClass(row.status)]">
                <span :class="['dot', wb.genTaskStateClass(row.status) === 'done' && 'ok', wb.genTaskStateClass(row.status) === 'pending' && 'pending']" />
                {{ wb.genTaskStatusLabel(row.status) }}
              </span>
            </div>
          </div>
        </aside>
      </div>
</template>
