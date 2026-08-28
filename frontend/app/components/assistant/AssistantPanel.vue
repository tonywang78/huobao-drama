<script setup>
import { ArrowLeft, Bot, BookmarkPlus, Brain, ChevronDown, Copy, ImagePlus, Loader2, Paperclip, Pencil, Send, Sparkles, Trash2, Wand2, X, ZoomIn } from 'lucide-vue-next'
import ModelSelect from '~/components/ModelSelect.vue'
import MentionTextarea from '~/components/MentionTextarea.vue'
import ConfirmDialog from '~/components/ConfirmDialog.vue'
import { thumbOf, thumbFallback } from '~/composables/useMedia'
import { renderMarkdown } from '~/utils/markdown'

const props = defineProps({
  variant: { type: String, default: 'overlay' }, // overlay | dock
})

const a = useStudioAssistant()
const fileInput = ref(null)
const panelEl = ref(null)
const bodyEl = ref(null)
const composerEl = ref(null)
const snippetManageOpen = ref(false)
const clearConfirmOpen = ref(false)
const stickToBottom = ref(true)

async function confirmClearHistory() {
  await a.clearHistory()
  clearConfirmOpen.value = false
}

function scrollToLatest() {
  const el = bodyEl.value
  if (!el) return
  el.scrollTop = el.scrollHeight
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight
  })
}

function onBodyScroll() {
  const el = bodyEl.value
  if (!el) return
  stickToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 48
}

watch(
  () => a.open,
  async (open) => {
    if (!open) return
    stickToBottom.value = true
    await nextTick()
    scrollToLatest()
  },
  { flush: 'post' },
)

watch(
  () => a.messages.map(m => m.id).join('\0'),
  async () => {
    if (!a.open || !stickToBottom.value) return
    await nextTick()
    scrollToLatest()
  },
)

watch(
  () => {
    if (!a.open || !stickToBottom.value) return ''
    const last = a.messages[a.messages.length - 1]
    if (!last?.streaming) return ''
    return `${last.content?.text?.length ?? 0}|${last.content?.artifacts?.map(art => art.url || art.status).join(',') ?? ''}`
  },
  async (sig) => {
    if (!sig) return
    await nextTick()
    scrollToLatest()
  },
)

function excerptBody(text, max = 72) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  return `${flat.slice(0, max)}…`
}

function openSnippetEdit(snip) {
  snippetManageOpen.value = false
  a.openEditSnippet(snip)
}

function onPickFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (file) a.addAttachment(file)
}

function onSendKey(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.defaultPrevented) {
    e.preventDefault()
    a.send()
  }
}

function resolveSnippetSourceText() {
  const taSel = composerEl.value?.getSelectedText?.()?.trim()
  if (taSel) return taSel
  const sel = window.getSelection()
  if (sel && !sel.isCollapsed && panelEl.value) {
    const anchor = sel.anchorNode
    const focus = sel.focusNode
    if (anchor && panelEl.value.contains(anchor) && focus && panelEl.value.contains(focus)) {
      const text = sel.toString().trim()
      if (text) return text
    }
  }
  return a.draft.trim()
}

function onOpenSaveSnippet() {
  a.openSaveSnippet(resolveSnippetSourceText())
}

function resolveSnippetFromMessage(fullText, event) {
  const sel = window.getSelection()
  if (sel && !sel.isCollapsed) {
    const text = sel.toString().trim()
    const bubble = event?.currentTarget?.closest?.('.assistant-msg-bubble')
    if (text && bubble && sel.anchorNode && bubble.contains(sel.anchorNode)) return text
  }
  return fullText
}

function messageHtml(text) {
  return renderMarkdown(text)
}

const ACTION_LABEL = {
  script_rewriter: '改写剧本',
  extractor: '提取角色/场景/道具',
  storyboard_breaker: '拆分分镜',
  video_prompts: '生成视频提示词',
}

const TYPE_LABEL = { character: '角色', scene: '场景', prop: '道具' }

function assetDialogTitle() {
  const d = a.assetDialog
  if (d.step === 'choose') return '应用到资产'
  if (d.step === 'pick-type') return d.mode === 'update' ? '更新哪类资产？' : '创建哪类资产？'
  if (d.step === 'pick-target') return `选择${TYPE_LABEL[d.type]}`
  if (d.step === 'update-confirm') return '确认更新图片'
  return '填写资产信息'
}

