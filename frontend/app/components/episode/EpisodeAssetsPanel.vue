<script setup>
import { Loader2, Plus, Upload, Trash2 } from 'lucide-vue-next'

const wb = useEpisodeWorkbenchInject()
</script>

<template>
          <div v-if="wb.prodTab === 'assets'" class="prod-content">
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">资产</span>
              <span class="tag mono">{{ wb.assetReadyCount }}/{{ wb.assetTotalCount }} 已就绪</span>
              <span class="tag">{{ wb.effectiveImageConfigLabel }}</span>
              <div class="ml-auto flex gap-1 asset-bar-actions">
                <template v-if="wb.assetSelectMode">
                  <button class="btn btn-sm" @click="wb.exitAssetSelectMode">取消</button>
                  <button class="btn btn-sm" @click="wb.toggleSelectAllAssets">{{ wb.allAssetsSelected ? '取消全选' : '全选' }}</button>
                  <button
                    class="btn btn-sm btn-danger"
                    :disabled="!wb.selectedAssetCount || wb.assetDelete.loading"
                    @click="wb.askBatchDeleteAssets"
                  >
                    <Trash2 :size="11" />
                    移除已选（{{ wb.selectedAssetCount }}）
                  </button>
                </template>
                <template v-else>
                <button
                  v-for="t in wb.EXTRACT_TARGETS"
                  :key="t.key"
                  class="btn btn-sm asset-btn-extract"
                  :disabled="wb.isExtracting(t.key)"
                  @click="wb.doExtract(t.key)"
                >
                  <Loader2 v-if="wb.isExtracting(t.key)" :size="11" class="animate-spin" />
                  <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  {{ (t.key === 'characters' ? wb.chars.length : t.key === 'scenes' ? wb.scenes.length : wb.propItems.length) ? `重提${t.label}` : `提取${t.label}` }}
                </button>
                <span class="asset-bar-divider" />
                <button class="btn btn-sm asset-btn-batch" @click="wb.batchCharImages">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  批量角色
                </button>
                <button class="btn btn-sm asset-btn-batch" @click="wb.batchSceneImages">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  批量场景
                </button>
                <button class="btn btn-sm asset-btn-batch" @click="wb.batchPropImages">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  批量道具
                </button>
                <button class="btn btn-sm" @click="wb.openAssetImport"><Upload :size="11" /> 导入文件</button>
                <button v-if="wb.assetTotalCount" class="btn btn-sm btn-danger" @click="wb.enterAssetSelectMode">
                  <Trash2 :size="11" />
                  批量删除
                </button>
                </template>
              </div>
            </div>
            <div v-if="wb.extractingTargets.length && !wb.chars.length && !wb.scenes.length && !wb.propItems.length" class="step-loading">
              <Loader2 :size="24" class="animate-spin" style="color:var(--accent)" />
              <div class="loading-text">正在提取{{ wb.extractingLabels }}...</div>
            </div>
            <div v-else-if="!wb.chars.length && !wb.scenes.length && !wb.propItems.length" class="step-empty asset-empty-state">
              <div class="empty-visual">
                <Plus :size="32" />
              </div>
              <div class="empty-title">开始提取资产</div>
              <div class="empty-desc">改写完成后进入本页会自动提取角色、场景和道具。也可手动提取、从素材库选入，或上传 md/txt 导入。</div>
              <div class="asset-empty-actions">
                <button class="btn btn-primary" :disabled="!!wb.extractingTargets.length" @click="wb.doExtractAll">
                  <Loader2 v-if="wb.extractingTargets.length" :size="13" class="animate-spin" />
                  <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  {{ wb.extractingTargets.length ? `正在提取${wb.extractingLabels}…` : '开始提取' }}
                </button>
                <button class="btn btn-primary" @click="wb.openAssetCreate('character')"><Plus :size="13" /> 新增角色</button>
                <button class="btn btn-primary" @click="wb.openAssetCreate('scene')"><Plus :size="13" /> 新增场景</button>
                <button class="btn btn-primary" @click="wb.openAssetCreate('prop')"><Plus :size="13" /> 新增道具</button>
                <button class="btn" @click="wb.openAssetPick('character')">从素材库选入</button>
                <button class="btn" @click="wb.openAssetImport"><Upload :size="13" /> 导入文件</button>
              </div>
            </div>
            <template v-else>
            <div class="asset-section-title">
              角色
              <button class="asset-add-btn" @click="wb.openAssetPick('character')">从素材库选入</button>
              <button class="asset-add-btn" @click="wb.openAssetCreate('character')"><Plus :size="11" /> 新增</button>
            </div>
            <template v-if="wb.visualChars.length">
            <div class="asset-grid">
              <AssetCard
                v-for="c in wb.visualChars"
                :key="c.id"
                type="character"
                :title="c.name"
                :tag="c.role || '角色'"
                :meta-lines="[`样貌：${wb.characterAppearanceValue(c)}`, `妆造：${wb.characterStylingValue(c)}`]"
                final-prompt-label="最终提示词 · 三视图"
                :final-prompt="c.final_prompt || c.finalPrompt || ''"
                final-prompt-placeholder="首次生成形象时由提示词 Agent 自动生成"
                :image-src="wb.assetImageSrc(c)"
                :thumb-src="wb.thumbOf(wb.assetImageSrc(c))"
                :has-image="!!(c.image_url || c.imageUrl)"
                :pending="wb.isPendingCharImage(c.id)"
                :uploading="wb.isUploadingAsset('character', c.id)"
                :download-href="wb.assetImageSrc(c)"
                :download-name="wb.assetDownloadName('character', c)"
                download-title="下载角色形象图"
                upload-title="上传角色形象图"
                duplicate-title="复制角色"
                :duplicating="wb.duplicatingAsset"
                delete-title="从本集移除角色"
                :selected="wb.isAssetSelected('character', c.id)"
                :select-mode="wb.assetSelectMode"
                @click="wb.onAssetCardClick('character', c)"
                @delete="wb.askDeleteAsset('character', c)"
                @toggle-select="wb.toggleAssetSelect('character', c.id)"
                @generate="wb.genCharImg(c.id)"
                @upload="wb.uploadAssetImage('character', c.id)"
                @duplicate="wb.duplicateAsset('character', c)"
                @preview="wb.openImageViewer(wb.assetImageSrc(c), `${c.name} 角色形象`)"
                @thumb-error="wb.thumbFallback($event, wb.assetImageSrc(c))"
              />
            </div>
            </template>

            <div class="asset-section-title">
              场景
              <button class="asset-add-btn" @click="wb.openAssetPick('scene')">从素材库选入</button>
              <button class="asset-add-btn" @click="wb.openAssetCreate('scene')"><Plus :size="11" /> 新增</button>
            </div>
            <template v-if="wb.scenes.length">
            <div class="asset-grid">
              <AssetCard
                v-for="s in wb.scenes"
                :key="s.id"
                type="scene"
                :title="s.location"
                :meta-lines="[wb.sceneDescriptionValue(s), wb.sceneLightingValue(s) ? `光照 · ${wb.sceneLightingValue(s)}` : ''].filter(Boolean)"
                final-prompt-label="最终提示词 · 固定视角"
                :final-prompt="s.final_prompt || s.finalPrompt || ''"
                final-prompt-placeholder="首次生成图片时由提示词 Agent 自动生成（前景/中景/后景）"
                :image-src="wb.assetImageSrc(s)"
                :thumb-src="wb.thumbOf(wb.assetImageSrc(s))"
                :has-image="!!(s.image_url || s.imageUrl)"
                :pending="wb.isPendingSceneImage(s.id)"
                :uploading="wb.isUploadingAsset('scene', s.id)"
                :download-href="wb.assetImageSrc(s)"
                :download-name="wb.assetDownloadName('scene', s)"
                download-title="下载场景图"
                upload-title="上传场景图"
                duplicate-title="复制场景"
                :duplicating="wb.duplicatingAsset"
                delete-title="从本集移除场景"
                :selected="wb.isAssetSelected('scene', s.id)"
                :select-mode="wb.assetSelectMode"
                @click="wb.onAssetCardClick('scene', s)"
                @delete="wb.askDeleteAsset('scene', s)"
                @toggle-select="wb.toggleAssetSelect('scene', s.id)"
                @generate="wb.genSceneImg(s.id)"
                @upload="wb.uploadAssetImage('scene', s.id)"
                @duplicate="wb.duplicateAsset('scene', s)"
                @preview="wb.openImageViewer(wb.assetImageSrc(s), `${s.location} 场景图`)"
                @thumb-error="wb.thumbFallback($event, wb.assetImageSrc(s))"
              />
            </div>
            </template>

            <div class="asset-section-title">
              道具
              <button class="asset-add-btn" @click="wb.openAssetPick('prop')">从素材库选入</button>
              <button class="asset-add-btn" @click="wb.openAssetCreate('prop')"><Plus :size="11" /> 新增</button>
            </div>
            <div v-if="wb.propItems.length" class="asset-grid">
              <AssetCard
                v-for="p in wb.propItems"
                :key="p.id"
                type="prop"
                :title="p.name"
                :tag="p.type || '道具'"
                :meta-lines="[p.description || '暂无描述']"
                final-prompt-label="最终提示词 · 白底单品"
                :final-prompt="p.final_prompt || p.finalPrompt || ''"
                final-prompt-placeholder="首次生成图片时由提示词 Agent 自动生成（白底单品）"
                :image-src="wb.assetImageSrc(p)"
                :thumb-src="wb.thumbOf(wb.assetImageSrc(p))"
                :has-image="!!(p.image_url || p.imageUrl)"
                :pending="wb.isPendingPropImage(p.id)"
                :uploading="wb.isUploadingAsset('prop', p.id)"
                :download-href="wb.assetImageSrc(p)"
                :download-name="wb.assetDownloadName('prop', p)"
                download-title="下载道具图"
                upload-title="上传道具图"
                duplicate-title="复制道具"
                :duplicating="wb.duplicatingAsset"
                delete-title="从本集移除道具"
                :selected="wb.isAssetSelected('prop', p.id)"
                :select-mode="wb.assetSelectMode"
                @click="wb.onAssetCardClick('prop', p)"
                @delete="wb.askDeleteAsset('prop', p)"
                @toggle-select="wb.toggleAssetSelect('prop', p.id)"
                @generate="wb.genPropImg(p.id)"
                @upload="wb.uploadAssetImage('prop', p.id)"
                @duplicate="wb.duplicateAsset('prop', p)"
                @preview="wb.openImageViewer(wb.assetImageSrc(p), `${p.name} 道具图`)"
                @thumb-error="wb.thumbFallback($event, wb.assetImageSrc(p))"
              />
            </div>
            <div v-else class="asset-props-empty">本集暂无涉及事态发展的关键道具</div>
            </template>
          </div>
</template>
