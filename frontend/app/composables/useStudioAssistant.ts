import { computed, onMounted, reactive, toValue, watch } from 'vue'
import { toast } from 'vue-sonner'
import { assistantAPI, aiConfigAPI, characterAPI, sceneAPI, propAPI, taskAPI, uploadAPI } from '~/composables/useApi'
import { useEpisodeWorkbenchOptional } from '~/composables/useEpisodeWorkbenchInject'

const OPEN_KEY = 'huobao:assistant:open'
const MODEL_KEY = 'huobao:model:assistant'

let keybound = false
const pollingTaskIds = new Set<number>()

function readOpen() {
  try { return localStorage.getItem(OPEN_KEY) === '1' } catch { return false }
}

function configModels(cfg) {
  const raw = cfg?.model
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter(Boolean)
  try {
    const m = JSON.parse(raw)
    return Array.isArray(m) ? m.filter(Boolean) : [m].filter(Boolean)
  } catch {
    return [raw].filter(Boolean)
  }
}

function collectModelOptions(cfgs) {
  const seen = new Set()
  const out = []
  const sorted = [...cfgs].filter(c => c.is_active).sort((a, b) => (b.priority || 0) - (a.priority || 0))
  for (const c of sorted) {
    for (const m of configModels(c)) {
      const key = `${c.provider}/${m}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ key, model: m, provider: c.provider, configId: c.id, configName: c.name || c.provider })
    }
  }
  return out
}

function bareModelName(key) {
  if (!key) return ''
  const i = key.indexOf('/')
  return i >= 0 ? key.slice(i + 1) : key
}

function ownerConfigId(options, key) {
  return key ? (options.find(o => o.key === key)?.configId || undefined) : undefined
}

function mediaUrl(url) {
  if (!url) return ''
  if (/^https?:\/\//i.test(url) || url.startsWith('/') || url.startsWith('data:')) return url
  return `/${url}`
}

async function readSse(resp, onEvent) {
  const reader = resp.body?.getReader()
  if (!reader) throw new Error('无法读取响应流')
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const chunks = buf.split('\n\n')
    buf = chunks.pop() || ''
    for (const chunk of chunks) {
      let event = 'message'
      const dataLines = []
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
      }
      if (!dataLines.length) continue
      try { onEvent(event, JSON.parse(dataLines.join('\n'))) } catch { /* 忽略残缺帧 */ }
    }
  }
}

export function useStudioAssistant() {
  const route = useRoute()
  const wb = useEpisodeWorkbenchOptional()

  const open = useState('assistant-open', () => readOpen())
  const sending = useState('assistant-sending', () => false)
  const confirming = useState('assistant-confirming', () => false)
  const thread = useState('assistant-thread', () => null)
  const messages = useState('assistant-messages', () => [])
  const assets = useState('assistant-assets', () => [])
  const mentions = useState('assistant-mentions', () => [])
  const draft = useState('assistant-draft', () => '')
  const attachments = useState('assistant-attachments', () => [])
  const snippets = useState('assistant-snippets', () => [])
  const localChatModel = useState('assistant-chat-model', () => {
    try { return localStorage.getItem(MODEL_KEY) || '' } catch { return '' }
  })
  const textConfigs = useState('assistant-text-configs', () => [])
  const imagePreview = useState('assistant-image-preview', () => ({
    open: false, src: '', title: '',
  }))
  const assetDialog = useState('assistant-asset-dialog', () => ({
    open: false,
    step: 'choose' as 'choose' | 'pick-type' | 'pick-target' | 'create-form' | 'update-confirm',
    mode: '' as '' | 'update' | 'create',
    imageUrl: '',
    type: 'scene' as 'character' | 'scene' | 'prop',
    targetId: null as number | null,
    name: '',
    extra: '',
    hintRefs: [] as Array<{ type: string; id: number; name?: string }>,
  }))
  const snippetSave = useState('assistant-snippet-save', () => ({
    open: false, title: '', body: '', scope: 'global' as 'project' | 'global',
  }))
  const snippetEdit = useState('assistant-snippet-edit', () => ({
    open: false, id: 0, title: '', body: '', scope: 'global' as 'project' | 'global',
  }))

  const textModelOptions = computed(() => wb?.textModelOptions?.length
    ? wb.textModelOptions
    : collectModelOptions(textConfigs.value))
  const textModelMultiCfg = computed(() => new Set(textModelOptions.value.map(o => o.configId)).size > 1)
  const chatModel = computed({
    get: () => localChatModel.value || '',
    set: (v) => { localChatModel.value = v || '' },
  })
  function setChatModel(v) {
    chatModel.value = v
  }

  watch(open, (v) => {
    try { localStorage.setItem(OPEN_KEY, v ? '1' : '0') } catch { /* 静默 */ }
  })
  watch(localChatModel, (v) => {
    try { v ? localStorage.setItem(MODEL_KEY, v) : localStorage.removeItem(MODEL_KEY) } catch { /* 静默 */ }
  })

  function assetOption(type, item) {
    if (type === 'scene') {
      const location = item.location || item.name || ''
      const time = item.time || ''
      const name = time ? `${location} · ${time}` : location
      return {
        label: name,
        value: location,
        group: '场景',
        image: mediaUrl(item.image_url || item.imageUrl),
        meta: { type: 'scene', id: item.id, name, category: 'asset', image_url: item.image_url || item.imageUrl },
      }
    }
    const name = item.name || ''
    return {
      label: name,
      value: name,
      group: type === 'prop' ? '道具' : '角色',
      image: mediaUrl(item.image_url || item.imageUrl),
      meta: { type, id: item.id, name, category: 'asset', image_url: item.image_url || item.imageUrl },
    }
  }

  function mentionOptionFromItem(m) {
    return {
      label: m.label,
      value: m.token,
      group: m.group,
      image: m.image_url ? mediaUrl(m.image_url) : '',
      badge: m.badge,
      meta: {
        category: m.category,
        type: m.type,
        id: m.id,
        key: m.key,
        name: m.label,
        image_url: m.image_url,
      },
    }
  }

  function buildLocalMentionOptions() {
    if (wb) {
      const fromWb = [
        ...(wb.chars || []).map(c => assetOption('character', c)),
        ...(wb.scenes || []).map(s => assetOption('scene', s)),
        ...(wb.propItems || []).map(p => assetOption('prop', p)),
      ].filter(o => o.value)
      if (fromWb.length) return fromWb
    }
    return (assets.value || []).map(a => mentionOptionFromItem({
      token: a.type === 'scene' ? String(a.name || '').split(' · ')[0] : a.name,
      label: a.name,
      group: a.group || (a.type === 'scene' ? '场景' : a.type === 'prop' ? '道具' : '角色'),
      category: 'asset',
      type: a.type,
      id: a.id,
      image_url: a.image_url || a.imageUrl,
    })).filter(o => o.value)
  }

  const generatedMentionOptions = computed(() => {
    const out = []
    const seen = new Set()
    for (let mi = messages.value.length - 1; mi >= 0; mi--) {
      const msg = messages.value[mi]
      if (msg.role !== 'assistant') continue
      const arts = msg.content?.artifacts || []
      for (let ai = arts.length - 1; ai >= 0; ai--) {
        const art = normalizeArtifact(arts[ai])
        const tid = artifactTaskId(art)
        if (!tid || !art.url || art.status === 'processing' || art.status === 'failed') continue
        if (seen.has(tid)) continue
        seen.add(tid)
        out.push(mentionOptionFromItem({
          token: `生成图#${tid}`,
          label: `生成图 #${tid}`,
          group: '本次生成',
          category: 'generated',
          type: 'image',
          id: tid,
          image_url: art.url,
        }))
      }
    }
    if (out.length) {
      const latest = out[0]
      out.unshift(mentionOptionFromItem({
        token: '刚才的图',
        label: '刚才的图',
        group: '本次生成',
        category: 'generated',
        type: 'image',
        id: latest.meta.id,
        image_url: latest.meta.image_url,
        badge: '最新',
      }))
    }
    return out
  })

  const mentionOptions = computed(() => {
    const base = mentions.value.length
      ? mentions.value.map(mentionOptionFromItem).filter(o => o.value)
      : buildLocalMentionOptions()
    return [...generatedMentionOptions.value, ...base]
  })

  function collectUiContext() {
    const wbCtx = wb?.assistantUiContext ? toValue(wb.assistantUiContext) : null
    if (wbCtx && typeof wbCtx === 'object') return { ...wbCtx }
    const id = Number(route.params.id)
    if (route.name === 'drama-episode') {
      return {
        route: 'episode',
        drama_id: id || null,
        episode_id: null,
        episode_number: Number(route.params.episodeNumber) || null,
        stage: 'raw',
      }
    }
    if (route.name === 'drama-detail') {
      return { route: 'drama', drama_id: id || null, episode_id: null, stage: 'drama' }
    }
    if (String(route.path).startsWith('/settings')) {
      return { route: 'settings', stage: 'settings' }
    }
    return { route: 'home', stage: 'home' }
  }

  const threadScope = computed(() => {
    const ctx = collectUiContext()
    return `${ctx.drama_id || 0}:${ctx.episode_id || 0}:${ctx.route || ''}`
  })

  const currentDramaId = computed(() => {
    const ctx = collectUiContext()
    return ctx.drama_id && ctx.drama_id > 0 ? ctx.drama_id : null
  })

  const projectSnippets = computed(() => snippets.value.filter(s => s.drama_id))
  const sharedSnippets = computed(() => snippets.value.filter(s => !s.drama_id))

  async function loadSnippets() {
    const ctx = collectUiContext()
    try {
      const data = await assistantAPI.listSnippets(ctx.drama_id || undefined)
      snippets.value = data.items || []
    } catch {
      snippets.value = []
    }
  }

  async function loadThread() {
    const ctx = collectUiContext()
    if (ctx.route === 'episode' && !ctx.episode_id) {
      await loadSnippets()
      return
    }
    try {
      const data = await assistantAPI.thread({
        drama_id: ctx.drama_id || undefined,
        episode_id: ctx.episode_id || undefined,
      })
      thread.value = data.thread
      messages.value = (data.messages || []).map(normalizeMessage)
      assets.value = data.assets || []
      mentions.value = data.mentions || []
      snippets.value = data.snippets || []
      resumeArtifactPolling()
    } catch (err) {
      toast.error(err.message || '加载对话失败')
    }
  }

  function applySnippet(body) {
    const text = String(body || '').trim()
    if (!text) return
    const cur = draft.value
    if (!cur.trim()) draft.value = text
    else draft.value = cur + (cur.endsWith('\n') ? '' : '\n') + text
  }

  function openSaveSnippet(sourceText?: string) {
    const text = String(sourceText ?? draft.value).trim()
    if (!text) {
      toast.warning('没有可保存的内容，请输入或选中文字')
      return
    }
    snippetSave.value = {
      open: true,
      title: text.slice(0, 20).replace(/\s+/g, ' '),
      body: text,
      scope: currentDramaId.value ? 'project' : 'global',
    }
  }

  async function submitSaveSnippet() {
    const text = snippetSave.value.body.trim()
    const title = snippetSave.value.title.trim()
    if (!text) { toast.warning('内容为空'); return }
    if (!title) { toast.warning('请填写标题'); return }
    const dramaId = snippetSave.value.scope === 'project' ? currentDramaId.value : null
    if (snippetSave.value.scope === 'project' && !dramaId) {
      toast.warning('当前无项目上下文，只能保存为全部项目')
      return
    }
    try {
      await assistantAPI.createSnippet({ title, body: text, drama_id: dramaId })
      snippetSave.value.open = false
      toast.success('已加入常用')
      await loadSnippets()
    } catch (err) {
      toast.error(err.message || '保存失败')
    }
  }

  function openEditSnippet(snippet) {
    snippetEdit.value = {
      open: true,
      id: snippet.id,
      title: snippet.title || '',
      body: snippet.body || '',
      scope: snippet.drama_id ? 'project' : 'global',
    }
  }

  async function submitEditSnippet() {
    const form = snippetEdit.value
    const title = form.title.trim()
    const body = form.body.trim()
    if (!title || !body) { toast.warning('标题和内容必填'); return }
    const dramaId = form.scope === 'project' ? currentDramaId.value : null
    if (form.scope === 'project' && !dramaId) {
      toast.warning('当前无项目上下文，只能设为全部项目')
      return
    }
    try {
      await assistantAPI.updateSnippet(form.id, { title, body, drama_id: dramaId })
      snippetEdit.value.open = false
      toast.success('已更新')
      await loadSnippets()
    } catch (err) {
      toast.error(err.message || '更新失败')
    }
  }

  async function removeSnippet(id) {
    try {
      await assistantAPI.deleteSnippet(id)
      snippets.value = snippets.value.filter(s => s.id !== id)
      toast.success('已删除')
    } catch (err) {
      toast.error(err.message || '删除失败')
    }
  }

  async function copyMessageText(text: string) {
    const content = String(text || '').trim()
    if (!content) return
    try {
      await navigator.clipboard.writeText(content)
      toast.success('已复制到剪贴板')
    } catch {
      toast.error('复制失败，请手动选择文本复制')
    }
  }

  function normalizeArtifact(art) {
    if (!art || typeof art !== 'object') return art
    const taskId = art.taskId ?? art.task_id
    return {
      ...art,
      type: art.type || 'image',
      taskId: taskId ? Number(taskId) : undefined,
      status: art.status || (art.url ? 'done' : 'processing'),
    }
  }

  function artifactTaskId(art) {
    const id = art?.taskId ?? art?.task_id
    return id ? Number(id) : 0
  }

  function findMessageIndex(msg) {
    if (!msg) return -1
    let idx = messages.value.findIndex(m => m === msg)
    if (idx >= 0) return idx
    if (msg.id != null) {
      idx = messages.value.findIndex(m => m.id === msg.id)
      if (idx >= 0) return idx
    }
    return -1
  }

  /** patchMessage 会替换数组元素，不能再用旧的 msg 引用；用 taskId 反查 */
  function findMessageIndexForTask(taskId, hintMsg?) {
    const nid = Number(taskId)
    if (hintMsg) {
      const idx = findMessageIndex(hintMsg)
      if (idx >= 0) return idx
    }
    if (!nid) return -1
    return messages.value.findIndex(m =>
      (m.content?.artifacts || []).some(a => artifactTaskId(a) === nid),
    )
  }

  function patchMessage(msg, updater) {
    const idx = findMessageIndex(msg)
    if (idx < 0) return null
    const cur = messages.value[idx]
    const next = typeof updater === 'function' ? updater(cur) : { ...cur, ...updater }
    messages.value.splice(idx, 1, next)
    return next
  }

  function patchMessageAt(index, updater) {
    if (index < 0 || index >= messages.value.length) return null
    const cur = messages.value[index]
    const next = typeof updater === 'function' ? updater(cur) : { ...cur, ...updater }
    messages.value.splice(index, 1, next)
    return next
  }

  function mergeIncomingArtifacts(existing, incoming) {
    const prev = (existing || []).map(normalizeArtifact)
    if (!incoming?.length) return prev
    return incoming.map(normalizeArtifact).map(art => {
      const tid = artifactTaskId(art)
      const old = prev.find(a => artifactTaskId(a) === tid)
      if (old?.url && (old.status === 'done' || old.status === 'completed')) {
        return normalizeArtifact({ ...art, ...old, status: 'done' })
      }
      return art
    })
  }

  function syncArtifactInMessage(_msg, taskId, patch) {
    const nid = Number(taskId)
    const idx = findMessageIndexForTask(nid, _msg)
    if (idx < 0) return null
    let saved = null
    const next = patchMessageAt(idx, (cur) => {
      const list = (cur.content?.artifacts || []).map(a => (
        artifactTaskId(a) === nid
          ? normalizeArtifact({ ...a, ...patch, taskId: nid })
          : normalizeArtifact(a)
      ))
      saved = list
      return { ...cur, content: { ...cur.content, artifacts: list } }
    })
    if (saved && typeof next?.id === 'number') {
      assistantAPI.updateMessage(next.id, { artifacts: saved }).catch(() => {})
    }
    return saved
  }

  function queueArtifactPoll(_msg, art) {
    const id = artifactTaskId(art)
    if (!id || pollingTaskIds.has(id)) return
    if (art.status && art.status !== 'processing' && art.url) return
    pollingTaskIds.add(id)
    pollArtifact(id).finally(() => pollingTaskIds.delete(id))
  }

  function normalizeMessage(m) {
    const content = m.content && typeof m.content === 'object' ? m.content : { text: m.content || '' }
    if (Array.isArray(content.artifacts)) {
      content.artifacts = content.artifacts.map(normalizeArtifact)
    }
    return {
      id: m.id,
      role: m.role,
      content,
      created_at: m.created_at,
      streaming: false,
    }
  }

  function resolveRefs(text) {
    const found = []
    const sorted = [...mentionOptions.value].sort((a, b) => (b.value?.length || 0) - (a.value?.length || 0))
    const used = new Set()
    for (const opt of sorted) {
      const token = opt.value
      if (!token || used.has(token)) continue
      if (!text.includes('@' + token)) continue
      used.add(token)
      const category = opt.meta?.category || 'asset'
      found.push({
        category,
        type: opt.meta?.type || (opt.group === '场景' ? 'scene' : opt.group === '道具' ? 'prop' : 'character'),
        id: opt.meta?.id ?? undefined,
        key: opt.meta?.key,
        name: opt.meta?.name || opt.label || token,
        token,
        image_url: (category === 'asset' || category === 'generated') && opt.meta?.image_url
          ? mediaUrl(opt.meta.image_url)
          : undefined,
      })
    }
    return found
  }

  function assetRefs(refs) {
    return (refs || []).filter(r => {
      const cat = r.category || (['character', 'scene', 'prop'].includes(r.type) ? 'asset' : '')
      return cat === 'asset' && r.id
    })
  }

  function continueEditArtifact(art) {
    const tid = artifactTaskId(art)
    if (!tid || !art.url) return
    const token = `@生成图#${tid} `
    if (draft.value.includes(`@生成图#${tid}`)) return
    draft.value = draft.value.trim() ? `${token}${draft.value}` : token
    open.value = true
  }

  async function send() {
    const text = draft.value.trim()
    if ((!text && !attachments.value.length) || sending.value) return
    sending.value = true
    const ctx = collectUiContext()
    const refs = resolveRefs(text)
    const atts = attachments.value.map(a => ({ url: a.url, name: a.name }))
    draft.value = ''
    attachments.value = []

    messages.value.push({
      id: `tmp-user-${Date.now()}`,
      role: 'user',
      content: { text, refs, attachments: atts },
      created_at: new Date().toISOString(),
    })
    const assistantMsg = {
      id: `tmp-asst-${Date.now()}`,
      role: 'assistant',
      content: { text: '', artifacts: [], proposal: null },
      created_at: new Date().toISOString(),
      streaming: true,
    }
    messages.value.push(assistantMsg)
    let assistantIdx = messages.value.length - 1

    function patchAssistant(updater) {
      return patchMessageAt(assistantIdx, updater)
    }

    try {
      const ep = wb?.episode || {}
      const resp = await fetch('/api/v1/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          drama_id: ctx.drama_id,
          episode_id: ctx.episode_id,
          ui_context: ctx,
          refs,
          attachments: atts,
          model: bareModelName(chatModel.value) || undefined,
          config_id: ownerConfigId(textModelOptions.value, chatModel.value),
          image_model: wb ? bareModelName(wb.imageModel) || undefined : undefined,
          image_config_id: ep.image_config_id || ep.imageConfigId || undefined,
          img2img_config_id: ep.img2img_config_id || ep.img2imgConfigId || undefined,
        }),
      })
      if (!resp.ok) {
        const json = await resp.json().catch(() => ({}))
        throw new Error(json.message || `${resp.status}`)
      }
      await readSse(resp, (event, data) => {
        if (event === 'text-delta' || event === 'text') {
          patchAssistant(cur => ({
            ...cur,
            content: { ...cur.content, text: (cur.content.text || '') + (data.text || '') },
          }))
        } else if (event === 'needs_confirmation') {
          patchAssistant(cur => ({ ...cur, content: { ...cur.content, proposal: data } }))
        } else if (event === 'image-task') {
          const tid = Number(data.task_id)
          if (!tid) return
          const patched = patchAssistant((cur) => {
            const existing = (cur.content?.artifacts || []).map(normalizeArtifact)
            const hit = existing.find(a => artifactTaskId(a) === tid)
            const art = hit || normalizeArtifact({ type: 'image', taskId: tid, status: 'processing' })
            const artifacts = hit ? existing : [...existing, art]
            return { ...cur, content: { ...cur.content, artifacts } }
          })
          const art = (patched?.content?.artifacts || []).find(a => artifactTaskId(a) === tid)
          if (art) queueArtifactPoll(patched, art)
        } else if (event === 'error') {
          throw new Error(data.message || '助手执行失败')
        } else if (event === 'done') {
          const patched = patchAssistant((cur) => ({
            ...cur,
            id: data.message_id,
            streaming: false,
            content: {
              ...cur.content,
              text: data.text || cur.content.text,
              proposal: data.proposal || cur.content.proposal,
              artifacts: data.artifacts?.length
                ? mergeIncomingArtifacts(cur.content?.artifacts, data.artifacts)
                : (cur.content?.artifacts || []).map(normalizeArtifact),
            },
          }))
          if (data.did_write) wb?.refresh?.()
          for (const art of patched?.content?.artifacts || []) {
            queueArtifactPoll(patched, art)
          }
        }
      })
    } catch (err) {
      patchAssistant(cur => ({
        ...cur,
        streaming: false,
        content: { ...cur.content, text: cur.content.text || (`出错：${err.message}`) },
      }))
      toast.error(err.message)
    } finally {
      sending.value = false
      const latest = patchAssistant(cur => ({ ...cur, streaming: false }))
      for (const art of latest?.content?.artifacts || []) {
        queueArtifactPoll(latest, art)
      }
    }
  }

  function resumeArtifactPolling() {
    for (const msg of messages.value) {
      for (const art of msg.content?.artifacts || []) {
        const normalized = normalizeArtifact(art)
        if (artifactTaskId(normalized) && (normalized.status === 'processing' || !normalized.url)) {
          queueArtifactPoll(msg, normalized)
        }
      }
    }
  }

  function taskPreviewUrl(task) {
    if (!task || typeof task !== 'object') return ''
    return mediaUrl(task.local_path || task.localPath || task.result_url || task.resultUrl || '')
  }

  async function pollArtifact(taskId) {
    const id = Number(taskId)
    if (!id) return
    for (let i = 0; i < 120; i++) {
      try {
        const task = await taskAPI.get(id)
        if (!task) {
          await new Promise(r => setTimeout(r, i < 10 ? 2000 : 5000))
          continue
        }
        const status = String(task.status || task.Status || '').toLowerCase()
        if (status === 'completed' || status === 'success' || status === 'done') {
          const url = taskPreviewUrl(task)
          if (url) {
            syncArtifactInMessage(null, id, { status: 'done', url, error: undefined })
            return
          }
        }
        if (status === 'failed' || status === 'error' || status === 'cancelled') {
          syncArtifactInMessage(null, id, {
            status: 'failed',
            error: task.error_msg || task.errorMsg || '生成失败',
          })
          return
        }
      } catch { /* 继续轮询 */ }
      await new Promise(r => setTimeout(r, i < 10 ? 2000 : 5000))
    }
    syncArtifactInMessage(null, id, { status: 'failed', error: '生成超时' })
  }

  async function confirmProposal(msg) {
    if (!thread.value?.id || confirming.value) return
    confirming.value = true
    try {
      const data = await assistantAPI.confirm({
        thread_id: thread.value.id,
        message_id: msg.id,
        model: bareModelName(chatModel.value) || undefined,
        config_id: ownerConfigId(textModelOptions.value, chatModel.value),
      })
      messages.value.push({
        id: data.message_id || Date.now(),
        role: 'assistant',
        content: { text: data.text || '已执行' },
        created_at: new Date().toISOString(),
      })
      msg.content.proposal = null
      wb?.refresh?.()
      toast.success('工序已执行')
    } catch (err) {
      toast.error(err.message)
    } finally {
      confirming.value = false
    }
  }

  function dismissProposal(msg) {
    msg.content.proposal = null
  }

  async function addAttachment(file) {
    if (!file) return
    try {
      const data = await uploadAPI.image(file)
      attachments.value = [...attachments.value, { url: mediaUrl(data.url || `/${data.path}`), name: file.name }]
    } catch (err) {
      toast.error(err.message || '上传失败')
    }
  }

  function removeAttachment(idx) {
    attachments.value = attachments.value.filter((_, i) => i !== idx)
  }

  function openImagePreview(src, title = '生成图') {
    if (!src) return
    imagePreview.value = { open: true, src, title }
  }

  function closeImagePreview() {
    imagePreview.value = { open: false, src: '', title: '' }
  }

  function assetLabel(type, item) {
    if (type === 'scene') {
      const loc = item.location || item.name || ''
      const time = item.time || ''
      return time ? `${loc} · ${time}` : loc
    }
    return item.name || ''
  }

  function assetImageSrc(item) {
    const raw = item?.image_url || item?.imageUrl || item?.local_path || item?.localPath || ''
    return mediaUrl(raw)
  }

  function resolveHintRef(refs, type?: string) {
    const list = assetRefs(refs)
    if (!list.length) return null
    if (type) {
      const matched = list.find(r => r.type === type && r.id)
      if (matched) return matched
    }
    return list.length === 1 ? list[0] : null
  }

  function resolveMessageRefs(msg) {
    if (msg?.content?.refs?.length) return assetRefs(msg.content.refs)
    const list = messages.value
    const idx = list.findIndex(m => m.id === msg?.id)
    if (idx < 0) return []
    for (let i = idx - 1; i >= 0; i--) {
      if (list[i].role === 'user' && list[i].content?.refs?.length) {
        return assetRefs(list[i].content.refs)
      }
    }
    return []
  }

  function listAssetCandidates(type) {
    if (wb) {
      const list = type === 'character' ? (wb.chars || [])
        : type === 'scene' ? (wb.scenes || [])
          : (wb.propItems || [])
      return list.map(item => ({
        id: item.id,
        type,
        name: assetLabel(type, item),
        image_url: assetImageSrc(item),
      }))
    }
    return (assets.value || [])
      .filter(a => a.type === type)
      .map(a => ({ id: a.id, type: a.type, name: a.name || '', image_url: assetImageSrc(a) }))
  }

  function openAssetDialog(imageUrl, hintRefs = []) {
    const refs = assetRefs(Array.isArray(hintRefs) ? hintRefs : [])
    const hint = resolveHintRef(refs)
    const type = hint?.type === 'character' || hint?.type === 'prop' ? hint.type : 'scene'
    assetDialog.value = {
      open: true,
      step: 'choose',
      mode: '',
      imageUrl,
      type,
      targetId: hint?.id ?? null,
      name: hint?.name || '',
      extra: '',
      hintRefs: refs,
    }
  }

  function pickAssetMode(mode: 'update' | 'create') {
    const form = assetDialog.value
    form.mode = mode
    if (mode === 'update') {
      const hint = resolveHintRef(form.hintRefs)
      if (hint?.id) {
        form.type = hint.type === 'character' || hint.type === 'prop' ? hint.type : 'scene'
        form.targetId = hint.id
        form.step = 'update-confirm'
        return
      }
    }
    form.step = 'pick-type'
  }

  function pickAssetType(type: 'character' | 'scene' | 'prop') {
    const form = assetDialog.value
    form.type = type
    const hint = resolveHintRef(form.hintRefs, type)
    form.targetId = hint?.id ?? null
    if (form.mode === 'update') {
      if (form.targetId) {
        form.step = 'update-confirm'
        return
      }
      const candidates = listAssetCandidates(type)
      if (candidates.length === 1) {
        form.targetId = candidates[0].id
        form.step = 'update-confirm'
      } else {
        form.step = 'pick-target'
      }
    } else {
      form.step = 'create-form'
    }
  }

  function pickAssetTarget(id: number) {
    assetDialog.value.targetId = id
    assetDialog.value.step = 'update-confirm'
  }

  function assetDialogBack() {
    const form = assetDialog.value
    if (form.step === 'update-confirm') {
      if (form.mode === 'update') {
        form.step = listAssetCandidates(form.type).length > 1 ? 'pick-target' : 'pick-type'
      }
      return
    }
    if (form.step === 'pick-target' || form.step === 'create-form') {
      form.step = 'pick-type'
      return
    }
    if (form.step === 'pick-type') {
      form.step = 'choose'
      form.mode = ''
    }
  }

  function closeAssetDialog() {
    assetDialog.value.open = false
  }

  function selectedAssetCandidate() {
    const form = assetDialog.value
    return listAssetCandidates(form.type).find(a => a.id === form.targetId) || null
  }

  async function submitAssetDialog() {
    const ctx = collectUiContext()
    if (!ctx.drama_id) { toast.error('请先打开一部剧'); return }
    const form = assetDialog.value
    try {
      if (form.mode === 'update') {
        if (!form.targetId) { toast.warning('请选择要更新的资产'); return }
        const payload = { image_url: form.imageUrl }
        if (form.type === 'character') await characterAPI.update(form.targetId, payload)
        else if (form.type === 'scene') await sceneAPI.update(form.targetId, payload)
        else await propAPI.update(form.targetId, payload)
        toast.success('已更新资产图片')
      } else {
        if (!form.name.trim()) { toast.warning('请填写名称'); return }
        const payload = {
          drama_id: ctx.drama_id,
          episode_id: ctx.episode_id || undefined,
          image_url: form.imageUrl,
        }
        if (form.type === 'character') {
          await characterAPI.create({ ...payload, name: form.name.trim(), appearance: form.extra })
        } else if (form.type === 'scene') {
          await sceneAPI.create({ ...payload, location: form.name.trim(), prompt: form.extra })
        } else {
          await propAPI.create({ ...payload, name: form.name.trim(), description: form.extra })
        }
        toast.success('已创建资产')
      }
      form.open = false
      wb?.refresh?.()
      loadThread()
    } catch (err) {
      toast.error(err.message)
    }
  }

  function toggle() { open.value = !open.value }

  if (import.meta.client && !keybound) {
    keybound = true
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        const tag = (e.target && e.target.tagName) || ''
        if (tag === 'TEXTAREA' || tag === 'INPUT') return
        e.preventDefault()
        open.value = !open.value
      }
    })
  }

  watch(threadScope, () => {
    if (open.value) loadThread()
  })
  watch(open, (v) => {
    if (v) loadThread()
  })

  onMounted(async () => {
    try { textConfigs.value = await aiConfigAPI.list('text') } catch { /* 忽略 */ }
    if (open.value) loadThread()
  })

  return reactive({
    open, toggle, sending, confirming, thread, messages, assets, mentions, snippets, draft, attachments,
    textModelOptions, textModelMultiCfg, chatModel, setChatModel, mentionOptions,
    imagePreview, assetDialog, listAssetCandidates, selectedAssetCandidate,
    snippetSave, snippetEdit, currentDramaId, projectSnippets, sharedSnippets,
    send, confirmProposal, dismissProposal, addAttachment, removeAttachment,
    openImagePreview, closeImagePreview, continueEditArtifact, openAssetDialog, pickAssetMode, pickAssetType,
    pickAssetTarget, assetDialogBack, closeAssetDialog, submitAssetDialog, resolveMessageRefs, loadThread, loadSnippets, mediaUrl,
    applySnippet, openSaveSnippet, submitSaveSnippet, openEditSnippet, submitEditSnippet, removeSnippet,
    copyMessageText,
  })
}