function assetDialogHint() {
  const refs = a.assetDialog.hintRefs
  if (refs.length === 1) return `检测到引用 @${refs[0].name || refs[0].type}`
  if (refs.length > 1) return `检测到 ${refs.length} 个引用资产`
  return ''
}

function preselectedAssetLabel() {
  const sel = a.selectedAssetCandidate()
  if (sel?.name) return sel.name
  const hint = a.assetDialog.hintRefs?.find(r => r.id === a.assetDialog.targetId)
  return hint?.name || ''
}
</script>

<template>
  <aside
    v-if="a.open"
    ref="panelEl"
    :class="['assistant-panel', `is-${props.variant}`]"
    role="complementary"
    aria-label="工作室助手"
  >
    <header class="assistant-head">
      <div class="assistant-head-bar">
        <div class="assistant-head-title">
          <Sparkles :size="14" />
          <span>助手</span>
        </div>
        <div class="assistant-head-actions">
          <button
            v-if="a.messages.length"
            class="btn btn-ghost btn-icon"
            type="button"
            title="清空历史对话"
            aria-label="清空历史对话"
            :disabled="a.sending || a.clearing"
            @click="clearConfirmOpen = true"
          >
            <Trash2 :size="14" />
          </button>
          <button class="btn btn-ghost btn-icon" type="button" aria-label="关闭助手" @click="a.open = false">
            <X :size="14" />
          </button>
        </div>
      </div>
      <div v-if="a.textModelOptions.length" class="assistant-toolbar">
        <ModelSelect
          class="assistant-model-select"
          :model-value="a.chatModel"
          label=""
          :options="a.textModelOptions"
          :default-label="`默认 · ${a.textModelOptions[0].model}`"
          :show-config="a.textModelMultiCfg"
          @update:model-value="a.setChatModel"
        />
        <button
          type="button"
          class="assistant-thinking-toggle"
          :class="{ 'is-on': a.enableThinking }"
          :title="a.enableThinking ? '思考已开：会显示思考过程（更慢）' : '思考已关：更快，不显示思考过程'"
          :aria-pressed="a.enableThinking ? 'true' : 'false'"
          aria-label="思考模式"
          @click="a.setEnableThinking(!a.enableThinking)"
        >
          <Brain :size="14" />
          <span>思考</span>
        </button>
      </div>
    </header>

    <div ref="bodyEl" class="assistant-body" @scroll="onBodyScroll">
      <div v-if="!a.messages.length" class="assistant-empty">
        <Bot :size="28" />
        <div class="assistant-empty-title">短剧工作室助手</div>
        <div class="assistant-empty-desc">问当前剧本、@ 引用资产或风格、生成或修改图片、写提示词。覆盖类工序会先让你确认。</div>
      </div>
      <div v-else class="assistant-messages">
        <div
          v-for="msg in a.messages"
          :key="msg.id"
          :class="['assistant-msg', `is-${msg.role}`]"
        >
          <div class="assistant-msg-bubble">
            <div v-if="msg.content.refs?.length" class="assistant-refs">
              <span
                v-for="(r, i) in msg.content.refs"
                :key="i"
                :class="['assistant-chip', (r.category === 'catalog' || r.category === 'project') ? 'is-style' : '', r.category === 'generated' ? 'is-generated' : '']"
              >
                @{{ r.name || r.token }}
              </span>
            </div>
            <div v-if="msg.content.attachments?.length" class="assistant-thumbs">
              <img
                v-for="(att, i) in msg.content.attachments"
                :key="i"
                :src="thumbOf(att.url)"
                :alt="att.name || '附图'"
                @error="thumbFallback($event, att.url)"
              />
            </div>
            <div
              v-if="msg.role === 'assistant' && msg.content.reasoning"
              class="assistant-reasoning"
            >
              <button
                type="button"
                class="assistant-reasoning-toggle"
                @click="msg.reasoningOpen = !msg.reasoningOpen"
              >
                <Brain :size="12" />
                <span>{{ msg.streaming && !msg.content.text ? '思考中…' : '思考过程' }}</span>
                <ChevronDown
                  :size="12"
                  :class="['assistant-reasoning-chevron', { 'is-open': msg.reasoningOpen }]"
                />
              </button>
              <div v-show="msg.reasoningOpen" class="assistant-reasoning-body">{{ msg.content.reasoning }}</div>
            </div>
            <div
              v-if="msg.content.text || msg.streaming"
              :class="['assistant-msg-text', { 'is-streaming': msg.streaming }]"
            >
              <template v-if="msg.streaming">
                {{ msg.content.text }}<span class="assistant-caret" />
              </template>
              <div v-else class="assistant-md" v-html="messageHtml(msg.content.text)" />
            </div>
            <div
              v-if="msg.role === 'assistant' && msg.content.text && !msg.streaming"
              class="assistant-msg-actions"
            >
              <button
                class="assistant-msg-action"
                type="button"
                title="复制回复"
                @click="a.copyMessageText(msg.content.text)"
              >
                <Copy :size="12" />
                <span>复制</span>
              </button>
              <button
                class="assistant-msg-action"
                type="button"
                title="加入常用提示词"
                @click="a.openSaveSnippet(resolveSnippetFromMessage(msg.content.text, $event))"
              >
                <BookmarkPlus :size="12" />
                <span>加入常用</span>
              </button>
            </div>
            <div v-if="msg.content.artifacts?.length" class="assistant-artifacts">
              <div v-for="art in msg.content.artifacts" :key="art.taskId || art.task_id" class="assistant-artifact">
                <div v-if="(art.status === 'processing' || !art.status) && !art.url" class="assistant-artifact-pending">
                  <Loader2 :size="16" class="animate-spin" />
                  正在出图…
                </div>
                <template v-else-if="art.url">
                  <button
                    type="button"
                    class="assistant-artifact-thumb"
                    :title="'点击放大预览'"
                    @click="a.openImagePreview(a.mediaUrl(art.url), '生成图')"
                  >
                    <img :src="thumbOf(art.url)" alt="生成图" @error="thumbFallback($event, art.url)" />
                    <span class="assistant-artifact-zoom"><ZoomIn :size="14" /></span>
                  </button>
                  <div class="assistant-artifact-actions-row">
                    <button
                      class="btn btn-sm assistant-artifact-save"
                      type="button"
                      @click="a.continueEditArtifact(art)"
                    >
                      <Wand2 :size="12" />
                      继续改图
                    </button>
                    <button
                      class="btn btn-sm btn-primary assistant-artifact-save"
                      type="button"
                      @click="a.openAssetDialog(a.mediaUrl(art.url), a.resolveMessageRefs(msg))"
                    >
                      <ImagePlus :size="12" />
                      应用到资产
                    </button>
                  </div>
                </template>
                <div v-else-if="art.status === 'failed'" class="assistant-artifact-error">{{ art.error || '生成失败' }}</div>
              </div>
            </div>
            <div v-if="msg.content.proposal" class="assistant-confirm">
              <div class="assistant-confirm-title">确认执行：{{ ACTION_LABEL[msg.content.proposal.action] || msg.content.proposal.action }}</div>
              <div class="assistant-confirm-warn">{{ msg.content.proposal.warning }}</div>
              <div class="assistant-confirm-actions">
                <button class="btn" type="button" @click="a.dismissProposal(msg)">取消</button>
                <button class="btn btn-primary" type="button" :disabled="a.confirming" @click="a.confirmProposal(msg)">
                  <Loader2 v-if="a.confirming" :size="12" class="animate-spin" />
                  确认执行
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <footer class="assistant-foot">
      <div v-if="a.attachments.length" class="assistant-pending-atts">
        <div v-for="(att, i) in a.attachments" :key="i" class="assistant-pending-att">
          <img :src="thumbOf(att.url)" alt="" @error="thumbFallback($event, att.url)" />
          <button type="button" class="assistant-att-x" @click="a.removeAttachment(i)"><X :size="10" /></button>
        </div>
      </div>
      <div v-if="a.snippets.length" class="assistant-snippets">
        <div class="assistant-snippet-row">
          <div class="assistant-snippet-scroll">
            <template v-if="a.projectSnippets.length">
              <span class="assistant-snippet-scope">本项目</span>
              <button
                v-for="snip in a.projectSnippets"
                :key="`p-${snip.id}`"
                type="button"
                class="assistant-snippet-pill"
                :title="snip.body"
                @click="a.applySnippet(snip.body)"
              >
                {{ snip.title }}
              </button>
            </template>
            <template v-if="a.sharedSnippets.length">
              <span class="assistant-snippet-scope">共享</span>
              <button
                v-for="snip in a.sharedSnippets"
                :key="`s-${snip.id}`"
                type="button"
                class="assistant-snippet-pill"
                :title="snip.body"
                @click="a.applySnippet(snip.body)"
              >
                {{ snip.title }}
              </button>
            </template>
          </div>
          <button type="button" class="assistant-snippets-manage" @click="snippetManageOpen = true">
            管理
          </button>
        </div>
      </div>
      <div class="assistant-composer">
        <MentionTextarea
          ref="composerEl"
          v-model="a.draft"
          :options="a.mentionOptions"
          :rows="3"
          placeholder="问助手… 输入 @ 引用资产"
          input-class="textarea assistant-input"
          @keydown="onSendKey"
        />
        <div class="assistant-composer-bar">
          <div class="assistant-composer-left">
            <input ref="fileInput" type="file" accept="image/*" hidden @change="onPickFile" />
            <button class="btn btn-ghost btn-icon" type="button" title="上传图片" @click="fileInput?.click()">
              <Paperclip :size="14" />
            </button>
            <button class="btn btn-ghost btn-icon" type="button" title="加入常用提示词（有选中时仅保存选中文字）" @click="onOpenSaveSnippet">
              <BookmarkPlus :size="14" />
            </button>
          </div>
          <button class="btn btn-primary" type="button" :disabled="a.sending" @click="a.send">
            <Loader2 v-if="a.sending" :size="12" class="animate-spin" />
            <Send v-else :size="12" />
            发送
          </button>
        </div>
      </div>
    </footer>
  </aside>

  <Teleport to="body">
  <div v-if="a.imagePreview.open && a.imagePreview.src" class="overlay assistant-image-preview-overlay" @click.self="a.closeImagePreview">
    <div class="dialog assistant-image-preview-dialog">
      <header class="dialog-head">
        <h2 class="dialog-title">{{ a.imagePreview.title || '图片预览' }}</h2>
        <button class="btn btn-ghost btn-icon" type="button" @click="a.closeImagePreview"><X :size="14" /></button>
      </header>
      <div class="assistant-image-preview-body">
        <img :src="a.imagePreview.src" :alt="a.imagePreview.title || '图片预览'" />
      </div>
    </div>
  </div>
  </Teleport>

  <Teleport to="body">
  <div v-if="a.assetDialog.open" class="overlay assistant-create-overlay" @click.self="a.closeAssetDialog">
    <div class="dialog assistant-asset-dialog">
      <header class="dialog-head">
        <button
          v-if="a.assetDialog.step !== 'choose'"
          class="btn btn-ghost btn-icon"
          type="button"
          aria-label="返回"
          @click="a.assetDialogBack"
        >
          <ArrowLeft :size="14" />
        </button>
        <h2 class="dialog-title">{{ assetDialogTitle() }}</h2>
        <button class="btn btn-ghost btn-icon" type="button" @click="a.closeAssetDialog"><X :size="14" /></button>
      </header>
      <div class="dialog-body">
        <img v-if="a.assetDialog.imageUrl" class="assistant-create-preview" :src="a.assetDialog.imageUrl" alt="" />

        <template v-if="a.assetDialog.step === 'choose'">
          <p v-if="assetDialogHint()" class="assistant-asset-hint">{{ assetDialogHint() }}</p>
          <p class="assistant-asset-desc">将这张生成图保存到项目资产库。</p>
          <div class="assistant-asset-choices">
            <button type="button" class="assistant-asset-choice" @click="a.pickAssetMode('update')">
              <span class="assistant-asset-choice-title">更新现有资产</span>
              <span class="assistant-asset-choice-desc">替换已有角色 / 场景 / 道具的图片</span>
            </button>
            <button type="button" class="assistant-asset-choice" @click="a.pickAssetMode('create')">
              <span class="assistant-asset-choice-title">创建新资产</span>
              <span class="assistant-asset-choice-desc">用此图新建一条资产记录</span>
            </button>
          </div>
        </template>

        <template v-else-if="a.assetDialog.step === 'pick-type'">
          <div class="assistant-asset-type-row">
            <button
              v-for="t in ['character', 'scene', 'prop']"
              :key="t"
              type="button"
              class="assistant-asset-type-btn"
              @click="a.pickAssetType(t)"
            >
              {{ TYPE_LABEL[t] }}
            </button>
          </div>
        </template>

        <template v-else-if="a.assetDialog.step === 'pick-target'">
          <p v-if="a.assetDialog.targetId && preselectedAssetLabel()" class="assistant-asset-hint">已预选：{{ preselectedAssetLabel() }}</p>
          <p v-if="!a.listAssetCandidates(a.assetDialog.type).length" class="assistant-asset-empty">
            当前没有可更新的{{ TYPE_LABEL[a.assetDialog.type] }}。
            <button type="button" class="assistant-asset-inline-link" @click="a.pickAssetMode('create')">改为创建新资产</button>
          </p>
          <div v-else class="assistant-asset-pick-list">
            <button
              v-for="item in a.listAssetCandidates(a.assetDialog.type)"
              :key="item.id"
              type="button"
              :class="['assistant-asset-pick-item', { 'is-selected': a.assetDialog.targetId === item.id }]"
              @click="a.pickAssetTarget(item.id)"
            >
              <img
                v-if="item.image_url"
                :src="thumbOf(item.image_url)"
                alt=""
                @error="thumbFallback($event, item.image_url)"
              />
              <span v-else class="assistant-asset-pick-placeholder">{{ TYPE_LABEL[a.assetDialog.type].slice(0, 1) }}</span>
              <span class="assistant-asset-pick-name">{{ item.name }}</span>
            </button>
          </div>
        </template>

        <template v-else-if="a.assetDialog.step === 'update-confirm'">
          <div v-if="a.selectedAssetCandidate()" class="assistant-asset-update-target">
            <span class="assistant-asset-update-label">将更新</span>
            <strong>{{ TYPE_LABEL[a.assetDialog.type] }} · {{ a.selectedAssetCandidate()?.name }}</strong>
          </div>
          <p class="assistant-asset-warn">原图会保留在历史记录中，可用新图替换当前展示图。</p>
        </template>

        <template v-else-if="a.assetDialog.step === 'create-form'">
          <label class="field">
            <span class="field-label">{{ a.assetDialog.type === 'scene' ? '地点' : '名称' }}</span>
            <input v-model="a.assetDialog.name" class="input" placeholder="必填" />
          </label>
          <label class="field">
            <span class="field-label">{{ a.assetDialog.type === 'character' ? '样貌' : a.assetDialog.type === 'scene' ? '场景描述' : '物品外貌' }}</span>
            <textarea v-model="a.assetDialog.extra" class="textarea" rows="3" placeholder="可选" />
          </label>
        </template>
      </div>
      <footer v-if="a.assetDialog.step === 'update-confirm' || a.assetDialog.step === 'create-form'" class="dialog-foot">
        <button class="btn" type="button" @click="a.closeAssetDialog">取消</button>
        <button class="btn btn-primary" type="button" @click="a.submitAssetDialog">
          <ImagePlus :size="12" />
          {{ a.assetDialog.mode === 'update' ? '确认更新' : '创建' }}
        </button>
      </footer>
    </div>
  </div>
  </Teleport>

  <Teleport to="body">
  <div v-if="a.snippetSave.open" class="overlay assistant-create-overlay" @click.self="a.snippetSave.open = false">
    <div class="dialog">
      <header class="dialog-head">
        <h2 class="dialog-title">加入常用提示词</h2>
        <button class="btn btn-ghost btn-icon" type="button" @click="a.snippetSave.open = false"><X :size="14" /></button>
      </header>
      <div class="dialog-body">
        <label class="field">
          <span class="field-label">标题</span>
          <input v-model="a.snippetSave.title" class="input" placeholder="在列表中显示的名称" />
        </label>
        <label v-if="a.currentDramaId" class="field">
          <span class="field-label">范围</span>
          <select v-model="a.snippetSave.scope" class="input">
            <option value="project">本项目</option>
            <option value="global">全部项目（共享）</option>
          </select>
        </label>
        <p v-else class="assistant-snippet-hint">当前无项目上下文，将保存为全部项目共享。</p>
      </div>
      <footer class="dialog-foot">
        <button class="btn" type="button" @click="a.snippetSave.open = false">取消</button>
        <button class="btn btn-primary" type="button" @click="a.submitSaveSnippet">保存</button>
      </footer>
    </div>
  </div>
  </Teleport>

  <Teleport to="body">
  <div v-if="a.snippetEdit.open" class="overlay assistant-create-overlay" @click.self="a.snippetEdit.open = false">
    <div class="dialog">
      <header class="dialog-head">
        <h2 class="dialog-title">编辑常用提示词</h2>
        <button class="btn btn-ghost btn-icon" type="button" @click="a.snippetEdit.open = false"><X :size="14" /></button>
      </header>
      <div class="dialog-body">
        <label class="field">
          <span class="field-label">标题</span>
          <input v-model="a.snippetEdit.title" class="input" />
        </label>
        <label v-if="a.currentDramaId" class="field">
          <span class="field-label">范围</span>
          <select v-model="a.snippetEdit.scope" class="input">
            <option value="project">本项目</option>
            <option value="global">全部项目（共享）</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">内容</span>
          <textarea v-model="a.snippetEdit.body" class="textarea" rows="5" />
        </label>
      </div>
      <footer class="dialog-foot">
        <button class="btn" type="button" @click="a.snippetEdit.open = false">取消</button>
        <button class="btn btn-primary" type="button" @click="a.submitEditSnippet">保存</button>
      </footer>
    </div>
  </div>
  </Teleport>

  <Teleport to="body">
  <div v-if="snippetManageOpen" class="overlay assistant-create-overlay" @click.self="snippetManageOpen = false">
    <div class="dialog assistant-snippet-manage-dialog">
      <header class="dialog-head">
        <h2 class="dialog-title">管理常用提示词</h2>
        <button class="btn btn-ghost btn-icon" type="button" @click="snippetManageOpen = false"><X :size="14" /></button>
      </header>
      <div class="dialog-body assistant-snippet-manage-body">
        <p v-if="!a.snippets.length" class="assistant-snippet-manage-empty">暂无常用提示词</p>
        <section v-if="a.projectSnippets.length" class="assistant-snippet-manage-section">
          <h3 class="assistant-snippet-manage-section-title">本项目</h3>
          <div
            v-for="snip in a.projectSnippets"
            :key="snip.id"
            class="assistant-snippet-manage-item"
          >
            <div class="assistant-snippet-manage-main">
              <div class="assistant-snippet-manage-name">{{ snip.title }}</div>
              <div class="assistant-snippet-manage-preview">{{ excerptBody(snip.body) }}</div>
            </div>
            <div class="assistant-snippet-manage-actions">
              <button class="btn btn-ghost btn-sm" type="button" @click="openSnippetEdit(snip)">
                <Pencil :size="12" />
                编辑
              </button>
              <button class="btn btn-ghost btn-sm is-danger" type="button" @click="a.removeSnippet(snip.id)">
                <Trash2 :size="12" />
                删除
              </button>
            </div>
          </div>
        </section>
        <section v-if="a.sharedSnippets.length" class="assistant-snippet-manage-section">
          <h3 class="assistant-snippet-manage-section-title">共享</h3>
          <div
            v-for="snip in a.sharedSnippets"
            :key="snip.id"
            class="assistant-snippet-manage-item"
          >
            <div class="assistant-snippet-manage-main">
              <div class="assistant-snippet-manage-name">{{ snip.title }}</div>
              <div class="assistant-snippet-manage-preview">{{ excerptBody(snip.body) }}</div>
            </div>
            <div class="assistant-snippet-manage-actions">
              <button class="btn btn-ghost btn-sm" type="button" @click="openSnippetEdit(snip)">
                <Pencil :size="12" />
                编辑
              </button>
              <button class="btn btn-ghost btn-sm is-danger" type="button" @click="a.removeSnippet(snip.id)">
                <Trash2 :size="12" />
                删除
              </button>
            </div>
          </div>
        </section>
      </div>
      <footer class="dialog-foot">
        <button class="btn" type="button" @click="snippetManageOpen = false">关闭</button>
        <button class="btn btn-primary" type="button" @click="snippetManageOpen = false; onOpenSaveSnippet()">
          <BookmarkPlus :size="12" />
          新建
        </button>
      </footer>
    </div>
  </div>
  </Teleport>

  <ConfirmDialog
    :open="clearConfirmOpen"
    title="清空历史对话"
    message="将删除当前上下文下的全部对话记录，常用提示词不会受影响。此操作不可撤销。"
    confirm-text="清空"
    loading-text="清空中..."
    :loading="a.clearing"
    @confirm="confirmClearHistory"
    @cancel="clearConfirmOpen = false"
  />
</template>
