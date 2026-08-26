<script setup>
import { Loader2, Plus, X, ListTodo, Upload, Play, MapPin } from 'lucide-vue-next'
import AssetImageHistoryList from '~/components/AssetImageHistoryList.vue'
const wb = useEpisodeWorkbenchInject()
</script>

<template>
      <div v-if="wb.assetDetail.open && wb.assetDetail.item" class="overlay asset-detail-overlay" @click.self="wb.closeAssetDetail">
        <section
          class="dialog asset-detail-dialog"
          role="dialog"
          aria-modal="true"
          :aria-label="(wb.assetDetail.type === 'character' ? '角色' : wb.assetDetail.type === 'scene' ? '场景' : '道具') + '详情'"
        >
          <header class="dialog-head asset-detail-head">
            <div class="asset-detail-title-block">
              <span class="asset-detail-kicker">{{ wb.assetTypeLabel(wb.assetDetail.type) }}</span>
              <h2 class="asset-detail-title">{{ wb.assetDetailTitle(wb.assetDetail) }}</h2>
            </div>
            <div class="asset-detail-head-actions">
              <span class="tag" v-if="wb.assetDetail.type === 'character'">{{ wb.assetDetail.item.role || '角色' }}</span>
              <span class="tag" v-else-if="wb.assetDetail.type === 'prop'">{{ wb.assetDetail.item.type || '道具' }}</span>
              <span class="tag" v-else>{{ wb.assetDetail.item.time || '未设时间' }}</span>
              <button class="btn btn-ghost btn-icon" @click="wb.closeAssetDetail">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </header>

          <div class="dialog-body asset-detail-body">
            <div class="asset-detail-shell">
              <aside class="asset-detail-preview-panel">
                <div class="asset-detail-section-title">
                  <span>视觉预览</span>
                  <span :class="['asset-detail-state', wb.assetDetailDisplayUrl ? 'is-ready' : '']">
                    {{ wb.assetDetailDisplayUrl ? (wb.assetPreviewImageUrl ? '预览中' : '已生成') : '待生成' }}
                  </span>
                </div>

                <button
                  type="button"
                  class="asset-detail-media-frame"
                  :disabled="!wb.assetDetailDisplayUrl"
                  @click.stop="wb.openImageViewer(wb.assetDetailDisplayUrl, `${wb.assetDetailTitle(wb.assetDetail)} ${wb.assetDetail.type === 'character' ? '角色形象' : wb.assetDetail.type === 'scene' ? '场景图' : '道具图'}`)"
                >
                  <img
                    v-if="wb.assetDetailDisplayUrl"
                    :src="wb.thumbOf(wb.assetDetailDisplayUrl)"
                    class="previewable-image"
                    @error="wb.thumbFallback($event, wb.assetDetailDisplayUrl)"
                  />
                  <span v-else class="asset-detail-media-empty">
                    <svg v-if="wb.assetDetail.type === 'character'" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    <svg v-else-if="wb.assetDetail.type === 'prop'" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                    <svg v-else width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  </span>
                </button>

                <div class="asset-detail-meta-row">
                  <div class="asset-detail-meta-item">
                    <span>类型</span>
                    <strong>{{ wb.assetDetail.type === 'character' ? '角色形象' : wb.assetDetail.type === 'prop' ? '道具' : '场景图片' }}</strong>
                  </div>
                  <div class="asset-detail-meta-item">
                    <span>{{ wb.assetDetail.type === 'character' ? '定位' : wb.assetDetail.type === 'prop' ? '道具类型' : '时间' }}</span>
                    <strong>{{ wb.assetDetail.type === 'character' ? (wb.assetDetail.item.role || '角色') : wb.assetDetail.type === 'prop' ? (wb.assetDetail.item.type || '道具') : (wb.assetDetail.item.time || '未设时间') }}</strong>
                  </div>
                </div>

                <AssetImageHistoryList
                  :history="wb.assetImageHistory"
                  :preview-image-url="wb.assetPreviewImageUrl"
                  :is-current-image="wb.isCurrentAssetImage"
                  @preview="wb.previewAssetHistoryImage"
                  @remove="wb.removeAssetHistoryImage"
                  @set-main="wb.setAssetAsMainImage"
                />
              </aside>

              <section class="asset-detail-editor-panel">
                <div class="asset-detail-section-title">
                  <span>编辑信息</span>
                  <span class="dim">{{ wb.assetDetail.type === 'character' ? '样貌与妆造会影响角色形象' : wb.assetDetail.type === 'prop' ? '物品外貌会影响道具图' : '空间与光影会影响场景图' }}</span>
                </div>

                <div v-if="wb.assetDetail.type === 'prop'" class="asset-detail-edit-grid asset-detail-edit-grid--prop">
                  <label class="asset-detail-edit-field">
                    <span>物品外貌</span>
                    <textarea
                      v-model="wb.assetDetailDraft.description"
                      class="textarea asset-detail-textarea"
                      rows="6"
                      placeholder="材质、颜色、形状、大小、新旧程度、磨损痕迹等"
                    />
                  </label>
                </div>

                <div v-else :class="['asset-detail-edit-grid', `asset-detail-edit-grid--${wb.assetDetail.type}`]">
                  <label v-if="wb.assetDetail.type === 'character'" class="asset-detail-edit-field">
                    <span>样貌</span>
                    <textarea
                      v-model="wb.assetDetailDraft.appearance"
                      class="textarea asset-detail-textarea"
                      rows="6"
                      placeholder="年龄感、五官、体态、气质等"
                    />
                  </label>
                  <label v-if="wb.assetDetail.type === 'character'" class="asset-detail-edit-field">
                    <span>妆造</span>
                    <textarea
                      v-model="wb.assetDetailDraft.styling"
                      class="textarea asset-detail-textarea"
                      rows="6"
                      placeholder="发型、服装、妆面、配饰等"
                    />
                  </label>
                  <label v-if="wb.assetDetail.type === 'scene'" class="asset-detail-edit-field">
                    <span>场景描述</span>
                    <textarea
                      v-model="wb.assetDetailDraft.prompt"
                      class="textarea asset-detail-textarea"
                      rows="5"
                      placeholder="空间、陈设、年代质感、关键视觉元素等"
                    />
                  </label>
                  <label v-if="wb.assetDetail.type === 'scene'" class="asset-detail-edit-field">
                    <span>场景光影</span>
                    <textarea
                      v-model="wb.assetDetailDraft.lighting"
                      class="textarea asset-detail-textarea"
                      rows="5"
                      placeholder="光源、色调、明暗、氛围等"
                    />
                  </label>
                </div>

              </section>
            </div>

            <section class="asset-detail-prompt-panel">
              <div class="asset-detail-section-title">
                <span>{{ wb.assetDetail.type === 'character' ? '最终提示词 · 三视图' : wb.assetDetail.type === 'scene' ? '最终提示词 · 固定视角' : '最终提示词 · 白底单品' }}</span>
                <div class="asset-detail-prompt-head-actions">
                  <button
                    class="btn btn-sm"
                    :disabled="wb.isGeneratingPrompt(wb.assetDetail.type, wb.assetDetail.item.id) || wb.isAssetImagePending(wb.assetDetail.type, wb.assetDetail.item.id)"
                    @click="wb.genAssetFinalPrompt"
                  >
                    <Loader2 v-if="wb.isGeneratingPrompt(wb.assetDetail.type, wb.assetDetail.item.id)" :size="11" class="animate-spin" />
                    {{ wb.isGeneratingPrompt(wb.assetDetail.type, wb.assetDetail.item.id) ? '生成中' : (wb.assetFinalPrompt ? '重新生成' : '生成提示词') }}
                  </button>
                  <span :class="['asset-detail-state', wb.assetFinalPrompt && 'is-ready']">
                    {{ wb.assetFinalPrompt ? '已生成' : '待生成' }}
                  </span>
                  <button
                    v-if="wb.assetPromptDraft"
                    class="btn btn-ghost btn-sm asset-detail-copy-btn"
                    @click="wb.copyAssetFinalPrompt"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    复制
                  </button>
                </div>
              </div>
              <textarea
                :value="wb.assetPromptDraft"
                @input="wb.onAssetPromptInput"
                class="textarea asset-detail-prompt-textarea"
                rows="5"
                :placeholder="wb.assetDetail.type === 'character'
                  ? '可手动编写三视图最终提示词，或点击「生成提示词」由 Agent 生成'
                  : wb.assetDetail.type === 'scene'
                    ? '可手动编写固定视角最终提示词，或点击「生成提示词」由 Agent 生成'
                    : '可手动编写白底单品最终提示词，或点击「生成提示词」由 Agent 生成'"
              />
              <p class="asset-detail-prompt-hint">
                {{ wb.assetDetail.type === 'character'
                  ? '提示词可直接编辑，保存后生效；修改样貌或妆造并保存后，最终提示词将被清空，下次生成形象时由提示词 Agent 重新生成。'
                  : wb.assetDetail.type === 'scene'
                    ? '提示词可直接编辑，保存后生效；修改场景描述或光影并保存后，最终提示词将被清空，下次生成场景图时由提示词 Agent 重新生成。'
                    : '提示词可直接编辑，保存后生效；修改物品外貌并保存后，最终提示词将被清空，下次生成道具图时由提示词 Agent 重新生成。' }}
              </p>
            </section>

            <section v-if="wb.assetDetail.type === 'scene'" class="asset-detail-prompt-panel asset-detail-edit-panel">
              <div class="asset-detail-section-title">
                <span>改图 · 图生图</span>
                <span v-if="wb.lockedImg2imgConfigLabel" class="tag tag-accent">{{ wb.lockedImg2imgConfigLabel }}</span>
              </div>
              <textarea
                v-model="wb.sceneEditPrompt"
                class="textarea asset-detail-prompt-textarea"
                rows="3"
                placeholder="基于当前场景图修改，如：把天空改成傍晚，增加暖色灯光…"
                :disabled="!wb.assetImageSrc(wb.assetDetail.item) || wb.isPendingSceneImage(wb.assetDetail.item.id)"
              />
              <p class="asset-detail-prompt-hint">
                {{ wb.assetImageSrc(wb.assetDetail.item)
                  ? '改图会保留当前构图，仅按提示词调整细节；完整重生成请用「重绘场景」。'
                  : '请先生成或上传场景图后再改图。' }}
              </p>
              <button
                class="btn btn-sm"
                :disabled="!wb.assetImageSrc(wb.assetDetail.item) || !wb.sceneEditPrompt.trim() || wb.isPendingSceneImage(wb.assetDetail.item.id)"
                @click="wb.editSceneImg(wb.assetDetail.item.id, wb.sceneEditPrompt)"
              >
                <Loader2 v-if="wb.isPendingSceneImage(wb.assetDetail.item.id)" :size="11" class="animate-spin" />
                {{ wb.isPendingSceneImage(wb.assetDetail.item.id) ? '改图中' : '改图' }}
              </button>
            </section>
          </div>

          <footer class="dialog-foot asset-detail-foot">
            <div class="asset-detail-secondary-actions">
              <button class="btn btn-danger" @click="wb.askDeleteAsset(wb.assetDetail.type, wb.assetDetail.item)">从本集移除</button>
              <button class="btn" @click="wb.closeAssetDetail">关闭</button>
            </div>
            <div class="asset-detail-primary-actions">
              <button
                class="btn"
                :disabled="wb.isUploadingAsset(wb.assetDetail.type, wb.assetDetail.item.id)"
                @click="wb.uploadAssetImage(wb.assetDetail.type, wb.assetDetail.item.id)"
              >
                <Loader2 v-if="wb.isUploadingAsset(wb.assetDetail.type, wb.assetDetail.item.id)" :size="11" class="animate-spin" />
                <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                上传图片
              </button>
              <button
                v-if="wb.assetDetail.type === 'character'"
                class="btn"
                :disabled="wb.isPendingCharImage(wb.assetDetail.item.id)"
                @click="wb.genCharImg(wb.assetDetail.item.id)"
              >
                {{ wb.assetImageSrc(wb.assetDetail.item) ? '重绘形象' : (wb.isPendingCharImage(wb.assetDetail.item.id) ? '生成中' : '生成形象') }}
              </button>
              <button
                v-else-if="wb.assetDetail.type === 'scene'"
                class="btn"
                :disabled="wb.isPendingSceneImage(wb.assetDetail.item.id)"
                @click="wb.genSceneImg(wb.assetDetail.item.id)"
              >
                {{ wb.assetImageSrc(wb.assetDetail.item) ? '重绘场景' : (wb.isPendingSceneImage(wb.assetDetail.item.id) ? '生成中' : '生成场景') }}
              </button>
              <button
                v-else-if="wb.assetDetail.type === 'prop'"
                class="btn"
                :disabled="wb.isPendingPropImage(wb.assetDetail.item.id)"
                @click="wb.genPropImg(wb.assetDetail.item.id)"
              >
                {{ wb.assetImageSrc(wb.assetDetail.item) ? '重绘道具图' : (wb.isPendingPropImage(wb.assetDetail.item.id) ? '生成中' : '生成道具图') }}
              </button>
              <button class="btn btn-primary" :disabled="wb.savingAssetDetail" @click="wb.saveAssetDetail">
                <Loader2 v-if="wb.savingAssetDetail" :size="12" class="animate-spin" />
                保存修改
              </button>
            </div>
          </footer>
        </section>
      </div>
</template>
