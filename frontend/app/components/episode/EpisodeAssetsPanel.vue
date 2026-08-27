<script setup>
import { Loader2, Plus, X, ListTodo, Upload, Play, MapPin } from 'lucide-vue-next'

const wb = useEpisodeWorkbenchInject()
</script>

<template>
          <div v-if="wb.prodTab === 'assets'" class="prod-content">
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">资产</span>
              <span class="tag mono">{{ wb.assetReadyCount }}/{{ wb.assetTotalCount }} 已就绪</span>
              <span class="tag">{{ wb.lockedImageConfigLabel }}</span>
              <div class="ml-auto flex gap-1 asset-bar-actions">
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
            <div class="character-asset-grid">
              <article
                v-for="c in wb.visualChars"
                :key="c.id"
                class="card character-asset-card"
                tabindex="0"
                role="button"
                @click="wb.openAssetDetail('character', c)"
                @keydown.enter.prevent="wb.openAssetDetail('character', c)"
                @keydown.space.prevent="wb.openAssetDetail('character', c)"
              >
                <button class="asset-del-btn" title="从本集移除角色" @click.stop="wb.askDeleteAsset('character', c)"><X :size="11" /></button>
                <div class="character-asset-main">
                  <div class="character-asset-overview"><div class="character-portrait">
                      <img
                        v-if="c.image_url || c.imageUrl"
                        :src="wb.thumbOf(wb.assetImageSrc(c))"
                        class="previewable-image"
                        loading="lazy"
                        @error="wb.thumbFallback($event, wb.assetImageSrc(c))"
                        @click.stop="wb.openImageViewer(wb.assetImageSrc(c), `${c.name} 角色形象`)"
                      />
                      <div v-else class="character-portrait-empty">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      </div>
                      <span class="asset-cover-badge" :class="(c.image_url || c.imageUrl) ? 'is-ready' : (wb.isPendingCharImage(c.id) ? 'is-pending' : '')">
                        {{ (c.image_url || c.imageUrl) ? '形象已生成' : (wb.isPendingCharImage(c.id) ? '形象生成中' : '形象待生成') }}
                      </span>
                    </div>

                    <div class="character-asset-head">
                      <div class="character-title-block">
                        <div class="character-name-row">
                          <strong class="character-name">{{ c.name }}</strong>
                          <span class="tag">{{ c.role || '角色' }}</span>
                        </div>
                        <div class="character-visual-summary" :title="wb.characterVisualSummary(c)">
                          <span>样貌：{{ wb.characterAppearanceValue(c) }}</span>
                          <span>妆造：{{ wb.characterStylingValue(c) }}</span>
                        </div>
                      </div>
                      <button class="btn btn-sm character-gen-btn" :disabled="wb.isPendingCharImage(c.id)" @click.stop="wb.genCharImg(c.id)">
                        <Loader2 v-if="wb.isPendingCharImage(c.id)" :size="11" class="animate-spin" />
                        {{ (c.image_url || c.imageUrl) ? '重绘' : (wb.isPendingCharImage(c.id) ? '生成中' : '生成') }}
                      </button>
                      <button class="btn btn-sm" title="上传角色形象图" :disabled="wb.isUploadingAsset('character', c.id)" @click.stop="wb.uploadAssetImage('character', c.id)">
                        <Loader2 v-if="wb.isUploadingAsset('character', c.id)" :size="11" class="animate-spin" />
                        <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        上传
                      </button>
                    </div>
                  </div>
                  <div class="asset-final-prompt" :title="c.final_prompt || c.finalPrompt || ''">
                    <span class="afp-label">最终提示词 · 三视图</span>
                    <span :class="['afp-text', !(c.final_prompt || c.finalPrompt) && 'dim']">{{ c.final_prompt || c.finalPrompt || '首次生成形象时由提示词 Agent 自动生成' }}</span>
                  </div>
                </div>
              </article>
            </div>
            </template>

            <div class="asset-section-title">
              场景
              <button class="asset-add-btn" @click="wb.openAssetPick('scene')">从素材库选入</button>
              <button class="asset-add-btn" @click="wb.openAssetCreate('scene')"><Plus :size="11" /> 新增</button>
            </div>
            <template v-if="wb.scenes.length">
            <div class="asset-grid">
              <div
                v-for="s in wb.scenes"
                :key="s.id"
                class="card asset-card asset-click-card"
                tabindex="0"
                role="button"
                @click="wb.openAssetDetail('scene', s)"
                @keydown.enter.prevent="wb.openAssetDetail('scene', s)"
                @keydown.space.prevent="wb.openAssetDetail('scene', s)"
              >
                <button class="asset-del-btn" title="从本集移除场景" @click.stop="wb.askDeleteAsset('scene', s)"><X :size="11" /></button>
                <div class="asset-cover wide">
                  <img
                    v-if="s.image_url || s.imageUrl"
                    :src="wb.thumbOf(wb.assetImageSrc(s))"
                    class="previewable-image"
                    loading="lazy"
                    @error="wb.thumbFallback($event, wb.assetImageSrc(s))"
                    @click.stop="wb.openImageViewer(wb.assetImageSrc(s), `${s.location} 场景图`)"
                  />
                  <div v-else class="asset-cover-empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  </div>
                  <span class="asset-cover-badge" :class="(s.image_url || s.imageUrl) ? 'is-ready' : (wb.isPendingSceneImage(s.id) ? 'is-pending' : '')">{{ (s.image_url || s.imageUrl) ? '已生成' : (wb.isPendingSceneImage(s.id) ? '生成中' : '待生成') }}</span>
                </div>
                <div class="asset-body">
                  <div class="asset-name" :title="s.location">{{ s.location }}</div>
                  <div class="asset-meta asset-desc dim" :title="wb.sceneDescriptionValue(s)">{{ wb.sceneDescriptionValue(s) }}</div>
                  <div v-if="wb.sceneLightingValue(s)" class="asset-meta asset-light dim" :title="wb.sceneLightingValue(s)">光照 · {{ wb.sceneLightingValue(s) }}</div>
                  <div class="asset-meta asset-final" :class="{ dim: !(s.final_prompt || s.finalPrompt) }" :title="s.final_prompt || s.finalPrompt || ''">
                    <span class="afp-label">最终提示词 · 固定视角</span>
                    {{ s.final_prompt || s.finalPrompt || '首次生成图片时由提示词 Agent 自动生成（前景/中景/后景）' }}
                  </div>
                </div>
                <div class="asset-foot">
                  <span :class="['dot', (s.image_url || s.imageUrl) && 'ok', wb.isPendingSceneImage(s.id) && 'pending']" />
                  <button class="btn btn-sm ml-auto" title="上传场景图" :disabled="wb.isUploadingAsset('scene', s.id)" @click.stop="wb.uploadAssetImage('scene', s.id)">
                    <Loader2 v-if="wb.isUploadingAsset('scene', s.id)" :size="11" class="animate-spin" />
                    <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    上传
                  </button>
                  <button class="btn btn-sm" :disabled="wb.isPendingSceneImage(s.id)" @click.stop="wb.genSceneImg(s.id)">
                    <Loader2 v-if="wb.isPendingSceneImage(s.id)" :size="11" class="animate-spin" />
                    {{ (s.image_url || s.imageUrl) ? '重绘' : (wb.isPendingSceneImage(s.id) ? '生成中' : '生成') }}
                  </button>
                </div>
              </div>
            </div>
            </template>

            <div class="asset-section-title">
              道具
              <button class="asset-add-btn" @click="wb.openAssetPick('prop')">从素材库选入</button>
              <button class="asset-add-btn" @click="wb.openAssetCreate('prop')"><Plus :size="11" /> 新增</button>
            </div>
            <div v-if="wb.propItems.length" class="asset-grid">
              <div
                v-for="p in wb.propItems"
                :key="p.id"
                class="card asset-card asset-click-card prop-card"
                tabindex="0"
                role="button"
                @click="wb.openAssetDetail('prop', p)"
                @keydown.enter.prevent="wb.openAssetDetail('prop', p)"
                @keydown.space.prevent="wb.openAssetDetail('prop', p)"
              >
                <button class="asset-del-btn" title="从本集移除道具" @click.stop="wb.askDeleteAsset('prop', p)"><X :size="11" /></button>
                <div class="asset-cover wide">
                  <img
                    v-if="p.image_url || p.imageUrl"
                    :src="wb.thumbOf(wb.assetImageSrc(p))"
                    class="previewable-image"
                    loading="lazy"
                    @error="wb.thumbFallback($event, wb.assetImageSrc(p))"
                    @click.stop="wb.openImageViewer(wb.assetImageSrc(p), `${p.name} 道具图`)"
                  />
                  <div v-else class="asset-cover-empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                  </div>
                  <span class="asset-cover-badge" :class="(p.image_url || p.imageUrl) ? 'is-ready' : (wb.isPendingPropImage(p.id) ? 'is-pending' : '')">{{ (p.image_url || p.imageUrl) ? '已生成' : (wb.isPendingPropImage(p.id) ? '生成中' : '待生成') }}</span>
                </div>
                <div class="asset-body">
                  <div class="prop-name-row">
                    <span class="asset-name" :title="p.name">{{ p.name }}</span>
                    <span class="tag">{{ p.type || '道具' }}</span>
                  </div>
                  <div class="asset-meta asset-desc dim" :title="p.description || ''">{{ p.description || '暂无描述' }}</div>
                  <div class="asset-meta asset-final" :class="{ dim: !(p.final_prompt || p.finalPrompt) }" :title="p.final_prompt || p.finalPrompt || ''">
                    <span class="afp-label">最终提示词 · 白底单品</span>
                    {{ p.final_prompt || p.finalPrompt || '首次生成图片时由提示词 Agent 自动生成（白底单品）' }}
                  </div>
                </div>
                <div class="asset-foot">
                  <span :class="['dot', (p.image_url || p.imageUrl) && 'ok', wb.isPendingPropImage(p.id) && 'pending']" />
                  <button class="btn btn-sm ml-auto" title="上传道具图" :disabled="wb.isUploadingAsset('prop', p.id)" @click.stop="wb.uploadAssetImage('prop', p.id)">
                    <Loader2 v-if="wb.isUploadingAsset('prop', p.id)" :size="11" class="animate-spin" />
                    <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    上传
                  </button>
                  <button class="btn btn-sm" :disabled="wb.isPendingPropImage(p.id)" @click.stop="wb.genPropImg(p.id)">
                    <Loader2 v-if="wb.isPendingPropImage(p.id)" :size="11" class="animate-spin" />
                    {{ (p.image_url || p.imageUrl) ? '重绘' : (wb.isPendingPropImage(p.id) ? '生成中' : '生成') }}
                  </button>
                </div>
              </div>
            </div>
            <div v-else class="asset-props-empty">本集暂无涉及事态发展的关键道具</div>
            </template>
          </div>
</template>
