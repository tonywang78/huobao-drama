<script setup>
import { ref } from 'vue'
import { Loader2, Plus, X, ListTodo, Upload, Play, MapPin } from 'lucide-vue-next'
import MentionTextarea from '~/components/MentionTextarea.vue'
const wb = useEpisodeWorkbenchInject()
const shotPromptSkill = ref(null)
</script>

<template>
          <div v-if="wb.prodTab === 'videos'" class="prod-content">
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ wb.sbs.length }} 个镜头</span>
              <span class="tag mono">{{ wb.shotVidCount }}/{{ wb.sbs.length }} 已生成</span>
              <div class="ml-auto flex gap-1">
                <button class="btn btn-sm" :disabled="wb.videoPromptBatch.running || !wb.sbs.length" @click="wb.batchVideoPrompts">
                  <Loader2 v-if="wb.videoPromptBatch.running" :size="11" class="animate-spin" />
                  <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  {{ wb.videoPromptBatch.running ? `提示词 ${wb.videoPromptBatch.completed}/${wb.videoPromptBatch.total}` : (wb.selectedSbIds.length ? `生成所选提示词(${wb.selectedSbIds.length})` : '批量视频提示词') }}
                </button>
                <button class="btn btn-sm" :disabled="!wb.sbs.length" @click="wb.batchVideos" title="用参考图服务为未出片镜头生成">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                  批量参考视频
                </button>
                <button
                  class="btn btn-sm"
                  :disabled="!wb.sbs.length || !wb.hasFirstLastService"
                  :title="wb.hasFirstLastService ? '用首尾帧服务为已配齐两帧的镜头生成' : '请先在设置中添加首尾帧服务'"
                  @click="wb.batchFirstLastVideos(wb.sbs)"
                >
                  批量首尾帧
                </button>
              </div>
            </div>
            <div v-if="!wb.sbs.length" class="step-empty video-task-empty-state">
              <div class="empty-visual">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
              </div>
              <div class="empty-title">先生成分镜</div>
              <div class="empty-desc">视频任务来自分镜拆分结果。先生成分镜描述和视频提示词，再批量生成视频。</div>
              <div class="locked-config-banner">将用：{{ wb.effectiveVideoConfigLabel }}</div>
              <button class="btn btn-primary" :disabled="wb.rn" @click="wb.prodTab = 'storyboard'; wb.doBreakdown()">
                <Loader2 v-if="wb.rt === 'storyboard_breaker'" :size="13" class="animate-spin" />
                <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                AI 生成分镜
              </button>
            </div>
            <div v-else class="video-task-workbench has-player">
              <section class="video-task-list">
                <div class="video-task-head">
                <div>
                  <div class="video-task-title">视频任务列表</div>
                  <div class="video-task-meta">按镜头顺序 · {{ wb.videoTaskRows.length }} 个任务</div>
                </div>
                <div class="video-task-metrics">
                  <span class="video-task-metric is-pending">{{ wb.pendingVideoIds.length }} 生成中</span>
                  <span class="video-task-metric is-done">{{ wb.videoTaskDoneCount }} 完成</span>
                  <span class="video-task-metric is-failed">{{ wb.videoTaskFailedCount }} 失败</span>
                  <button
                    v-if="wb.pendingVideoIds.length"
                    class="btn btn-sm"
                    :disabled="wb.cancellingAllVideos"
                    @click="wb.cancelAllVids"
                  >
                    {{ wb.cancellingAllVideos ? '取消中…' : '全部取消' }}
                  </button>
                </div>
                </div>
                <div class="video-task-table">
                <div
                  v-for="task in wb.videoTaskRows"
                  :key="task.id"
                  :class="['video-task-row', 'is-' + wb.videoTaskState(task.storyboard), { active: wb.selectedSb?.id === task.storyboard.id }]"
                  role="button"
                  tabindex="0"
                  @click="wb.selectedSb = task.storyboard"
                  @keydown.enter.prevent="wb.selectedSb = task.storyboard"
                  @keydown.space.prevent="wb.selectedSb = task.storyboard"
                >
                  <div class="video-task-preview">
                    <video
                      v-if="wb.hasVid(task.storyboard)"
                      :src="'/' + wb.getVideoUrl(task.storyboard)"
                      :poster="wb.posterOf('/' + wb.getVideoUrl(task.storyboard)) || undefined"
                      preload="none"
                      playsinline
                      muted
                      tabindex="-1"
                    />
                    <div v-else class="video-task-empty">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                    </div>
                    <span class="video-task-index">#{{ String(task.index + 1).padStart(2, '0') }}</span>
                  </div>
                  <div class="video-task-main">
                    <div class="video-task-line">
                      <strong class="video-task-name truncate">{{ task.title }}</strong>
                      <span v-if="wb.isPendingVideo(task.storyboard.id) && wb.hasVid(task.storyboard)" class="video-task-regen-badge">重新生成中</span>
                    </div>
                    <div class="video-task-meta-line">
                      <span v-if="task.meta" class="video-task-loc truncate">{{ task.meta }}</span>
                      <span class="video-task-sep">·</span>
                      <span>{{ task.duration }}s</span>
                      <span class="video-task-sep">·</span>
                      <span>参考 {{ task.referenceCount }}</span>
                    </div>
                    <div v-if="task.error" class="video-task-error">{{ task.error }}</div>
                  </div>
                  <span :class="['video-task-status', 'is-' + wb.videoTaskState(task.storyboard)]">
                    <span :class="['dot', wb.videoTaskState(task.storyboard) === 'done' && 'ok', wb.videoTaskState(task.storyboard) === 'pending' && 'pending']" />
                    {{ wb.videoTaskStatusLabel(task.storyboard) }}
                  </span>
                  <button
                    v-if="wb.videoTaskState(task.storyboard) === 'pending'"
                    class="btn btn-sm video-task-action"
                    :disabled="wb.cancellingVideoIds.includes(task.storyboard.id)"
                    @click.stop="wb.cancelVid(task.storyboard)"
                  >
                    {{ wb.cancellingVideoIds.includes(task.storyboard.id) ? '取消中…' : '取消' }}
                  </button>
                  <button
                    v-else
                    class="btn btn-sm video-task-action"
                    @click.stop="wb.genVid(task.storyboard)"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                    {{ wb.videoTaskActionLabel(task.storyboard) }}
                  </button>
                </div>
                </div>
              </section>

              <div v-if="wb.selectedSb" class="video-task-side">
              <aside class="video-task-player">
                <div class="video-player-head">
                  <div class="video-player-head-info">
                    <div class="video-player-title">分镜 {{ String(wb.selectedVideoTaskNumber).padStart(2, '0') }}</div>
                    <span :class="['video-task-status', 'is-' + wb.videoTaskState(wb.selectedSb)]">
                      <span :class="['dot', wb.videoTaskState(wb.selectedSb) === 'done' && 'ok', wb.videoTaskState(wb.selectedSb) === 'pending' && 'pending']" />
                      {{ wb.videoTaskStatusLabel(wb.selectedSb) }}
                    </span>
                    <span v-if="wb.selectedSb.duration" class="video-player-sub">{{ wb.selectedSb.duration }}s</span>
                  </div>
                  <button
                    v-if="wb.previewVideoUrl"
                    class="btn btn-sm btn-primary"
                    @click="wb.setAsMainVideo"
                  >
                    设为主视频
                  </button>
                  <a
                    v-if="wb.previewVideoUrl || wb.hasVid(wb.selectedSb)"
                    :href="'/' + (wb.previewVideoUrl || wb.getVideoUrl(wb.selectedSb))"
                    download
                    class="btn btn-sm"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    下载
                  </a>
                </div>
                <div class="video-player-stage">
                  <video
                    v-if="wb.previewVideoUrl || wb.hasVid(wb.selectedSb)"
                    :key="wb.previewVideoUrl || wb.getVideoUrl(wb.selectedSb)"
                    :src="'/' + (wb.previewVideoUrl || wb.getVideoUrl(wb.selectedSb))"
                    :poster="wb.posterOf('/' + (wb.previewVideoUrl || wb.getVideoUrl(wb.selectedSb))) || undefined"
                    controls
                    preload="metadata"
                    playsinline
                    class="video-player-video"
                  />
                  <div v-else class="video-player-empty">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                    <div class="video-player-empty-title">{{ wb.videoTaskState(wb.selectedSb) === 'pending' ? '视频生成中…' : '尚未生成视频' }}</div>
                    <div class="video-player-empty-desc">{{ wb.videoTaskState(wb.selectedSb) === 'pending' ? '生成完成后可在此播放预览' : '参考图与首尾帧是两种出片方法，后一次会覆盖当前成片' }}</div>
                    <div v-if="wb.videoTaskState(wb.selectedSb) !== 'pending'" class="video-player-empty-actions">
                      <button type="button" class="btn btn-primary btn-sm" @click="wb.genVid(wb.selectedSb)">参考生成</button>
                      <button
                        type="button"
                        class="btn btn-sm"
                        :disabled="!wb.hasFirstLastService"
                        :title="wb.hasFirstLastService ? '' : '请先在设置中添加首尾帧服务'"
                        @click="wb.genFirstLastVid(wb.selectedSb)"
                      >
                        首尾帧生成
                      </button>
                    </div>
                  </div>
                </div>
              </aside>

              <div v-if="wb.sbVideoHistory.length" class="video-player-history">
                <div class="video-player-history-head">
                  <span>历史视频</span>
                  <span class="video-player-history-count">{{ wb.sbVideoHistory.length }}</span>
                </div>
                <div class="video-player-history-list">
                  <div
                    v-for="t in wb.sbVideoHistory"
                    :key="t.id"
                    :class="['video-history-item', { current: wb.isCurrentVideo(t), viewing: !!wb.previewVideoUrl && wb.previewVideoUrl === wb.taskVideoPath(t) }]"
                    role="button"
                    tabindex="0"
                    @click="wb.previewHistoryVideo(t)"
                    @keydown.enter.prevent="wb.previewHistoryVideo(t)"
                  >
                    <video :src="'/' + wb.taskVideoPath(t)" :poster="wb.posterOf('/' + wb.taskVideoPath(t)) || undefined" preload="none" muted playsinline tabindex="-1" />
                    <span class="video-history-time">{{ wb.formatHistoryTime(taskCreatedAt(t)) }}</span>
                    <span v-if="wb.isCurrentVideo(t)" class="video-history-badge">当前</span>
                    <button v-else type="button" class="video-history-del" title="删除该记录" @click.stop="wb.removeHistoryVideo(t)">×</button>
                  </div>
                </div>
              </div>

              <aside class="video-task-inspector">
                <div class="video-inspector-body">
                  <section class="video-inspector-section">
                    <div class="video-inspector-prompt-head">
                      <span class="video-inspector-label video-inspector-label-hero">参考图提示词</span>
                      <div class="asset-detail-prompt-head-actions">
                        <AgentSkillPicker ref="shotPromptSkill" agent-type="prompt_generator" label="提示词" scope="shot-detail" />
                        <button
                          type="button"
                          class="btn btn-sm"
                          :disabled="wb.videoPromptGeneratingIds.includes(wb.selectedSb?.id) || wb.videoPromptBatch.running"
                          @click="wb.genVideoPrompt(wb.selectedSb, shotPromptSkill?.getPayload())"
                        >
                          <Loader2 v-if="wb.videoPromptGeneratingIds.includes(wb.selectedSb?.id)" :size="11" class="animate-spin" />
                          {{ (wb.selectedSb.video_prompt || wb.selectedSb.videoPrompt) ? '重新生成' : 'AI 生成' }}
                        </button>
                      </div>
                    </div>
                    <MentionTextarea
                      :model-value="wb.selectedSb.video_prompt || wb.selectedSb.videoPrompt || ''"
                      :options="wb.mentionOptions"
                      :rows="6"
                      input-class="textarea video-inspector-prompt"
                      placeholder="用 @角色名 / @场景名 / @道具名 引用参考素材；按 3 秒一段换行描述画面运动与镜头…"
                      @commit="v => wb.updateField(wb.selectedSb, 'video_prompt', v)"
                    />
                    <p class="video-inspector-hint">用于「参考图」出片；首尾帧出片使用下方独立提示词。</p>
                  </section>

                  <section class="video-inspector-section">
                    <span class="video-inspector-label">共用参数</span>
                    <div class="video-param-row">
                      <span class="video-param-name">生成时长</span>
                      <span class="video-param-control">
                        <input v-model.number="wb.videoDuration" type="number" min="4" max="15" class="input video-duration-input" />
                        <span class="video-param-unit">s（4-15）</span>
                      </span>
                    </div>
                    <p class="video-inspector-hint">参考图与首尾帧是两种出片方法，后一次会覆盖当前成片。</p>
                  </section>

                  <button
                    v-if="wb.videoTaskState(wb.selectedSb) === 'pending'"
                    class="btn video-inspector-action"
                    :disabled="wb.cancellingVideoIds.includes(wb.selectedSb.id)"
                    @click="wb.cancelVid(wb.selectedSb)"
                  >
                    {{ wb.cancellingVideoIds.includes(wb.selectedSb.id) ? '取消中…' : '取消生成' }}
                  </button>

                  <section class="video-gen-method">
                    <div class="video-gen-method-head">
                      <span class="video-gen-method-kicker">方法</span>
                      <span class="video-gen-method-title">参考图</span>
                      <span class="video-gen-method-engine">{{ wb.effectiveVideoConfigLabel }}</span>
                    </div>
                    <div class="video-inspector-assets">
                      <button
                        v-for="asset in wb.getShotReferenceAssets(wb.selectedSb)"
                        :key="asset.key"
                        type="button"
                        class="video-inspector-asset"
                        :disabled="!asset.ready"
                        @click="asset.ready && wb.openImageViewer(wb.assetImageSrc({ imageUrl: asset.imageUrl }), `${asset.name} ${asset.type}`)"
                      >
                        <img v-if="asset.ready" :src="wb.thumbOf(wb.assetImageSrc({ imageUrl: asset.imageUrl }))" :alt="asset.name" loading="lazy" @error="wb.thumbFallback($event, wb.assetImageSrc({ imageUrl: asset.imageUrl }))" />
                        <span v-else>{{ asset.type }}</span>
                        <small>{{ asset.name }}</small>
                      </button>
                      <div v-if="!wb.getShotReferenceAssets(wb.selectedSb).length" class="video-inspector-empty">当前分镜未绑定参考素材</div>
                    </div>
                    <div v-if="wb.videoRefImageUrls.length || wb.videoRefVideoUrls.length || wb.videoRefAudioUrls.length" class="video-ref-media-list">
                      <span v-for="(url, i) in wb.videoRefImageUrls" :key="'ref-i-' + i" class="video-ref-media-chip">
                        图片 {{ i + 1 }}
                        <button type="button" class="video-ref-media-remove" @click="wb.removeRefMedia('image', i)">×</button>
                      </span>
                      <span v-for="(url, i) in wb.videoRefVideoUrls" :key="'ref-v-' + i" class="video-ref-media-chip">
                        视频 {{ i + 1 }}
                        <button type="button" class="video-ref-media-remove" @click="wb.removeRefMedia('video', i)">×</button>
                      </span>
                      <span v-for="(url, i) in wb.videoRefAudioUrls" :key="'ref-a-' + i" class="video-ref-media-chip">
                        音频 {{ i + 1 }}
                        <button type="button" class="video-ref-media-remove" @click="wb.removeRefMedia('audio', i)">×</button>
                      </span>
                    </div>
                    <div class="video-ref-media-actions">
                      <button type="button" class="btn btn-sm" :disabled="wb.uploadingRefMedia || wb.refImageFull" @click="wb.uploadRefMedia('image')">
                        上传参考图片 ({{ wb.refImageUsedCount }}/9)
                      </button>
                      <button type="button" class="btn btn-sm" :disabled="wb.uploadingRefMedia || wb.videoRefVideoUrls.length >= 3" @click="wb.uploadRefMedia('video')">
                        上传参考视频 ({{ wb.videoRefVideoUrls.length }}/3)
                      </button>
                      <button type="button" class="btn btn-sm" :disabled="wb.uploadingRefMedia || wb.videoRefAudioUrls.length >= 3" @click="wb.uploadRefMedia('audio')">
                        上传参考音频 ({{ wb.videoRefAudioUrls.length }}/3)
                      </button>
                    </div>
                    <div
                      v-if="wb.videoRefAudioUrls.length && !wb.getShotReferenceImages(wb.selectedSb).length && !wb.videoRefVideoUrls.length"
                      class="video-ref-media-hint"
                    >参考音频需至少 1 个参考图片或视频</div>
                    <button
                      type="button"
                      class="btn btn-primary video-gen-method-action"
                      :disabled="wb.videoTaskState(wb.selectedSb) === 'pending'"
                      @click="wb.genVid(wb.selectedSb)"
                    >
                      {{ wb.videoTaskActionLabel(wb.selectedSb) }}
                    </button>
                  </section>

                  <section class="video-gen-method">
                    <div class="video-gen-method-head">
                      <span class="video-gen-method-kicker">方法</span>
                      <span class="video-gen-method-title">首尾帧</span>
                      <span class="video-gen-method-engine">{{ wb.lockedFirstLastConfigLabel || '未配置' }}</span>
                    </div>
                    <div class="sb-frame-slots">
                      <div class="sb-frame-slot">
                        <div class="sb-frame-slot-head">
                          <span class="sb-field-label">首帧</span>
                          <div class="sb-frame-slot-actions">
                            <button type="button" class="btn btn-sm" :disabled="wb.isPendingFrame(wb.selectedSb.id, 'first_frame')" @click="wb.genStoryboardFrame(wb.selectedSb, 'first_frame')">
                              <Loader2 v-if="wb.isPendingFrame(wb.selectedSb.id, 'first_frame')" :size="11" class="animate-spin" />
                              {{ wb.firstFrameOf(wb.selectedSb) ? '重绘' : '生成' }}
                            </button>
                            <button type="button" class="btn btn-sm" :disabled="wb.isUploadingFrame(wb.selectedSb.id, 'first_frame')" @click="wb.uploadStoryboardFrame(wb.selectedSb, 'first_frame')">上传</button>
                            <button v-if="wb.firstFrameOf(wb.selectedSb)" type="button" class="btn btn-sm" @click="wb.clearStoryboardFrame(wb.selectedSb, 'first_frame')">删除</button>
                          </div>
                        </div>
                        <button
                          v-if="wb.firstFrameOf(wb.selectedSb)"
                          type="button"
                          class="sb-frame-preview"
                          @click="wb.openImageViewer(wb.frameSrc(wb.firstFrameOf(wb.selectedSb)), '首帧')"
                        >
                          <img :src="wb.thumbOf(wb.frameSrc(wb.firstFrameOf(wb.selectedSb)))" alt="首帧" @error="wb.thumbFallback($event, wb.frameSrc(wb.firstFrameOf(wb.selectedSb)))" />
                        </button>
                        <div v-else class="sb-frame-empty">未配首帧</div>
                        <label class="video-frame-prompt-field">
                          <span class="video-frame-prompt-label">首帧提示词</span>
                          <MentionTextarea
                            :model-value="wb.selectedSb.first_frame_prompt || wb.selectedSb.firstFramePrompt || ''"
                            :options="wb.mentionOptions"
                            :rows="2"
                            input-class="textarea video-frame-prompt-input"
                            placeholder="留空则用分镜首镜头描述或图片提示词；可用 @角色名 等引用素材"
                            @commit="v => wb.updateField(wb.selectedSb, 'first_frame_prompt', v)"
                          />
                        </label>
                      </div>
                      <div class="sb-frame-slot">
                        <div class="sb-frame-slot-head">
                          <span class="sb-field-label">尾帧</span>
                          <div class="sb-frame-slot-actions">
                            <button type="button" class="btn btn-sm" :disabled="wb.isPendingFrame(wb.selectedSb.id, 'last_frame')" @click="wb.genStoryboardFrame(wb.selectedSb, 'last_frame')">
                              <Loader2 v-if="wb.isPendingFrame(wb.selectedSb.id, 'last_frame')" :size="11" class="animate-spin" />
                              {{ wb.lastFrameOf(wb.selectedSb) ? '重绘' : '生成' }}
                            </button>
                            <button type="button" class="btn btn-sm" :disabled="wb.isUploadingFrame(wb.selectedSb.id, 'last_frame')" @click="wb.uploadStoryboardFrame(wb.selectedSb, 'last_frame')">上传</button>
                            <button v-if="wb.lastFrameOf(wb.selectedSb)" type="button" class="btn btn-sm" @click="wb.clearStoryboardFrame(wb.selectedSb, 'last_frame')">删除</button>
                          </div>
                        </div>
                        <button
                          v-if="wb.lastFrameOf(wb.selectedSb)"
                          type="button"
                          class="sb-frame-preview"
                          @click="wb.openImageViewer(wb.frameSrc(wb.lastFrameOf(wb.selectedSb)), '尾帧')"
                        >
                          <img :src="wb.thumbOf(wb.frameSrc(wb.lastFrameOf(wb.selectedSb)))" alt="尾帧" @error="wb.thumbFallback($event, wb.frameSrc(wb.lastFrameOf(wb.selectedSb)))" />
                        </button>
                        <div v-else class="sb-frame-empty">未配尾帧</div>
                        <label class="video-frame-prompt-field">
                          <span class="video-frame-prompt-label">尾帧提示词</span>
                          <MentionTextarea
                            :model-value="wb.selectedSb.last_frame_prompt || wb.selectedSb.lastFramePrompt || ''"
                            :options="wb.mentionOptions"
                            :rows="2"
                            input-class="textarea video-frame-prompt-input"
                            placeholder="留空则用分镜末镜头描述或图片提示词；可用 @角色名 等引用素材"
                            @commit="v => wb.updateField(wb.selectedSb, 'last_frame_prompt', v)"
                          />
                        </label>
                      </div>
                    </div>
                    <div class="video-first-last-prompt">
                      <span class="video-inspector-label">首尾帧视频提示词</span>
                      <MentionTextarea
                        :model-value="wb.selectedSb.first_last_prompt || wb.selectedSb.firstLastPrompt || ''"
                        :options="wb.firstLastMentionOptions"
                        :rows="5"
                        input-class="textarea video-inspector-prompt"
                        placeholder="描述从 @首帧 到 @尾帧 的运动与过渡；用 @角色名 / @场景名 / @道具名 引用额外参考图…"
                        @commit="v => wb.updateField(wb.selectedSb, 'first_last_prompt', v)"
                      />
                    </div>
                    <div class="video-first-last-ref-hint">
                      <p class="video-inspector-hint video-inspector-hint-tight"><strong>引用方式</strong></p>
                      <ul class="video-ref-hint-list">
                        <li><code>@首帧</code> / <code>@尾帧</code> — 指向上方已配好的起止画面（生成时自动注入，无需 URL）</li>
                        <li><code>@角色名</code> / <code>@场景名</code> / <code>@道具名</code> — 引用已绑定参考素材；提交时转为 <code>@图片N名字</code>（N 从 1 起，顺序：场景 → 角色 → 道具）</li>
                        <li>首尾帧视频提示词留空时，回退为上方「参考图提示词」</li>
                      </ul>
                    </div>
                    <button
                      type="button"
                      class="btn video-gen-method-action"
                      :disabled="!wb.hasFirstLastService || wb.isPendingVideo(wb.selectedSb.id)"
                      :title="wb.hasFirstLastService ? '' : '请先在设置中添加首尾帧服务'"
                      @click="wb.genFirstLastVid(wb.selectedSb)"
                    >
                      首尾帧出视频
                    </button>
                  </section>
                </div>
              </aside>
              </div>
            </div>
          </div>
</template>
