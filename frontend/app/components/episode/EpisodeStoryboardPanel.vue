<script setup>
import { ref } from 'vue'
import { Loader2, Plus, X, ListTodo, Upload, Play, MapPin } from 'lucide-vue-next'
import MentionTextarea from '~/components/MentionTextarea.vue'
const wb = useEpisodeWorkbenchInject()
const shotPromptSkill = ref(null)
</script>

<template>
          <div v-if="wb.prodTab === 'storyboard'" class="prod-content">
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">分镜拆分</span>
              <span class="tag mono">{{ wb.sbs.length }} 段落 · {{ wb.totalDuration }}s</span>
              <span class="tag">{{ wb.effectiveVideoConfigLabel }}</span>
              <span v-if="wb.lockedFirstLastConfigLabel" class="tag">{{ wb.lockedFirstLastConfigLabel }}</span>
              <div class="ml-auto flex gap-1" style="align-items:center;flex-wrap:wrap">
                <button class="btn btn-sm" :disabled="wb.rn || wb.creatingSb" @click="wb.storyboardImportOpen = true">
                  <Upload :size="11" />
                  导入
                </button>
                <div class="asp-action-group">
                  <AgentSkillPicker agent-type="storyboard_breaker" label="拆分" />
                  <button class="btn btn-sm" :disabled="wb.rn" @click="wb.doBreakdown">
                    <Loader2 v-if="wb.rt === 'storyboard_breaker'" :size="11" class="animate-spin" />
                    <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                    {{ wb.sbs.length ? '重新拆分' : '开始拆分' }}
                  </button>
                </div>
                <div class="asp-action-group">
                  <AgentSkillPicker agent-type="prompt_generator" label="提示词" />
                  <button class="btn btn-sm" :disabled="wb.videoPromptBatch.running || !wb.sbs.length" @click="wb.batchVideoPrompts">
                    <Loader2 v-if="wb.videoPromptBatch.running" :size="11" class="animate-spin" />
                    <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                    {{ wb.videoPromptBatch.running ? `提示词 ${wb.videoPromptBatch.completed}/${wb.videoPromptBatch.total}` : (wb.selectedSbIds.length ? `生成所选提示词(${wb.selectedSbIds.length})` : '批量视频提示词') }}
                  </button>
                </div>
              </div>
            </div>

            <div v-if="wb.sbs.length" class="storyboard-workbench">
              <aside class="storyboard-shot-list">
                <div class="shot-list-head">
                  <div class="shot-list-head-main">
                    <div class="shot-list-head-copy">
                      <div class="shot-list-title">分镜列表</div>
                      <div class="shot-list-sub">检查拆分描述和绑定的角色场景</div>
                    </div>
                    <span class="tag mono">{{ wb.totalDuration }}s</span>
                    <button v-if="!wb.sbSelectMode && wb.sbs.length" class="shot-quick-btn" @click="wb.sbSelectMode = true">选择</button>
                  </div>
                  <div v-if="wb.sbSelectMode" class="shot-quick-actions">
                    <button class="shot-quick-btn" @click="wb.toggleSelectAllSbs">全选</button>
                    <button class="shot-quick-btn" @click="wb.selectMissingSbs">仅缺失</button>
                    <button class="shot-quick-btn" @click="wb.selectedSbIds = []">清空</button>
                  </div>
                </div>
                <div class="shot-list-body">
                  <button
                    v-for="(sb, i) in wb.sbs"
                    :key="sb.id"
                    type="button"
                    class="storyboard-shot-card"
                    :class="{
                      active: !wb.sbSelectMode && wb.selectedSb?.id === sb.id,
                      'is-selected': wb.sbSelectMode && wb.isSbSelected(sb.id),
                      'is-generating': wb.isPendingVideo(sb.id),
                    }"
                    @click="wb.onShotCardClick(sb)"
                  >
                    <div class="storyboard-shot-head">
                      <span
                        v-if="wb.sbSelectMode"
                        class="shot-check"
                        :class="{ on: wb.isSbSelected(sb.id) }"
                      >
                        <svg v-if="wb.isSbSelected(sb.id)" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </span>
                      <div class="shot-num">#{{ String(i + 1).padStart(2, '0') }}</div>
                      <span class="storyboard-shot-chip">{{ sb.duration || 10 }}s</span>
                      <span v-if="wb.getSceneName(sb)" class="shot-location"><MapPin :size="9" />{{ wb.getSceneName(sb) }}</span>
                      <span v-if="wb.isPendingVideo(sb.id)" class="shot-chip-generating" :title="wb.hasVid(sb) ? '正在重新生成视频' : '正在生成视频'">
                        <Loader2 :size="8" class="animate-spin" />{{ wb.hasVid(sb) ? '重新生成中' : '生成中' }}
                      </span>
                      <span v-else-if="wb.hasVid(sb)" class="shot-chip-video" title="已生成视频"><Play :size="8" />已出片</span>
                    </div>
                    <div class="shot-body">
                      <div class="shot-desc" :class="{ 'is-empty': !sb.description }">{{ sb.description || '暂无画面描述' }}</div>
                      <div v-if="wb.firstFrameOf(sb) || wb.lastFrameOf(sb)" class="shot-frame-thumbs">
                        <img v-if="wb.firstFrameOf(sb)" :src="wb.thumbOf(wb.frameSrc(wb.firstFrameOf(sb)))" alt="首帧" loading="lazy" @error="wb.thumbFallback($event, wb.frameSrc(wb.firstFrameOf(sb)))" />
                        <img v-if="wb.lastFrameOf(sb)" :src="wb.thumbOf(wb.frameSrc(wb.lastFrameOf(sb)))" alt="尾帧" loading="lazy" @error="wb.thumbFallback($event, wb.frameSrc(wb.lastFrameOf(sb)))" />
                      </div>
                    </div>
                    <div class="shot-meta">
                      <div class="shot-avatars">
                        <template v-if="wb.getStoryboardCharacters(sb).length">
                          <span
                            v-for="c in wb.getStoryboardCharacters(sb).slice(0, 3)"
                            :key="c.id"
                            class="shot-avatar"
                            :title="c.name"
                          >
                            <img v-if="wb.assetImageSrc(c)" :src="wb.thumbOf(wb.assetImageSrc(c))" :alt="c.name" loading="lazy" @error="wb.thumbFallback($event, wb.assetImageSrc(c))" />
                            <template v-else>{{ (c.name || '?').slice(0, 1) }}</template>
                          </span>
                          <span v-if="wb.getStoryboardCharacters(sb).length > 3" class="shot-avatar shot-avatar-more">+{{ wb.getStoryboardCharacters(sb).length - 3 }}</span>
                        </template>
                        <span v-else class="shot-avatars-empty">0 角色</span>
                      </div>
                      <div class="shot-flags">
                        <span class="shot-flag flag-video" :class="{ on: wb.hasVid(sb) }" :title="wb.hasVid(sb) ? '已生成视频' : '未生成视频'"><i class="dot"></i>视</span>
                      </div>
                    </div>
                    <div v-if="!wb.sbSelectMode" class="shot-insert-actions" @click.stop>
                      <span
                        v-if="i === 0"
                        role="button"
                        tabindex="-1"
                        class="shot-insert-btn"
                        :class="{ disabled: wb.creatingSb }"
                        title="在此前插入"
                        @click="!wb.creatingSb && wb.addStoryboard({ beforeId: sb.id })"
                      >前插</span>
                      <span
                        role="button"
                        tabindex="-1"
                        class="shot-insert-btn"
                        :class="{ disabled: wb.creatingSb }"
                        title="在此后插入"
                        @click="!wb.creatingSb && wb.addStoryboard({ afterId: sb.id })"
                      >后插</span>
                    </div>
                    <span
                      v-if="!wb.sbSelectMode"
                      role="button"
                      tabindex="-1"
                      class="asset-del-btn shot-del-btn"
                      title="删除分镜"
                      @click.stop="wb.askDeleteStoryboard(sb, i)"
                    >
                      <X :size="11" />
                    </span>
                  </button>
                  <button
                    type="button"
                    class="shot-add-footer"
                    :disabled="wb.creatingSb || wb.rn"
                    @click="wb.addStoryboard()"
                  >
                    <Loader2 v-if="wb.creatingSb" :size="12" class="animate-spin" />
                    <Plus v-else :size="12" />
                    新建分镜
                  </button>
                </div>
                <div v-if="wb.sbSelectMode" class="shot-select-bar">
                  <div class="shot-select-info">
                    <span class="shot-select-count">已选 {{ wb.selectedSbIds.length }} 个</span>
                    <button class="btn btn-sm" @click="wb.exitSbSelectMode">取消</button>
                  </div>
                  <button class="btn btn-sm shot-select-go" :disabled="!wb.selectedSbIds.length || wb.videoPromptBatch.running" @click="wb.generateSelectedVideoPrompts">
                    <Loader2 v-if="wb.videoPromptBatch.running" :size="11" class="animate-spin" />
                    {{ wb.videoPromptBatch.running ? `生成中 ${wb.videoPromptBatch.completed}/${wb.videoPromptBatch.total}` : `生成提示词(${wb.selectedSbIds.length})` }}
                  </button>
                  <button class="btn btn-sm shot-select-go" :disabled="!wb.selectedSbIds.length" @click="wb.batchSelectedReferenceVideos">
                    参考出视频({{ wb.selectedSbIds.length }})
                  </button>
                  <button
                    class="btn btn-sm shot-select-go"
                    :disabled="!wb.selectedSbIds.length || !wb.hasFirstLastService"
                    :title="wb.hasFirstLastService ? '' : '请先在设置中添加首尾帧服务'"
                    @click="wb.batchFirstLastVideos()"
                  >
                    首尾帧出视频({{ wb.selectedSbIds.length }})
                  </button>
                </div>
              </aside>

              <section class="storyboard-editor-main" v-if="wb.selectedSb">
                <div class="sb-header-top">
                  <div class="sb-nav-group">
                    <button
                      type="button"
                      class="btn btn-icon btn-sm sb-nav-btn"
                      :disabled="wb.sbs.indexOf(wb.selectedSb) <= 0"
                      @click="wb.selectedSb = wb.sbs[wb.sbs.indexOf(wb.selectedSb) - 1]"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                    </button>
                    <div class="detail-head-copy">
                      <span class="detail-head-title">分镜 #{{ wb.sbs.indexOf(wb.selectedSb) + 1 }}</span>
                      <span class="dim sb-header-total">/ 共 {{ wb.sbs.length }} 个</span>
                    </div>
                    <button
                      type="button"
                      class="btn btn-icon btn-sm sb-nav-btn"
                      :disabled="wb.sbs.indexOf(wb.selectedSb) >= wb.sbs.length - 1"
                      @click="wb.selectedSb = wb.sbs[wb.sbs.indexOf(wb.selectedSb) + 1]"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  </div>
                </div>
                <div class="sb-header-fields">
                  <span class="sb-field-label">时长</span>
                  <span class="sb-duration-input">
                    <input :value="wb.selectedSb.duration || 10" class="input" type="number" min="1" max="60" @blur="wb.updateField(wb.selectedSb, 'duration', Number($event.target.value))" />
                    <span class="sb-duration-unit">s</span>
                  </span>
                  <span class="sb-prop-sep" />
                  <span class="sb-field-label" title="镜头起止画面，参考出片和首尾帧出片都可复用">镜头帧</span>
                  <span class="sb-prop-hint dim">{{ wb.framesReadyCount(wb.selectedSb) }}/2</span>
                  <div class="sb-prop-thumbs">
                    <div class="sb-prop-thumb" :class="{ filled: wb.firstFrameOf(wb.selectedSb) }">
                      <button
                        v-if="wb.firstFrameOf(wb.selectedSb)"
                        type="button"
                        class="sb-prop-thumb-preview"
                        @click="wb.openImageViewer(wb.frameSrc(wb.firstFrameOf(wb.selectedSb)), '首帧')"
                      >
                        <img :src="wb.thumbOf(wb.frameSrc(wb.firstFrameOf(wb.selectedSb)))" alt="首帧" @error="wb.thumbFallback($event, wb.frameSrc(wb.firstFrameOf(wb.selectedSb)))" />
                      </button>
                      <div v-else class="sb-prop-thumb-empty">首</div>
                      <div class="sb-prop-thumb-actions">
                        <button type="button" class="sb-prop-mini" :disabled="wb.isPendingFrame(wb.selectedSb.id, 'first_frame')" @click="wb.genStoryboardFrame(wb.selectedSb, 'first_frame')">
                          {{ wb.isPendingFrame(wb.selectedSb.id, 'first_frame') ? '…' : (wb.firstFrameOf(wb.selectedSb) ? '重绘' : '生成') }}
                        </button>
                        <button type="button" class="sb-prop-mini" :disabled="wb.isUploadingFrame(wb.selectedSb.id, 'first_frame')" @click="wb.uploadStoryboardFrame(wb.selectedSb, 'first_frame')">传</button>
                        <button v-if="wb.firstFrameOf(wb.selectedSb)" type="button" class="sb-prop-mini" @click="wb.clearStoryboardFrame(wb.selectedSb, 'first_frame')">×</button>
                      </div>
                    </div>
                    <div class="sb-prop-thumb" :class="{ filled: wb.lastFrameOf(wb.selectedSb) }">
                      <button
                        v-if="wb.lastFrameOf(wb.selectedSb)"
                        type="button"
                        class="sb-prop-thumb-preview"
                        @click="wb.openImageViewer(wb.frameSrc(wb.lastFrameOf(wb.selectedSb)), '尾帧')"
                      >
                        <img :src="wb.thumbOf(wb.frameSrc(wb.lastFrameOf(wb.selectedSb)))" alt="尾帧" @error="wb.thumbFallback($event, wb.frameSrc(wb.lastFrameOf(wb.selectedSb)))" />
                      </button>
                      <div v-else class="sb-prop-thumb-empty">尾</div>
                      <div class="sb-prop-thumb-actions">
                        <button type="button" class="sb-prop-mini" :disabled="wb.isPendingFrame(wb.selectedSb.id, 'last_frame')" @click="wb.genStoryboardFrame(wb.selectedSb, 'last_frame')">
                          {{ wb.isPendingFrame(wb.selectedSb.id, 'last_frame') ? '…' : (wb.lastFrameOf(wb.selectedSb) ? '重绘' : '生成') }}
                        </button>
                        <button type="button" class="sb-prop-mini" :disabled="wb.isUploadingFrame(wb.selectedSb.id, 'last_frame')" @click="wb.uploadStoryboardFrame(wb.selectedSb, 'last_frame')">传</button>
                        <button v-if="wb.lastFrameOf(wb.selectedSb)" type="button" class="sb-prop-mini" @click="wb.clearStoryboardFrame(wb.selectedSb, 'last_frame')">×</button>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="storyboard-editor-scroll">
                  <div class="sb-split">
                    <div class="detail-section">
                      <div class="detail-section-head">
                        <span class="detail-section-title">分镜描述</span>
                      </div>
                      <label class="field">
                        <span class="field-label">画面描述 <span class="dim">(按【镜头1】【镜头2】…逐子镜头描述；台词写「角色名说：「台词」」，旁白写「旁白：内容」)</span></span>
                        <textarea :value="wb.selectedSb.description || ''" class="textarea" rows="8" @blur="wb.updateField(wb.selectedSb, 'description', $event.target.value)" placeholder="分镜画面描述" />
                      </label>
                      <label class="field">
                        <span class="field-label">氛围</span>
                        <textarea :value="wb.selectedSb.atmosphere || ''" class="textarea" rows="3" @blur="wb.updateField(wb.selectedSb, 'atmosphere', $event.target.value)" placeholder="光线、色调、空气感、环境氛围" />
                      </label>
                    </div>

                    <div class="detail-section">
                      <div class="detail-section-head">
                        <span class="detail-section-title">视频提示词</span>
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
                      <div class="detail-section-copy">根据当前分镜的画面描述（含台词/旁白）与氛围生成</div>
                      <MentionTextarea
                        :model-value="wb.selectedSb.video_prompt || wb.selectedSb.videoPrompt || ''"
                        :options="wb.mentionOptions"
                        :rows="12"
                        input-class="textarea"
                        placeholder="用 @角色名 / @场景名 / @道具名 引用参考素材，按 3 秒一段换行描述画面运动与镜头；也可点 AI 生成由提示词 Agent 自动创作…"
                        @commit="v => wb.updateField(wb.selectedSb, 'video_prompt', v)"
                      />
                    </div>
                  </div>
                </div>
              </section>

              <aside class="storyboard-reference-panel" v-if="wb.selectedSb">
                <div class="storyboard-ref-head">
                  <div>
                    <div class="storyboard-ref-title">参考素材</div>
                    <div class="storyboard-ref-copy">绑定角色 / 场景 / 道具作为视频参考</div>
                  </div>
                  <span class="tag mono">{{ wb.refBindableAssets.filter(a => a.bound).length }}/{{ wb.refBindableAssets.length }} 已绑定</span>
                </div>
                <div class="storyboard-ref-list">
                  <template v-for="group in ['角色', '场景', '道具']" :key="group">
                    <div v-if="wb.refBindableAssets.filter(a => a.type === group).length" class="storyboard-ref-group">
                      <div class="storyboard-ref-group-label">{{ group }}</div>
                      <div
                        v-for="asset in wb.refBindableAssets.filter(a => a.type === group)"
                        :key="asset.key"
                        :class="['storyboard-ref-item', { bound: asset.bound }]"
                        :title="asset.bound ? '点击移出参考' : '点击添加为参考'"
                        @click="wb.toggleShotBind(wb.selectedSb, asset)"
                      >
                        <button
                          type="button"
                          class="storyboard-ref-thumb"
                          :disabled="!asset.ready"
                          @click.stop="asset.ready && wb.openImageViewer(wb.assetImageSrc({ imageUrl: asset.imageUrl }), `${asset.name} ${asset.type}`)"
                        >
                          <img v-if="asset.ready" :src="wb.thumbOf(wb.assetImageSrc({ imageUrl: asset.imageUrl }))" class="previewable-image" loading="lazy" @error="wb.thumbFallback($event, wb.assetImageSrc({ imageUrl: asset.imageUrl }))" />
                          <span v-else>{{ asset.type === '场景' ? '景' : asset.type === '道具' ? '具' : '角' }}</span>
                        </button>
                        <div class="storyboard-ref-main">
                          <div class="storyboard-ref-line">
                            <span class="storyboard-ref-name">{{ asset.name }}</span>
                            <span :class="['storyboard-ref-state', asset.bound && asset.ready ? 'is-ready' : '']">
                              {{ asset.bound ? (asset.ready ? '可参考' : '未生成') : '未绑定' }}
                            </span>
                          </div>
                          <div class="storyboard-ref-meta">{{ asset.type }} · {{ asset.meta }}</div>
                          <button v-if="asset.bound && !asset.ready" type="button" class="storyboard-ref-goto" @click.stop="wb.prodTab = 'assets'">去生成 →</button>
                        </div>
                      </div>
                    </div>
                  </template>
                  <div v-if="!wb.refBindableAssets.length" class="storyboard-ref-empty">
                    当前集还没有场景、角色或道具，先到「资产」提取素材后即可绑定。
                  </div>
                </div>
              </aside>
            </div>

            <div v-else-if="wb.rn && wb.rt === 'storyboard_breaker'" class="step-loading">
              <Loader2 :size="24" class="animate-spin" style="color:var(--accent)" />
              <div class="loading-text">正在拆分分镜...</div>
            </div>

            <div v-else class="step-empty video-task-empty-state">
              <div class="empty-visual">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><rect x="2" y="2" width="20" height="20" rx="2.5"/><line x1="7" y1="8" x2="7" y2="16"/><line x1="10" y1="8" x2="10" y2="16"/><line x1="13" y1="8" x2="13" y2="16"/></svg>
              </div>
              <div class="empty-title">开始拆分分镜</div>
              <div class="empty-desc">可用 AI 根据剧本拆分，手工逐条新建，或导入运镜/分镜文件。</div>
              <div class="step-empty-actions">
                <button class="btn btn-primary" :disabled="wb.rn || wb.creatingSb" @click="wb.doBreakdown">
                  <Loader2 v-if="wb.rt === 'storyboard_breaker'" :size="13" class="animate-spin" />
                  <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  开始拆分
                </button>
                <button class="btn" :disabled="wb.rn || wb.creatingSb" @click="wb.addStoryboard()">
                  <Loader2 v-if="wb.creatingSb" :size="13" class="animate-spin" />
                  <Plus v-else :size="13" />
                  手工新建
                </button>
                <button class="btn" :disabled="wb.rn || wb.creatingSb" @click="wb.storyboardImportOpen = true">
                  <Upload :size="13" />
                  导入文件
                </button>
              </div>
            </div>
          </div>
</template>
