import { toast } from 'vue-sonner'
import {
  Users, Video, FileText, FolderKanban, Clapperboard, Download, Loader2,
  MapPin, Play, Plus, X, ListTodo, Upload,
} from 'lucide-vue-next'
import { dramaAPI, episodeAPI, storyboardAPI, characterAPI, sceneAPI, propAPI, taskAPI, mergeAPI, aiConfigAPI, uploadAPI } from '~/composables/useApi'
import { readSkillSelectionPayload } from '~/composables/useAgent'
import { useAgent } from '~/composables/useAgent'
import { useAssetImageHistory } from '~/composables/useAssetImageHistory'
import { thumbOf, thumbFallback, posterOf } from '~/composables/useMedia'

export function useEpisodeWorkbench(dramaId: number, episodeNumber: number) {
  const drama = ref(null), episode = ref(null), chars = ref([]), scenes = ref([]), propItems = ref([]), sbs = ref([]), mergeData = ref(null)
  // 工作台面板位置记忆（按剧集隔离）：仅页面刷新(reload)时恢复到上次所在步骤；
  // 从列表/详情页点击进入时始终默认「剧本」面板
  const PANEL_STORE_KEY = `huobao:workbench:panel:${dramaId}:${episodeNumber}`
  const isPageReload = (() => {
    try { return performance.getEntriesByType('navigation')[0]?.type === 'reload' } catch { return false }
  })()
  const storedPanel = (() => {
    if (!isPageReload) return null
    try { return JSON.parse(localStorage.getItem(PANEL_STORE_KEY) || 'null') } catch { return null }
  })()
  // 首个 refresh 时若已恢复面板位置，跳过按内容自动重置 scriptStep
  let panelRestored = !!storedPanel
  const panel = ref(['production', 'export'].includes(storedPanel?.panel) ? storedPanel.panel : 'script')
  const { running: rn, runningType: rt, run: runAgent } = useAgent()

  const localRaw = ref(''), localScript = ref('')
  const rawContent = computed(() => episode.value?.content || '')
  const scriptContent = computed(() => episode.value?.script_content || episode.value?.scriptContent || '')
  const epId = computed(() => episode.value?.id || 0)
  const rawLen = computed(() => localRaw.value.replace(/\s/g, '').length || 0)
  const scriptLen = computed(() => localScript.value.replace(/\s/g, '').length || 0)
  const mergeUrl = computed(() => mergeData.value?.merged_url || mergeData.value?.mergedUrl || null)

  // ===== 拼接导出:镜头选择 + 成片列表 =====
  const exportSelectedIds = ref([]) // 勾选的镜头 id
  const exportMerges = ref([])      // 成片(拼接记录)列表
  let exportSelTouched = false      // 用户手动操作过选择后,不再自动全选

  const exportReadyIds = computed(() => sbs.value.filter(s => hasVid(s)).map(s => s.id))
  const exportSelectedReadyIds = computed(() => exportSelectedIds.value.filter(id => exportReadyIds.value.includes(id)))

  watch(exportReadyIds, (ids) => {
    if (exportSelTouched) {
      exportSelectedIds.value = exportSelectedIds.value.filter(id => ids.includes(id))
    } else {
      exportSelectedIds.value = [...ids]
    }
  })

  function isExportSelected(id) { return exportSelectedIds.value.includes(id) }
  function toggleExportSelect(sb) {
    if (!hasVid(sb)) return
    exportSelTouched = true
    exportSelectedIds.value = isExportSelected(sb.id)
      ? exportSelectedIds.value.filter(x => x !== sb.id)
      : [...exportSelectedIds.value, sb.id]
  }
  function toggleSelectAllExport() {
    exportSelTouched = true
    exportSelectedIds.value = exportSelectedReadyIds.value.length === exportReadyIds.value.length ? [] : [...exportReadyIds.value]
  }

  async function loadExportMerges() {
    if (!epId.value) return
    try { exportMerges.value = await mergeAPI.list(epId.value) || [] } catch { /* 静默 */ }
  }

  const scriptStep = ref(storedPanel ? (storedPanel.scriptStep === 0 ? 0 : 1) : 0)
  const prodTab = ref(['assets', 'storyboard', 'videos'].includes(storedPanel?.prodTab) ? storedPanel.prodTab : 'assets')
  // 面板位置变化即持久化
  watch([panel, scriptStep, prodTab], ([p, s, t]) => {
    try { localStorage.setItem(PANEL_STORE_KEY, JSON.stringify({ panel: p, scriptStep: s, prodTab: t })) } catch { /* 静默 */ }
  })
  const activeExtractTab = ref('characters')
  const prodTabIdx = computed({
    get: () => prodTabDefs.value.findIndex(t => t.id === prodTab.value),
    set: (v) => { prodTab.value = prodTabDefs.value[v]?.id || 'assets' },
  })
  const imageConfigs = ref([])
  const img2imgConfigs = ref([])
  const videoConfigs = ref([])
  const firstLastConfigs = ref([])
  const textConfigs = ref([])
  // 生成时可选模型：空串 = 跟随配置默认（models[0]）；选择持久化到 localStorage，刷新页面后保留
  const MODEL_STORE_KEYS = { chat: 'huobao:model:chat', image: 'huobao:model:image', video: 'huobao:model:video' }
  function readStoredModel(key, legacyKey = '') {
    try { return localStorage.getItem(key) || (legacyKey && localStorage.getItem(legacyKey)) || '' } catch { return '' }
  }
  // 顶栏文本模型：适用于所有 Chat Agent 调用（改写/提取/拆镜/视频提示词/最终提示词），空串 = 跟随配置默认
  const chatModel = ref(readStoredModel(MODEL_STORE_KEYS.chat, 'huobao:model:rewrite'))
  const imageModel = ref(readStoredModel(MODEL_STORE_KEYS.image))
  const videoModel = ref(readStoredModel(MODEL_STORE_KEYS.video))
  function persistModel(modelRef, key) {
    watch(modelRef, v => {
      try { v ? localStorage.setItem(key, v) : localStorage.removeItem(key) } catch {}
    })
  }
  persistModel(chatModel, MODEL_STORE_KEYS.chat)
  persistModel(imageModel, MODEL_STORE_KEYS.image)
  persistModel(videoModel, MODEL_STORE_KEYS.video)
  /** 顶栏文本模型覆盖参数：未选择时为 undefined，后端回退到 Agent/文本配置默认 */
  function chatModelOverride() { return bareModelName(chatModel.value) || undefined }
  function chatConfigId() { return ownerConfigId(textModelOptions.value, chatModel.value) }
  const pendingCharImageIds = ref([])
  const pendingSceneImageIds = ref([])
  const pendingPropImageIds = ref([])
  const pendingVideoIds = ref([])
  const cancellingVideoIds = ref([])
  const cancellingAllVideos = ref(false)
  const failedVideoMessages = ref({})
  /** 避免刷新恢复时对同一任务重复开多条轮询 */
  const videoPollInFlight = new Set()
  // 任务列表面板：顶栏按钮触发的右侧抽屉,按集聚合 sys_task + video_merges
  const genTasks = ref([])
  const genMerges = ref([])
  const taskDrawer = ref(false)
  let genTasksTimer = null

  function openTaskDrawer() {
    taskDrawer.value = true
    loadGenTasks()
  }
  function closeTaskDrawer() {
    taskDrawer.value = false
  }
  // Seedance 2.0 视频生成面板：仅多模态参考（参考图 0-9 + 参考视频 0-3 + 参考音频 0-3 + 可选文本）
  const videoRefVideoUrls = ref([])
  const videoRefAudioUrls = ref([])
  const videoRefImageUrls = ref([])
  const videoDuration = ref(10)
  const uploadingRefMedia = ref(false)
  const imageViewer = ref({ open: false, src: '', title: '' })
  const activeMerge = ref(null) // 成片大预览弹窗中正在播放的拼接记录
  const assetDetail = ref({ open: false, type: '', item: null })
  const assetDetailDraft = ref({ name: '', role: '', type: '', location: '', time: '', appearance: '', styling: '', prompt: '', lighting: '', description: '' })
  const assetHistoryType = computed(() => (assetDetail.value.open ? assetDetail.value.type : ''))
  const assetHistoryItem = computed(() => assetDetail.value.item)
  const {
    history: assetImageHistory,
    previewImageUrl: assetPreviewImageUrl,
    displayImageUrl: assetDetailDisplayUrl,
    loadHistory: loadAssetImageHistory,
    isCurrentImage: isCurrentAssetImage,
    previewHistoryImage: previewAssetHistoryImage,
    setAsMainImage: setAssetAsMainImage,
    removeHistoryImage: removeAssetHistoryImage,
  } = useAssetImageHistory(assetHistoryType, assetHistoryItem)
  // 最终提示词手动编辑：dirty 时才随保存提交，避免无修改保存误清空 Agent 生成的提示词
  const assetPromptDraft = ref('')
  const assetPromptDirty = ref(false)
  const assetEditPrompt = ref('')
  const savingAssetDetail = ref(false)

  function configLabel(config) {
    if (!config) return '未配置'
    const modelName = configModels(config)[0] || ''
    return modelName ? `${config.name} · ${modelName} (${config.provider})` : `${config.name} (${config.provider})`
  }

  function isPendingCharImage(id) {
    return pendingCharImageIds.value.includes(id)
  }

  function openImageViewer(src, title = '') {
    if (!src) return
    imageViewer.value = { open: true, src, title }
  }

  function closeImageViewer() {
    imageViewer.value = { open: false, src: '', title: '' }
  }

  function openAssetDetail(type, item) {
    if (!item) return
    assetDetail.value = { open: true, type, item }
    assetDetailDraft.value = {
      name: item.name || '',
      role: item.role || '',
      type: item.type || '',
      location: item.location || '',
      time: item.time || '',
      appearance: item.appearance || '',
      styling: item.styling || '',
      prompt: item.prompt || (type === 'prop' ? '' : item.description) || '',
      lighting: item.lighting || '',
      description: item.description || '',
    }
    assetPromptDraft.value = item.final_prompt || item.finalPrompt || ''
    assetPromptDirty.value = false
    assetEditPrompt.value = ''
  }

  function closeAssetDetail() {
    assetDetail.value = { open: false, type: '', item: null }
    assetDetailDraft.value = { name: '', role: '', type: '', location: '', time: '', appearance: '', styling: '', prompt: '', lighting: '', description: '' }
    assetPromptDraft.value = ''
    assetPromptDirty.value = false
    assetEditPrompt.value = ''
  }

  // ─── 手动新增资产 ────────────────────────────────────────────
  const ASSET_TYPE_SHORT = { character: '角色', scene: '场景', prop: '道具' }
  const assetImportOpen = ref(false)
  function openAssetImport() { assetImportOpen.value = true }
  async function onAssetImported() { assetImportOpen.value = false; await refresh() }

  const storyboardImportOpen = ref(false)
  async function onStoryboardImported() {
    storyboardImportOpen.value = false
    await refresh()
  }

  const assetCreate = ref({ open: false, type: 'character', saving: false })
  const assetCreateDraft = ref({})
  const assetCreateTypeLabel = computed(() => ASSET_TYPE_SHORT[assetCreate.value.type] || '资产')

  function openAssetCreate(type) {
    assetCreateDraft.value = { name: '', role: '', appearance: '', styling: '', location: '', time: '', prompt: '', lighting: '', type: '', description: '' }
    assetCreate.value = { open: true, type, saving: false }
  }

  async function saveAssetCreate() {
    const d = assetCreateDraft.value
    const type = assetCreate.value.type
    if (assetCreate.value.saving) return
    if (type === 'scene' ? !d.location?.trim() : !d.name?.trim()) {
      toast.warning(type === 'scene' ? '请填写场景地点' : '请填写名称')
      return
    }
    assetCreate.value.saving = true
    try {
      const base = { drama_id: dramaId, episode_id: epId.value }
      if (type === 'character') await characterAPI.create({ ...base, name: d.name, role: d.role, appearance: d.appearance, styling: d.styling })
      else if (type === 'scene') await sceneAPI.create({ ...base, location: d.location, time: d.time, prompt: d.prompt, lighting: d.lighting })
      else await propAPI.create({ ...base, name: d.name, type: d.type, description: d.description })
      toast.success(`已新增${assetCreateTypeLabel.value}`)
      assetCreate.value.open = false
      await refresh()
    } catch (e) {
      toast.error(e.message)
    } finally {
      assetCreate.value.saving = false
    }
  }

  // ─── 从素材库选入（挂链，不新建） ────────────────────────────
  const assetPick = ref({ open: false, type: 'character', loading: false, saving: false, items: [], selectedIds: [] })
  const assetPickTypeLabel = computed(() => ASSET_TYPE_SHORT[assetPick.value.type] || '资产')

  function assetPickSubtitle(item) {
    if (assetPick.value.type === 'character') return item.role || '角色'
    if (assetPick.value.type === 'scene') return [item.time, item.prompt || item.description].filter(Boolean).join(' · ') || '场景'
    return item.type || item.description || '道具'
  }

  async function openAssetPick(type) {
    if (!epId.value) {
      toast.warning('剧集尚未加载完成')
      return
    }
    assetPick.value = { open: true, type, loading: true, saving: false, items: [], selectedIds: [] }
    try {
      const items = await episodeAPI.availableAssets(epId.value, type)
      assetPick.value.items = Array.isArray(items) ? items : []
    } catch (e) {
      toast.error(e.message || '加载素材库失败')
      assetPick.value.open = false
    } finally {
      assetPick.value.loading = false
    }
  }

  function toggleAssetPick(id) {
    const ids = assetPick.value.selectedIds
    assetPick.value.selectedIds = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]
  }

  async function confirmAssetPick() {
    const { type, selectedIds, saving } = assetPick.value
    if (!selectedIds.length || saving || !epId.value) return
    assetPick.value.saving = true
    try {
      const payload =
        type === 'character' ? { character_ids: selectedIds }
          : type === 'scene' ? { scene_ids: selectedIds }
            : { prop_ids: selectedIds }
      await episodeAPI.linkAssets(epId.value, payload)
      toast.success(`已选入 ${selectedIds.length} 个${assetPickTypeLabel.value}`)
      assetPick.value.open = false
      await refresh()
    } catch (e) {
      toast.error(e.message || '选入失败')
    } finally {
      assetPick.value.saving = false
    }
  }

  // ─── 从本集移除资产（断链）/ 从共享库永久删除 ──────────────────────
  const assetDelete = ref({
    open: false,
    mode: 'single',
    type: '',
    item: null,
    count: 0,
    loading: false,
    /** 'unlink' | 'library' — 当前进行中的操作，用于双按钮 loading 态 */
    action: '',
  })
  const assetDeleteTypeLabel = computed(() => ASSET_TYPE_SHORT[assetDelete.value.type] || '资产')
  const assetDeleteName = computed(() => assetDelete.value.item?.name || assetDelete.value.item?.location || '')
  const assetDeleteTitle = computed(() =>
    assetDelete.value.mode === 'batch' ? '删除资产' : `删除${assetDeleteTypeLabel.value}`,
  )
  const assetDeleteMessage = computed(() => {
    const subject = assetDelete.value.mode === 'batch'
      ? `这 ${assetDelete.value.count} 个资产`
      : `${assetDeleteTypeLabel.value}「${assetDeleteName.value}」`
    return `可将${subject}从本集移除（其他集与项目素材库仍保留），或从共享库永久删除（本剧所有集一并移除，不可恢复）。`
  })
  const assetDeleteLibraryLoading = computed(() =>
    assetDelete.value.loading && assetDelete.value.action === 'library',
  )

  const assetSelectMode = ref(false)
  const selectedAssetKeys = ref([])
  function assetSelectKey(type, id) { return `${type}:${id}` }
  function isAssetSelected(type, id) { return selectedAssetKeys.value.includes(assetSelectKey(type, id)) }
  function allAssetSelectKeys() {
    return [
      ...visualChars.value.map(c => assetSelectKey('character', c.id)),
      ...scenes.value.map(s => assetSelectKey('scene', s.id)),
      ...propItems.value.map(p => assetSelectKey('prop', p.id)),
    ]
  }
  const selectedAssetCount = computed(() => selectedAssetKeys.value.length)
  const allAssetsSelected = computed(() => {
    const all = allAssetSelectKeys()
    return all.length > 0 && selectedAssetKeys.value.length === all.length
  })

  function enterAssetSelectMode() {
    if (!assetTotalCount.value) return
    assetSelectMode.value = true
    selectedAssetKeys.value = []
  }
  function exitAssetSelectMode() {
    assetSelectMode.value = false
    selectedAssetKeys.value = []
  }
  function toggleAssetSelect(type, id) {
    const key = assetSelectKey(type, id)
    selectedAssetKeys.value = isAssetSelected(type, id)
      ? selectedAssetKeys.value.filter(k => k !== key)
      : [...selectedAssetKeys.value, key]
  }
  function toggleSelectAllAssets() {
    selectedAssetKeys.value = allAssetsSelected.value ? [] : allAssetSelectKeys()
  }
  function onAssetCardClick(type, item) {
    if (assetSelectMode.value) toggleAssetSelect(type, item.id)
    else openAssetDetail(type, item)
  }
  function selectedAssetsPayload() {
    const character_ids = []
    const scene_ids = []
    const prop_ids = []
    for (const key of selectedAssetKeys.value) {
      const [kind, idStr] = key.split(':')
      const id = Number(idStr)
      if (!Number.isInteger(id) || id <= 0) continue
      if (kind === 'character') character_ids.push(id)
      else if (kind === 'scene') scene_ids.push(id)
      else if (kind === 'prop') prop_ids.push(id)
    }
    return { character_ids, scene_ids, prop_ids }
  }

  function askDeleteAsset(type, item) {
    assetDelete.value = { open: true, mode: 'single', type, item, count: 0, loading: false, action: '' }
  }

  const duplicatingAsset = ref(false)

  async function duplicateAsset(type, item) {
    if (!item?.id || duplicatingAsset.value || !epId.value) return
    duplicatingAsset.value = true
    try {
      const payload = { episode_id: epId.value }
      let created
      if (type === 'character') created = await characterAPI.duplicate(item.id, payload)
      else if (type === 'scene') created = await sceneAPI.duplicate(item.id, payload)
      else created = await propAPI.duplicate(item.id, payload)
      toast.success(`已复制${assetTypeLabel(type)}`)
      await refresh()
      const list = type === 'character' ? chars.value : type === 'scene' ? scenes.value : propItems.value
      const fresh = list.find(x => x.id === created?.id) || created
      if (fresh?.id) openAssetDetail(type, fresh)
    } catch (e) {
      toast.error(e.message || '复制失败')
    } finally {
      duplicatingAsset.value = false
    }
  }

  function askBatchDeleteAssets() {
    if (!selectedAssetCount.value || assetDelete.value.loading) return
    assetDelete.value = {
      open: true,
      mode: 'batch',
      type: '',
      item: null,
      count: selectedAssetCount.value,
      loading: false,
      action: '',
    }
  }

  async function hardDeleteAssetEntity(type, id) {
    if (type === 'character') await characterAPI.del(id)
    else if (type === 'scene') await sceneAPI.del(id)
    else await propAPI.del(id)
  }

  async function confirmDeleteAsset() {
    if (assetDelete.value.mode === 'batch') {
      await confirmBatchDeleteAssets()
      return
    }
    const { type, item } = assetDelete.value
    if (!item || assetDelete.value.loading || !epId.value) return
    assetDelete.value.loading = true
    assetDelete.value.action = 'unlink'
    try {
      if (type === 'character') await episodeAPI.unlinkCharacter(epId.value, item.id)
      else if (type === 'scene') await episodeAPI.unlinkScene(epId.value, item.id)
      else await episodeAPI.unlinkProp(epId.value, item.id)
      toast.success(`已从本集移除${assetDeleteTypeLabel.value}`)
      assetDelete.value.open = false
      if (assetDetail.value.open && assetDetail.value.type === type && assetDetail.value.item?.id === item.id) closeAssetDetail()
      await refresh()
    } catch (e) {
      toast.error(e.message)
    } finally {
      assetDelete.value.loading = false
      assetDelete.value.action = ''
    }
  }

  async function confirmDeleteAssetFromLibrary() {
    if (assetDelete.value.mode === 'batch') {
      await confirmBatchDeleteAssetsFromLibrary()
      return
    }
    const { type, item } = assetDelete.value
    if (!item || assetDelete.value.loading) return
    assetDelete.value.loading = true
    assetDelete.value.action = 'library'
    try {
      await hardDeleteAssetEntity(type, item.id)
      toast.success(`已从共享库删除${assetDeleteTypeLabel.value}`)
      assetDelete.value.open = false
      if (assetDetail.value.open && assetDetail.value.type === type && assetDetail.value.item?.id === item.id) closeAssetDetail()
      await refresh()
    } catch (e) {
      toast.error(e.message || '删除失败')
    } finally {
      assetDelete.value.loading = false
      assetDelete.value.action = ''
    }
  }

  async function confirmBatchDeleteAssets() {
    if (assetDelete.value.loading || !epId.value) return
    const payload = selectedAssetsPayload()
    if (!payload.character_ids.length && !payload.scene_ids.length && !payload.prop_ids.length) return
    const count = assetDelete.value.count
    assetDelete.value.loading = true
    assetDelete.value.action = 'unlink'
    try {
      await episodeAPI.unlinkAssets(epId.value, payload)
      toast.success(`已从本集移除 ${count} 个资产`)
      assetDelete.value.open = false
      exitAssetSelectMode()
      if (assetDetail.value.open) closeAssetDetail()
      await refresh()
    } catch (e) {
      toast.error(e.message)
    } finally {
      assetDelete.value.loading = false
      assetDelete.value.action = ''
    }
  }

  async function confirmBatchDeleteAssetsFromLibrary() {
    if (assetDelete.value.loading) return
    const payload = selectedAssetsPayload()
    const jobs = [
      ...payload.character_ids.map(id => ({ type: 'character', id })),
      ...payload.scene_ids.map(id => ({ type: 'scene', id })),
      ...payload.prop_ids.map(id => ({ type: 'prop', id })),
    ]
    if (!jobs.length) return
    const count = assetDelete.value.count
    assetDelete.value.loading = true
    assetDelete.value.action = 'library'
    try {
      for (const job of jobs) await hardDeleteAssetEntity(job.type, job.id)
      toast.success(`已从共享库删除 ${count} 个资产`)
      assetDelete.value.open = false
      exitAssetSelectMode()
      if (assetDetail.value.open) closeAssetDetail()
      await refresh()
    } catch (e) {
      toast.error(e.message || '删除失败')
    } finally {
      assetDelete.value.loading = false
      assetDelete.value.action = ''
    }
  }

  // ─── 手工新建 / 插入分镜 ───
  const creatingSb = ref(false)

  async function addStoryboard(opts = {}) {
    if (!epId.value || creatingSb.value) return
    creatingSb.value = true
    try {
      const payload = {
        episode_id: epId.value,
        duration: 10,
      }
      if (opts.afterId) payload.after_storyboard_id = opts.afterId
      if (opts.beforeId) payload.before_storyboard_id = opts.beforeId
      const created = await storyboardAPI.create(payload)
      await refresh()
      const newId = created?.id
      if (newId) {
        selectedSb.value = sbs.value.find(sb => sb.id === newId) || selectedSb.value
      }
      toast.success(opts.afterId || opts.beforeId ? '已插入分镜' : '已新建分镜')
    } catch (e) {
      toast.error(e.message || '新建分镜失败')
    } finally {
      creatingSb.value = false
    }
  }

  // ─── 删除分镜（连带清理关联 sys_task，由后端 DELETE 完成）───
  const sbDelete = ref({ open: false, item: null, index: 0, loading: false })

  function askDeleteStoryboard(sb, index) {
    if (!sb?.id || sbSelectMode.value) return
    sbDelete.value = { open: true, item: sb, index: Number(index) || 0, loading: false }
  }

  async function confirmDeleteStoryboard() {
    const sb = sbDelete.value.item
    if (!sb?.id || sbDelete.value.loading) return
    sbDelete.value.loading = true
    try {
      const idx = sbs.value.findIndex(s => s.id === sb.id)
      const next = idx >= 0 ? (sbs.value[idx + 1] || sbs.value[idx - 1] || null) : null
      await storyboardAPI.del(sb.id)
      pendingVideoIds.value = pendingVideoIds.value.filter(id => id !== sb.id)
      videoPromptGeneratingIds.value = videoPromptGeneratingIds.value.filter(id => id !== sb.id)
      selectedSbIds.value = selectedSbIds.value.filter(id => id !== sb.id)
      if (failedVideoMessages.value[sb.id]) {
        const nextFailed = { ...failedVideoMessages.value }
        delete nextFailed[sb.id]
        failedVideoMessages.value = nextFailed
      }
      selectedSb.value = next && next.id !== sb.id ? next : null
      sbDelete.value.open = false
      toast.success('已删除分镜')
      await refresh()
    } catch (e) {
      toast.error(e.message || '删除失败')
    } finally {
      sbDelete.value.loading = false
    }
  }

  function onAssetPromptInput(event) {
    assetPromptDraft.value = event.target.value
    assetPromptDirty.value = true
  }

  const assetFinalPrompt = computed(() => {
    const item = assetDetail.value?.item
    return item?.final_prompt || item?.finalPrompt || ''
  })

  /** 把生成好的最终提示词同步到列表项与弹窗项 */
  function applyFinalPrompt(type, id, fp) {
    const patch = { final_prompt: fp, finalPrompt: fp }
    const list = type === 'character' ? chars.value : type === 'scene' ? scenes.value : propItems.value
    const target = list.find(x => x.id === id)
    if (target) Object.assign(target, patch)
    if (assetDetail.value.open && assetDetail.value.type === type && assetDetail.value.item?.id === id) {
      Object.assign(assetDetail.value.item, patch)
    }
  }

  const generatingPromptKeys = ref([])

  function isGeneratingPrompt(type, id) {
    return generatingPromptKeys.value.includes(`${type}:${id}`)
  }

  /** 该资产图片是否在外层「生成」流程中（含提示词阶段与生图阶段） */
  function isAssetImagePending(type, id) {
    return type === 'character' ? isPendingCharImage(id) : type === 'scene' ? isPendingSceneImage(id) : isPendingPropImage(id)
  }

  /**
   * 生成最终提示词（弹窗按钮与外层两段式生图共用同一 key 状态，避免重复触发）
   * force=true 时忽略已有提示词强制重新生成
   * 返回最终提示词；生成失败由接口抛错，Agent 返回空时返回 ''
   */
  async function ensureAssetPrompt(type, id, force = false) {
    const key = `${type}:${id}`
    if (generatingPromptKeys.value.includes(key)) return ''
    generatingPromptKeys.value.push(key)
    try {
      const skillSel = readSkillSelectionPayload('prompt_generator')
      const res = type === 'character'
        ? await characterAPI.generatePrompt(id, epId.value, force, chatModelOverride(), chatConfigId(), skillSel)
        : type === 'scene'
          ? await sceneAPI.generatePrompt(id, epId.value, force, chatModelOverride(), chatConfigId(), skillSel)
          : await propAPI.generatePrompt(id, epId.value, force, chatModelOverride(), chatConfigId(), skillSel)
      const fp = res?.final_prompt || res?.finalPrompt || ''
      if (fp) applyFinalPrompt(type, id, fp)
      return fp
    } finally {
      generatingPromptKeys.value = generatingPromptKeys.value.filter(k => k !== key)
    }
  }

  function collectAssetInfoPayload() {
    const detail = assetDetail.value
    if (!detail?.open || !detail.item?.id) return null
    const item = detail.item
    const draft = assetDetailDraft.value
    const payload = {}
    if (detail.type === 'character') {
      if ((draft.name || '').trim() !== (item.name || '')) payload.name = (draft.name || '').trim()
      if ((draft.role || '') !== (item.role || '')) payload.role = draft.role || ''
      if (draft.appearance !== (item.appearance || '')) payload.appearance = draft.appearance
      if (draft.styling !== (item.styling || '')) payload.styling = draft.styling
    } else if (detail.type === 'scene') {
      if ((draft.location || '').trim() !== (item.location || '')) payload.location = (draft.location || '').trim()
      if ((draft.time || '') !== (item.time || '')) payload.time = draft.time || ''
      if (draft.prompt !== (item.prompt || '')) payload.prompt = draft.prompt
      if (draft.lighting !== (item.lighting || '')) payload.lighting = draft.lighting
    } else {
      if ((draft.name || '').trim() !== (item.name || '')) payload.name = (draft.name || '').trim()
      if ((draft.type || '') !== (item.type || '')) payload.type = draft.type || ''
      if (draft.description !== (item.description || '')) payload.description = draft.description
    }
    return { detail, item, payload, infoChanged: Object.keys(payload).length > 0 }
  }

  function applyAssetInfoLocally(detail, item, infoPatch, promptValue) {
    Object.assign(item, infoPatch, { final_prompt: promptValue, finalPrompt: promptValue })
    const list = detail.type === 'character' ? chars.value : detail.type === 'scene' ? scenes.value : propItems.value
    const target = list.find(x => x.id === item.id)
    if (target) Object.assign(target, infoPatch, { final_prompt: promptValue, finalPrompt: promptValue })
  }

  /** 把弹窗里未保存的样貌/场景描述/外貌写回后端；信息变更时清空旧最终提示词 */
  async function persistAssetInfoIfDirty() {
    const collected = collectAssetInfoPayload()
    if (!collected) return false
    const { detail, item, payload, infoChanged } = collected
    const draft = assetDetailDraft.value
    if (detail.type === 'scene' ? !draft.location?.trim() : !draft.name?.trim()) {
      toast.warning(detail.type === 'scene' ? '请填写场景地点' : '请填写名称')
      return false
    }
    if (!infoChanged) return true
    payload.final_prompt = ''
    try {
      if (detail.type === 'character') await characterAPI.update(item.id, payload)
      else if (detail.type === 'scene') await sceneAPI.update(item.id, payload)
      else await propAPI.update(item.id, payload)
      applyAssetInfoLocally(detail, item, payload, null)
      assetPromptDraft.value = ''
      assetPromptDirty.value = false
      return true
    } catch (e) {
      toast.error(e.message || '保存修改失败')
      return false
    }
  }

  /** 弹窗内生成最终提示词（不生图）；先落库当前描述，再强制重新生成 */
  async function genAssetFinalPrompt() {
    const detail = assetDetail.value
    if (!detail.open || !detail.item?.id) return
    const hadPrompt = !!(assetFinalPrompt.value || assetPromptDraft.value)
    if (!(await persistAssetInfoIfDirty())) return
    try {
      const fp = await ensureAssetPrompt(detail.type, detail.item.id, true)
      if (!fp) throw new Error('最终提示词生成失败，请重试')
      assetPromptDraft.value = fp
      assetPromptDirty.value = false
      toast.success(hadPrompt ? '最终提示词已重新生成' : '最终提示词已生成')
    } catch (e) {
      toast.error(e.message || '最终提示词生成失败')
    }
  }

  async function copyAssetFinalPrompt() {
    const text = assetPromptDraft.value || assetFinalPrompt.value
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      toast.success('最终提示词已复制')
    } catch {
      toast.error('复制失败，请手动选择文本复制')
    }
  }

  async function saveAssetDetail() {
    const collected = collectAssetInfoPayload()
    if (!collected) return
    const { detail, item, payload, infoChanged } = collected
    const draft = assetDetailDraft.value
    if (detail.type === 'scene' ? !draft.location?.trim() : !draft.name?.trim()) {
      toast.warning(detail.type === 'scene' ? '请填写场景地点' : '请填写名称')
      return
    }
    // 手动编辑过最终提示词才提交；信息字段变更时清空旧最终提示词，下次生成会按新描述重写
    if (assetPromptDirty.value) payload.final_prompt = assetPromptDraft.value.trim() || ''
    else if (infoChanged) payload.final_prompt = ''
    if (!infoChanged && !assetPromptDirty.value) {
      toast.info('没有需要保存的修改')
      return
    }
    savingAssetDetail.value = true
    try {
      if (detail.type === 'character') await characterAPI.update(item.id, payload)
      else if (detail.type === 'scene') await sceneAPI.update(item.id, payload)
      else await propAPI.update(item.id, payload)
      const { final_prompt, ...infoPatch } = payload
      const promptValue = assetPromptDirty.value ? (payload.final_prompt || null) : (infoChanged ? null : (item.final_prompt || item.finalPrompt || null))
      applyAssetInfoLocally(detail, item, infoPatch, promptValue)
      if (assetPromptDirty.value) assetPromptDraft.value = payload.final_prompt || ''
      else if (infoChanged) assetPromptDraft.value = ''
      assetPromptDirty.value = false
      toast.success('修改已保存')
    } catch (e) {
      toast.error(e.message || '保存失败')
    } finally {
      savingAssetDetail.value = false
    }
  }

  function assetImageSrc(item) {
    const raw = item?.image_url || item?.imageUrl || ''
    if (!raw) return ''
    if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) return raw
    return `/${raw}`
  }

  function assetDownloadName(type, item) {
    const src = assetImageSrc(item)
    if (!src) return ''
    const ext = src.match(/\.(png|jpe?g|webp|gif)(\?|$)/i)?.[1]?.toLowerCase() || 'png'
    const base = (type === 'scene' ? item?.location : item?.name) || 'asset'
    const safe = String(base).replace(/[\\/:*?"<>|]/g, '_').trim() || 'asset'
    const prefix = { character: '角色', scene: '场景', prop: '道具' }[type] || '资产'
    return `${prefix}-${safe}.${ext}`
  }

  function assetDetailTitle(detail) {
    if (!detail?.item) return ''
    if (detail.type === 'character') return detail.item.name || '未命名角色'
    if (detail.type === 'prop') return detail.item.name || '未命名道具'
    return detail.item.location || '未命名场景'
  }

  function assetTypeLabel(type) {
    return { character: '角色资产', scene: '场景资产', prop: '道具资产' }[type] || '资产'
  }

  function characterAppearanceValue(char) {
    return char?.appearance || '样貌待补充'
  }

  function characterStylingValue(char) {
    return char?.styling || '妆造待补充'
  }

  function characterVisualSummary(char) {
    return `样貌：${characterAppearanceValue(char)} · 妆造：${characterStylingValue(char)}`
  }

  function sceneDescriptionValue(scene) {
    return scene?.prompt || scene?.description || '场景描述待补充'
  }

  function sceneLightingValue(scene) {
    return scene?.lighting || '场景光影待补充'
  }

  function handleImageViewerKeydown(event) {
    if (event.key !== 'Escape') return
    if (imageViewer.value.open) closeImageViewer()
    else if (assetDetail.value.open) closeAssetDetail()
    else if (taskDrawer.value) closeTaskDrawer()
  }

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleImageViewerKeydown)
    stopGenTasksPolling()
  })

  function isPendingSceneImage(id) {
    return pendingSceneImageIds.value.includes(id)
  }

  function isPendingVideo(id) {
    return pendingVideoIds.value.includes(id)
  }

  function videoFailMessage(id) {
    return failedVideoMessages.value[id] || ''
  }

  function videoTaskState(sb) {
    // 重新生成时旧视频仍在，必须优先显示 pending，否则刷新后/进行中会误显示「已完成」
    if (isPendingVideo(sb?.id)) return 'pending'
    if (hasVid(sb)) return 'done'
    if (videoFailMessage(sb?.id)) return 'failed'
    return 'ready'
  }

  function videoTaskStatusLabel(sb) {
    const state = videoTaskState(sb)
    if (state === 'pending') return hasVid(sb) ? '重新生成中' : '生成中'
    if (state === 'done') return '已完成'
    if (state === 'failed') return '失败'
    return '待生成'
  }

  function videoTaskActionLabel(sb) {
    const state = videoTaskState(sb)
    if (state === 'pending') return '生成中…'
    if (state === 'done') return '重新参考生成'
    return '参考生成'
  }

  const videoTaskRows = computed(() => sbs.value.map((sb, index) => {
    const duration = Number(sb.duration || 5)
    const referenceCount = getShotReferenceImages(sb).length
    const sceneName = getSceneName(sb)
    return {
      id: sb.id,
      index,
      storyboard: sb,
      title: sb.description || `镜头 #${String(index + 1).padStart(2, '0')}`,
      meta: sceneName || `${referenceCount} 个参考素材`,
      duration: Number.isFinite(duration) ? duration : 5,
      referenceCount,
      state: videoTaskState(sb),
      error: videoFailMessage(sb.id),
    }
  }))
  const videoTaskDoneCount = computed(() => videoTaskRows.value.filter(task => task.state === 'done').length)
  const videoTaskFailedCount = computed(() => videoTaskRows.value.filter(task => task.state === 'failed').length)

  function isNarratorCharacter(char) {
    const text = `${char?.name || ''} ${char?.role || ''}`.toLowerCase()
    return text.includes('旁白') || text.includes('narrator') || text.includes('画外音')
  }

  const visualChars = computed(() => chars.value.filter(c => !isNarratorCharacter(c)))
  const lockedImageConfigId = computed(() => episode.value?.image_config_id || episode.value?.imageConfigId || null)
  const lockedVideoConfigId = computed(() => episode.value?.video_config_id || episode.value?.videoConfigId || null)
  const lockedImg2imgConfigId = computed(() => episode.value?.img2img_config_id || episode.value?.img2imgConfigId || null)
  const lockedImageConfigLabel = computed(() => configLabel(imageConfigs.value.find(c => c.id === lockedImageConfigId.value)))
  const lockedVideoConfigLabel = computed(() => configLabel(videoConfigs.value.find(c => c.id === lockedVideoConfigId.value)))
  const lockedImg2imgConfigLabel = computed(() => configLabel(img2imgConfigs.value.find(c => c.id === lockedImg2imgConfigId.value)))
  const lockedFirstLastConfigId = computed(() => episode.value?.first_last_config_id || episode.value?.firstLastConfigId || null)
  const lockedFirstLastConfigLabel = computed(() => {
    const locked = firstLastConfigs.value.find(c => c.id === lockedFirstLastConfigId.value)
    if (locked) return configLabel(locked)
    const active = [...firstLastConfigs.value].filter(c => c.is_active).sort((a, b) => (b.priority || 0) - (a.priority || 0))[0]
    return active ? configLabel(active) : ''
  })
  const hasFirstLastService = computed(() => {
    if (lockedFirstLastConfigId.value) return true
    return firstLastConfigs.value.some(c => c.is_active)
  })
  // 画面比例在创建项目时固定，视频生成统一使用
  const dramaAspectRatio = computed(() => drama.value?.aspect_ratio || drama.value?.aspectRatio || '16:9')

  // 生成可选模型列表：配置中的模型数组（首位为配置默认）；API 可能返回数组或 JSON 字符串
  function configModels(cfg) {
    const raw = cfg?.model
    if (!raw) return []
    if (Array.isArray(raw)) return raw.filter(Boolean)
    try { const m = JSON.parse(raw); return Array.isArray(m) ? m.filter(Boolean) : [m].filter(Boolean) } catch { return [raw].filter(Boolean) }
  }
  // 汇总该类型全部启用配置的模型（按 厂商+模型 去重，按优先级排序），选中模型时连同所属配置一起调用
  // 选中值使用 'provider/model' 复合键：同名模型可能来自不同厂商（如中转站与官方），必须区分
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
  // 复合键 → 裸模型名（后端适配器按厂商校验模型名，不能带 provider 前缀）
  function bareModelName(key) {
    if (!key) return ''
    const i = key.indexOf('/')
    return i >= 0 ? key.slice(i + 1) : key
  }
  function ownerConfigId(options, key) {
    return key ? (options.find(o => o.key === key)?.configId || undefined) : undefined
  }
  function hasMultiConfigs(options) {
    return new Set(options.map(o => o.configId)).size > 1
  }
  const textModelOptions = computed(() => collectModelOptions(textConfigs.value))
  const imageModelOptions = computed(() => collectModelOptions(imageConfigs.value))
  const videoModelOptions = computed(() => collectModelOptions(videoConfigs.value))

  /** 顶栏选中时展示该项；否则展示「默认 · 本集锁定」 */
  function effectiveConfigLabel(modelKey, options, lockedLabel) {
    if (modelKey) {
      const opt = options.find(o => o.key === modelKey)
      if (opt) {
        return opt.configName
          ? `${opt.configName} · ${opt.model} (${opt.provider})`
          : `${opt.model} (${opt.provider})`
      }
    }
    return lockedLabel ? `默认 · ${lockedLabel}` : '未配置'
  }
  const effectiveImageConfigLabel = computed(() =>
    effectiveConfigLabel(imageModel.value, imageModelOptions.value, lockedImageConfigLabel.value === '未配置' ? '' : lockedImageConfigLabel.value))
  const effectiveVideoConfigLabel = computed(() =>
    effectiveConfigLabel(videoModel.value, videoModelOptions.value, lockedVideoConfigLabel.value === '未配置' ? '' : lockedVideoConfigLabel.value))

  // 配置变化后校验持久化的模型是否仍存在（配置被删/模型被移除时回退默认，避免把失效模型传给后端）
  function pruneStaleModel(modelRef, optionsRef) {
    watch(optionsRef, opts => {
      if (!modelRef.value || !opts.length) return
      if (opts.some(o => o.key === modelRef.value)) return
      // 旧版本地存储只有裸模型名：能对上则升级为复合键，对不上回退默认
      const legacy = opts.filter(o => o.model === modelRef.value)
      modelRef.value = legacy.length ? legacy[0].key : ''
    }, { immediate: true })
  }
  pruneStaleModel(chatModel, textModelOptions)
  pruneStaleModel(imageModel, imageModelOptions)
  pruneStaleModel(videoModel, videoModelOptions)
  const textModelMultiCfg = computed(() => hasMultiConfigs(textModelOptions.value))
  const imageModelMultiCfg = computed(() => hasMultiConfigs(imageModelOptions.value))
  const videoModelMultiCfg = computed(() => hasMultiConfigs(videoModelOptions.value))

  // Production step helpers
  // ========== 任务列表面板 ==========
  async function loadGenTasks() {
    if (!epId.value) return
    try {
      const data = await taskAPI.listByEpisode(epId.value)
      genTasks.value = data?.tasks || []
      genMerges.value = data?.merges || []
      syncPendingVideosFromGenTasks()
    } catch { /* 静默失败,不打断其他刷新 */ }
  }

  /** 从服务端 processing 视频任务恢复 pending，并续上轮询（刷新后不丢状态） */
  function syncPendingVideosFromGenTasks() {
    const processing = genTasks.value.filter((t) => {
      const type = t.type || t.Type
      const status = t.status || t.Status
      const sbId = t.storyboard_id ?? t.storyboardId
      return type === 'video' && (status === 'processing' || status === 'pending') && sbId
    })

    const fromServer = processing.map((t) => Number(t.storyboard_id ?? t.storyboardId)).filter(Boolean)
    const stillLocal = pendingVideoIds.value.filter((id) => {
      const tasks = genTasks.value.filter((t) =>
        (t.type === 'video') && Number(t.storyboard_id ?? t.storyboardId) === Number(id),
      )
      if (!tasks.length) return true
      const latest = tasks[0]
      const st = latest.status || latest.Status
      return st === 'processing' || st === 'pending'
    })
    pendingVideoIds.value = [...new Set([...stillLocal, ...fromServer])]

    for (const t of processing) {
      const sbId = Number(t.storyboard_id ?? t.storyboardId)
      const taskId = t.id
      if (sbId && taskId) pollVideoGeneration(taskId, sbId)
    }
  }

  function stopGenTasksPolling() {
    if (genTasksTimer) { clearInterval(genTasksTimer); genTasksTimer = null }
  }

  const genTaskActiveCount = computed(() =>
    genTasks.value.filter(t => t.status === 'processing').length +
    genMerges.value.filter(m => m.status === 'processing' || m.status === 'pending').length
  )
  const genTaskDoneCount = computed(() =>
    genTasks.value.filter(t => t.status === 'completed').length +
    genMerges.value.filter(m => m.status === 'completed').length
  )
  const genTaskFailedCount = computed(() =>
    genTasks.value.filter(t => t.status === 'failed').length +
    genMerges.value.filter(m => m.status === 'failed').length
  )

  function genTaskTargetLabel(t) {
    const sbId = t.storyboard_id ?? t.storyboardId
    if (sbId) {
      const idx = sbs.value.findIndex((x) => x.id === sbId)
      const n = idx >= 0 ? idx + 1 : sbId
      return `分镜 #${String(n).padStart(2, '0')}`
    }
    const characterId = t.character_id ?? t.characterId
    if (characterId) {
      const c = chars.value.find(x => x.id === characterId)
      return `角色 · ${c?.name || characterId}`
    }
    const sceneId = t.scene_id ?? t.sceneId
    if (sceneId) {
      const s = scenes.value.find(x => x.id === sceneId)
      return `场景 · ${s?.location || sceneId}`
    }
    const propId = t.prop_id ?? t.propId
    if (propId) {
      const p = propItems.value.find(x => x.id === propId)
      return `道具 · ${p?.name || propId}`
    }
    return '通用'
  }

  // 统一行结构：image / video / merge 三类合并按时间倒序
  const genTaskRows = computed(() => {
    const taskRows = genTasks.value.map(t => ({
      key: `task-${t.id}`,
      kind: t.type, // image | video
      id: t.id,
      targetLabel: genTaskTargetLabel(t),
      provider: t.provider || '',
      model: t.model || '',
      status: t.status || 'processing',
      errorMsg: t.error_msg || '',
      previewUrl: t.local_path || t.result_url || '',
      prompt: t.prompt || '',
      createdAt: t.created_at || '',
      completedAt: t.completed_at || '',
    }))
    const mergeRows = genMerges.value.map(m => ({
      key: `merge-${m.id}`,
      kind: 'merge',
      id: m.id,
      targetLabel: '整集拼接',
      provider: m.provider || 'ffmpeg',
      model: m.model || '',
      status: m.status || 'pending',
      errorMsg: m.error_msg || '',
      previewUrl: m.merged_url || '',
      prompt: '',
      createdAt: m.created_at || '',
      completedAt: m.completed_at || '',
    }))
    return [...taskRows, ...mergeRows].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  })

  function genTaskKindLabel(kind) {
    return kind === 'image' ? '图片' : kind === 'video' ? '视频' : '合并'
  }

  function genTaskStatusLabel(status) {
    if (status === 'completed') return '已完成'
    if (status === 'failed') return '失败'
    if (status === 'cancelled') return '已取消'
    return '生成中'
  }

  // 映射到现有 video-task-status 的样式类:is-done / is-pending / is-failed
  function genTaskStateClass(status) {
    if (status === 'completed') return 'done'
    if (status === 'failed' || status === 'cancelled') return 'failed'
    return 'pending'
  }

  // local_path 为站内相对路径补 '/',远端 result_url 原样使用
  function genTaskPreviewSrc(url) {
    if (!url) return ''
    return /^https?:\/\//.test(url) ? url : '/' + url
  }

  function genTaskDuration(row) {
    if (!row.createdAt || !row.completedAt) return ''
    const ms = new Date(row.completedAt).getTime() - new Date(row.createdAt).getTime()
    if (!Number.isFinite(ms) || ms < 0) return ''
    return ms >= 60000 ? `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s` : `${Math.round(ms / 1000)}s`
  }

  // 抽屉打开且有进行中任务时,4s 轮询;关闭或全部结束时停止
  watch([taskDrawer, genTaskActiveCount], ([open, active]) => {
    stopGenTasksPolling()
    if (open && active > 0) {
      genTasksTimer = setInterval(loadGenTasks, 4000)
    }
  })

  const productionBlockMessage = computed(() => {
    if (!scriptContent.value) return '请先完成剧本编写'
    return ''
  })
  const productionBlockActionLabel = computed(() => {
    if (!scriptContent.value) return '前往剧本'
    return '返回处理'
  })
  function goProductionBlockTarget() {
    if (!scriptContent.value) {
      panel.value = 'script'
      scriptStep.value = rawContent.value ? 1 : 0
      return
    }
    panel.value = 'production'
    prodTab.value = 'assets'
    maybeAutoExtract()
  }
  const canExport = computed(() => !!sbs.value.length && shotVidCount.value === sbs.value.length)
  function goNextProd() {
    if (prodTab.value === 'assets') {
      prodTab.value = 'storyboard'
      return
    }
    if (prodTab.value === 'storyboard') {
      prodTab.value = 'videos'
      return
    }
    if (prodTabIdx.value < prodTabDefs.value.length - 1) {
      prodTabIdx.value++
    } else {
      panel.value = 'export'
    }
  }

  // Script step navigation
  const stepLabels = ['原始内容', 'AI 改写']
  const prevStepLabel = computed(() => scriptStep.value > 0 ? stepLabels[scriptStep.value - 1] : '')
  const nextStepLabel = computed(() => {
    if (scriptStep.value === 1) return '资产'
    return stepLabels[scriptStep.value + 1] || ''
  })
  const canGoNext = computed(() => {
    if (scriptStep.value === 0) return !!localRaw.value.trim()
    if (scriptStep.value === 1) return !!localScript.value.trim() || !!scriptContent.value
    return false
  })
  function goPrevStep() { if (scriptStep.value > 0) scriptStep.value-- }
  function goNextStep() {
    if (scriptStep.value === 0 && localRaw.value.trim()) {
      saveRaw()
      scriptStep.value = 1
      return
    }
    if (scriptStep.value === 1 && canGoNext.value) {
      if (localScript.value.trim()) saveScr()
      panel.value = 'production'
      prodTab.value = 'assets'
      maybeAutoExtract()
    }
  }

  const charImgCount = computed(() => visualChars.value.filter(c => c.image_url || c.imageUrl).length)
  const sceneImgCount = computed(() => scenes.value.filter(s => s.image_url || s.imageUrl).length)
  const propImgCount = computed(() => propItems.value.filter(p => p.image_url || p.imageUrl).length)
  const shotVidCount = computed(() => sbs.value.filter(s => s.video_url || s.videoUrl).length)
  const visualCharTotal = computed(() => visualChars.value.length)
  const pendingCharacterImageCount = computed(() => Math.max(visualCharTotal.value - charImgCount.value, 0))
  const pendingSceneImageCount = computed(() => Math.max(scenes.value.length - sceneImgCount.value, 0))
  const pendingAssetImageCount = computed(() => pendingCharacterImageCount.value + pendingSceneImageCount.value)
  const assetTotalCount = computed(() => visualCharTotal.value + scenes.value.length + propItems.value.length)
  const assetReadyCount = computed(() => charImgCount.value + sceneImgCount.value + propImgCount.value)

  const prodTabDefs = computed(() => [
    { id: 'assets', label: '资产', icon: FolderKanban, badge: assetTotalCount.value ? `${assetReadyCount.value}/${assetTotalCount.value}` : '' },
    { id: 'storyboard', label: '分镜拆分', icon: Clapperboard, badge: sbs.value.length ? `${sbs.value.length}` : '' },
    { id: 'videos', label: '视频生成', icon: Video, badge: shotVidCount.value ? `${shotVidCount.value}/${sbs.value.length}` : '' },
  ])

  const mainStageDefs = [
    { id: 'script', label: '剧本', desc: '内容改写与整理', icon: FileText },
    { id: 'assets', label: '资产', desc: '角色 / 场景 / 道具', icon: FolderKanban },
    { id: 'storyboard', label: '分镜', desc: '分镜拆分与提示词', icon: Clapperboard },
    { id: 'videos', label: '视频', desc: '视频任务与生成', icon: Video },
    { id: 'export', label: '导出', desc: '拼接与成片输出', icon: Download },
  ]

  const sidebarSections = computed(() => ([
    {
      id: 'script',
      label: '剧本',
      items: [
        { key: 'script:raw', label: '原始内容', desc: '', icon: FileText },
        { key: 'script:rewrite', label: 'AI 改写', desc: '', icon: FileText },
      ],
    },
    {
      id: 'production',
      label: '制作',
      items: [
        { key: 'prod:assets', label: '资产', desc: '', icon: Users },
        { key: 'prod:storyboard', label: '分镜拆分', desc: '', icon: Clapperboard },
        { key: 'prod:videos', label: '视频生成', desc: '', icon: Video },
      ],
    },
    {
      id: 'export',
      label: '导出',
      items: [
        { key: 'export:merge', label: '拼接导出', desc: '', icon: Download },
      ],
    },
  ]))

  // 大环节状态:pending(未开始)/ active(进行中)/ done(已完成)/ none(不显示状态,导出用)
  // 进行中 = 环节内有任意进度但未全部完成,或当前正处于该环节
  function sectionState(sectionId) {
    if (sectionId === 'export') return 'none'
    const done = sectionId === 'script'
      ? mainStageDone('script')
      : mainStageDone('assets') && mainStageDone('storyboard') && mainStageDone('videos')
    if (done) return 'done'

    const hasProgress = sectionId === 'script'
      ? !!(rawContent.value || scriptContent.value)
      : !!(chars.value.length || scenes.value.length || propItems.value.length || sbs.value.length || shotVidCount.value)
    const isCurrent = sectionId === 'script'
      ? panel.value === 'script'
      : panel.value === 'production'
    return (hasProgress || isCurrent) ? 'active' : 'pending'
  }

  const activeMainStage = computed(() => {
    if (panel.value === 'export') return 'export'
    if (panel.value === 'production') {
      if (prodTab.value === 'assets') return 'assets'
      if (prodTab.value === 'storyboard') return 'storyboard'
      return 'videos'
    }
    return 'script'
  })

  const assistantUiContext = computed(() => {
    let stage = 'raw'
    if (panel.value === 'export') stage = 'export'
    else if (panel.value === 'production') {
      if (prodTab.value === 'assets') stage = 'assets'
      else if (prodTab.value === 'storyboard') stage = 'storyboard'
      else stage = 'videos'
    } else {
      stage = scriptStep.value === 0 ? 'raw' : 'rewrite'
    }
    const detail = assetDetail.value
    return {
      route: 'episode',
      drama_id: dramaId,
      episode_id: epId.value || null,
      episode_number: episodeNumber,
      stage,
      script_step: scriptStep.value,
      prod_tab: prodTab.value,
      selected_asset: detail?.open && detail.item?.id
        ? { type: detail.type, id: detail.item.id }
        : null,
      selected_storyboard_id: selectedSb.value?.id || null,
    }
  })

  function mainStageDone(stageId) {
    if (stageId === 'script') return !!scriptContent.value
    if (stageId === 'assets') return assetTotalCount.value > 0 && assetReadyCount.value === assetTotalCount.value
    if (stageId === 'videos') {
      return !!sbs.value.length && shotVidCount.value === sbs.value.length
    }
    if (stageId === 'storyboard') return !!sbs.value.length
    if (stageId === 'export') return !!mergeUrl.value
    return false
  }

  function goMainStage(stageId) {
    if (stageId === 'script') {
      panel.value = 'script'
      scriptStep.value = Math.min(scriptStep.value, 1)
      return
    }
    if (stageId === 'assets') {
      panel.value = 'production'
      prodTab.value = 'assets'
      maybeAutoExtract()
      return
    }
    if (stageId === 'videos') {
      panel.value = 'production'
      prodTab.value = 'videos'
      return
    }
    if (stageId === 'storyboard') {
      panel.value = 'production'
      prodTab.value = 'storyboard'
      return
    }
    panel.value = 'export'
  }

  const activeSubStepKey = computed(() => {
    if (panel.value === 'script') {
      if (scriptStep.value === 0) return 'script:raw'
      return 'script:rewrite'
    }
    if (panel.value === 'production') return `prod:${prodTab.value}`
    return 'export:merge'
  })

  const sidebarJumpSteps = computed(() => {
    const section = sidebarSections.value.find((item) => item.items.some(step => step.key === activeSubStepKey.value))
    return section?.items || []
  })

  const bubbleSteps = computed(() => {
    if (panel.value === 'script') {
      return [
        { key: 'script:raw', label: '原始内容' },
        { key: 'script:rewrite', label: 'AI 改写' },
      ]
    }
    if (panel.value === 'production') {
      return prodTabDefs.value.map(step => ({
        key: `prod:${step.id}`,
        label: step.label,
      }))
    }
    return []
  })

  const activeBubbleKey = computed(() => {
    if (panel.value === 'script') return activeSubStepKey.value
    if (panel.value === 'production') return `prod:${prodTab.value}`
    return ''
  })

  const showBottomBubble = computed(() => panel.value === 'script' || panel.value === 'production')

  function goSubStep(key) {
    if (key.startsWith('script:')) {
      panel.value = 'script'
      const stepMap = {
        'script:raw': 0,
        'script:rewrite': 1,
      }
      scriptStep.value = stepMap[key] ?? 0
      return
    }
    if (key.startsWith('prod:')) {
      panel.value = 'production'
      prodTab.value = key.replace('prod:', '')
      if (prodTab.value === 'assets') maybeAutoExtract()
      return
    }
    panel.value = 'export'
  }

  const pipelineTotal = 2
  const pipelineProgress = computed(() =>
    ['script', 'production'].filter(id => sectionState(id) === 'done').length
  )

  const currentStageLabel = computed(() => {
    if (panel.value === 'script') return `剧本阶段 · ${stepLabels[scriptStep.value]}`
    if (panel.value === 'production') return `制作阶段 · ${prodTabDefs.value[prodTabIdx.value]?.label || '制作'}`
    return mergeUrl.value ? '导出阶段 · 成片已生成' : '导出阶段 · 等待拼接'
  })

  const currentMainStageLabel = computed(() => {
    const current = mainStageDefs.find(stage => stage.id === activeMainStage.value)
    return current?.label || '工作台'
  })

  const currentSubStageLabel = computed(() => currentStageLabel.value)

  const totalDuration = computed(() => sbs.value.reduce((s, sb) => s + (sb.duration || 10), 0))
  const selectedSb = ref(null)
  const selectedVideoTaskNumber = computed(() => {
    const index = videoTaskRows.value.findIndex(task => String(task.id) === String(selectedSb.value?.id))
    return index >= 0 ? index + 1 : 0
  })

  function updateField(sb, field, value) {
    const current = sb[field] ?? sb[toCamel(field)]
    if (current === value) return
    sb[field] = value
    const camelField = toCamel(field)
    if (camelField !== field) sb[camelField] = value
    storyboardAPI.update(sb.id, { [field]: value }).catch(e => toast.error(e.message))
  }

  function toCamel(field) {
    return field.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
  }

  function getStoryboardCharacterIds(sb) {
    return sb?.character_ids || sb?.characterIds || []
  }

  function getStoryboardCharacters(sb) {
    const ids = getStoryboardCharacterIds(sb)
    return visualChars.value.filter(char => ids.includes(char.id))
  }

  function getStoryboardScene(sb) {
    const sceneId = sb?.scene_id || sb?.sceneId
    if (!sceneId) return null
    return scenes.value.find(s => s.id === sceneId) || null
  }

  function isStoryboardCharacterSelected(sb, charId) {
    return getStoryboardCharacterIds(sb).includes(charId)
  }

  function toggleStoryboardCharacter(sb, charId) {
    const currentIds = getStoryboardCharacterIds(sb)
    const nextIds = currentIds.includes(charId)
      ? currentIds.filter(id => id !== charId)
      : [...currentIds, charId]
    updateField(sb, 'character_ids', nextIds)
  }

  function getStoryboardPropIds(sb) {
    return sb?.prop_ids || sb?.propIds || []
  }

  function getStoryboardProps(sb) {
    const ids = getStoryboardPropIds(sb)
    return propItems.value.filter(p => ids.includes(p.id))
  }

  function isStoryboardPropSelected(sb, propId) {
    return getStoryboardPropIds(sb).includes(propId)
  }

  function toggleStoryboardProp(sb, propId) {
    const currentIds = getStoryboardPropIds(sb)
    const nextIds = currentIds.includes(propId)
      ? currentIds.filter(id => id !== propId)
      : [...currentIds, propId]
    updateField(sb, 'prop_ids', nextIds)
  }

  function getSceneName(sb) {
    const scene = getStoryboardScene(sb)
    if (!scene) return ''
    return `${scene.location} · ${scene.time || '未设时间'}`
  }

  const sceneOptions = computed(() => [
    { label: '未绑定场景', value: '' },
    ...scenes.value.map(s => ({ label: `${s.location} · ${s.time || '未设时间'}`, value: s.id })),
  ])


  function sceneShotCount(sceneId) {
    return sbs.value.filter(sb => String(sb?.scene_id || sb?.sceneId || '') === String(sceneId)).length
  }

  watch(rawContent, v => { localRaw.value = v }, { immediate: true })
  watch(scriptContent, v => { localScript.value = v }, { immediate: true })

  async function refresh() {
    try {
      drama.value = await dramaAPI.get(dramaId)
      const ep = drama.value.episodes?.find(e => (e.episode_number || e.episodeNumber) === episodeNumber)
      if (ep) {
        episode.value = ep
        try { chars.value = await episodeAPI.characters(ep.id) } catch { chars.value = [] }
        try { scenes.value = await episodeAPI.scenes(ep.id) } catch { scenes.value = [] }
        try { propItems.value = await episodeAPI.props(ep.id) } catch { propItems.value = [] }
        sbs.value = await episodeAPI.storyboards(ep.id)
        selectedSbIds.value = selectedSbIds.value.filter(id => sbs.value.some(sb => sb.id === id))
        if (sbs.value.length) {
          const currentSelectedId = selectedSb.value?.id
          selectedSb.value = sbs.value.find(sb => sb.id === currentSelectedId) || sbs.value[0]
        } else {
          selectedSb.value = null
        }

        const epHasContent = !!(episode.value?.content)
        const epHasScript = !!(episode.value?.script_content || episode.value?.scriptContent)

        if (panelRestored) {
          // 已恢复到上次所在步骤，跳过自动重置（仅首次加载生效）
          panelRestored = false
        } else if (epHasScript || epHasContent) scriptStep.value = 1
        else scriptStep.value = 0
      }
    } catch (e) {
      toast.error(e.message)
    }
    try { mergeData.value = await mergeAPI.status(epId.value) } catch {}
    await Promise.all([loadGenTasks(), loadExportMerges()])
    syncOpenAssetDetailItem()
  }

  function syncOpenAssetDetailItem() {
    const detail = assetDetail.value
    if (!detail.open || !detail.item?.id) return
    const list = detail.type === 'character' ? chars.value : detail.type === 'scene' ? scenes.value : propItems.value
    const fresh = list.find(x => x.id === detail.item.id)
    if (fresh) assetDetail.value.item = fresh
    loadAssetImageHistory()
  }

  function saveRaw() { episodeAPI.update(epId.value, { content: localRaw.value }); episode.value.content = localRaw.value }
  function saveScr() { episodeAPI.update(epId.value, { script_content: localScript.value }); episode.value.script_content = localScript.value }
  function doRewrite() { saveRaw(); runAgent('script_rewriter', '请读取剧本并改写为格式化剧本，然后保存', dramaId, epId.value, refresh, chatModelOverride(), chatConfigId()) }
  function skipRewrite() {
    const raw = (localRaw.value || rawContent.value || '').trim()
    if (!raw) {
      toast.warning('请先填写原始内容')
      return
    }
    localScript.value = raw
    saveScr()
    toast.success('已跳过 AI 改写，当前将直接使用原始内容')
    panel.value = 'production'
    prodTab.value = 'assets'
    maybeAutoExtract()
  }

  // 资产提取：按类型独立的异步任务，三类可并行；进入空资产页时自动提取
  const EXTRACT_TARGETS = [
    { key: 'characters', label: '角色' },
    { key: 'scenes', label: '场景' },
    { key: 'props', label: '道具' },
  ]
  const extractingTargets = ref([])
  const extractingLabels = computed(() => EXTRACT_TARGETS.filter(t => extractingTargets.value.includes(t.key)).map(t => t.label).join('、'))
  function isExtracting(target) { return extractingTargets.value.includes(target) }

  function doExtract(target) {
    if (isExtracting(target) || !epId.value) return
    saveScr()
    extractingTargets.value.push(target)
    episodeAPI.extract(epId.value, target, chatModelOverride(), chatConfigId(), readSkillSelectionPayload('extractor'))
      .then(() => pollExtractStatus(target))
      .catch(e => {
        extractingTargets.value = extractingTargets.value.filter(t => t !== target)
        toast.error(e.message)
      })
  }
  function doExtractAll() { EXTRACT_TARGETS.forEach(t => doExtract(t.key)) }

  function maybeAutoExtract() {
    if (!epId.value) return
    const hasScript = !!(localScript.value.trim() || scriptContent.value)
    if (!hasScript) return
    if (chars.value.length || scenes.value.length || propItems.value.length) return
    if (extractingTargets.value.length) return
    doExtractAll()
  }

  function pollExtractStatus(target, attempts = 150) {
    const label = EXTRACT_TARGETS.find(t => t.key === target)?.label || target
    const tick = async (left) => {
      try {
        const st = await episodeAPI.extractStatus(epId.value)
        const task = st?.[target]
        if (task && task.status !== 'running') {
          extractingTargets.value = extractingTargets.value.filter(t => t !== target)
          if (task.status === 'done') {
            toast.success(`${label}提取完成`)
            await refresh()
          } else {
            toast.error(task.error || `${label}提取失败`)
          }
          return
        }
      } catch {}
      if (left > 0) setTimeout(() => tick(left - 1), 2500)
      else extractingTargets.value = extractingTargets.value.filter(t => t !== target)
    }
    setTimeout(() => tick(attempts), 2500)
  }

  /** 页面加载后恢复仍在运行的提取 / 批量视频提示词任务 */
  async function syncExtractStatus() {
    if (!epId.value) return
    try {
      const st = await episodeAPI.extractStatus(epId.value)
      for (const t of EXTRACT_TARGETS) {
        if (st?.[t.key]?.status === 'running' && !isExtracting(t.key)) {
          extractingTargets.value.push(t.key)
          pollExtractStatus(t.key)
        }
      }
    } catch {}
    try {
      const vp = await episodeAPI.videoPromptsStatus(epId.value)
      if (vp?.status === 'running' && !videoPromptBatch.value.running) {
        videoPromptBatch.value = { running: true, total: vp.total || 0, completed: vp.completed || 0 }
        pollVideoPromptBatch()
      }
    } catch {}
  }

  // ─── 批量视频提示词：后端异步逐分镜生成，前端轮询进度 ──────────
  const videoPromptBatch = ref({ running: false, total: 0, completed: 0 })
  // 单个视频提示词生成：按分镜 ID 跟踪，允许不同分镜并行生成（不走全局 rn 锁）
  const videoPromptGeneratingIds = ref([])
  // 分镜勾选：勾选后批量生成只处理所选（已有提示词也会重新生成）；未勾选时处理全部缺失
  const selectedSbIds = ref([])
  // 多选模式：进入后点击卡片=勾选/取消，底部操作条确认生成
  const sbSelectMode = ref(false)
  function isSbSelected(id) { return selectedSbIds.value.includes(id) }
  function toggleSbSelect(id) {
    selectedSbIds.value = isSbSelected(id) ? selectedSbIds.value.filter(x => x !== id) : [...selectedSbIds.value, id]
  }
  function toggleSelectAllSbs() {
    selectedSbIds.value = selectedSbIds.value.length === sbs.value.length ? [] : sbs.value.map(sb => sb.id)
  }
  function onShotCardClick(sb) {
    if (sbSelectMode.value) toggleSbSelect(sb.id)
    else selectedSb.value = sb
  }
  // 仅缺失：选中还没有视频提示词的分镜
  function selectMissingSbs() {
    selectedSbIds.value = sbs.value.filter(sb => !((sb.video_prompt || sb.videoPrompt || '').trim())).map(sb => sb.id)
  }
  function exitSbSelectMode() {
    sbSelectMode.value = false
    selectedSbIds.value = []
  }
  function generateSelectedVideoPrompts() {
    batchVideoPrompts() // 内部同步捕获所选 ids
    exitSbSelectMode()
  }

  async function batchVideoPrompts() {
    if (videoPromptBatch.value.running || !epId.value) return
    if (!sbs.value.length) { toast.warning('请先拆分分镜'); return }
    const ids = selectedSbIds.value.length ? [...selectedSbIds.value] : undefined
    try {
      const res = await episodeAPI.generateVideoPrompts(
        epId.value,
        chatModelOverride(),
        chatConfigId(),
        ids,
        readSkillSelectionPayload('prompt_generator'),
      )
      if (!res?.total) {
        if (res?.already_running) {
          videoPromptBatch.value = { running: true, total: 0, completed: 0 }
          pollVideoPromptBatch()
        } else toast.info(ids ? '所选分镜不存在' : '所有分镜已有视频提示词')
        return
      }
      videoPromptBatch.value = { running: true, total: res.total, completed: 0 }
      toast.info(`开始生成 ${res.total} 个分镜的视频提示词…`)
      pollVideoPromptBatch()
    } catch (e) {
      toast.error(e.message)
    }
  }

  function pollVideoPromptBatch(attempts = 240) {
    const tick = async (left) => {
      try {
        const st = await episodeAPI.videoPromptsStatus(epId.value)
        if (st && st.status !== 'running') {
          videoPromptBatch.value = { running: false, total: 0, completed: 0 }
          await refresh()
          if (st.status === 'done') {
            toast.success(st.failed ? `视频提示词批量生成完成，${st.failed} 个失败` : '视频提示词批量生成完成')
          } else {
            toast.error(st.error || '视频提示词批量生成失败')
          }
          return
        }
        if (st) {
          const prev = videoPromptBatch.value.completed
          videoPromptBatch.value = { running: true, total: st.total || 0, completed: st.completed || 0 }
          if ((st.completed || 0) !== prev) await refresh() // 每完成一条刷新，提示词逐步出现
        }
      } catch {}
      if (left > 0) setTimeout(() => tick(left - 1), 2500)
      else videoPromptBatch.value = { running: false, total: 0, completed: 0 }
    }
    setTimeout(() => tick(attempts), 2500)
  }
  function doBreakdown() {
    const charList = chars.value.length
      ? chars.value.map(c => `${c.name}(ID:${c.id})`).join('、')
      : '（当前集还没有角色）'
    const sceneList = scenes.value.length
      ? scenes.value.map(s => `${s.location} · ${s.time || '未设时间'}(ID:${s.id})`).join('、')
      : '（当前集还没有场景）'
    const propList = propItems.value.length
      ? propItems.value.map(p => `${p.name}(ID:${p.id})`).join('、')
      : '（当前集还没有道具）'
    runAgent('storyboard_breaker', `请基于当前集剧本拆分分镜（不需要生成视频提示词，video_prompt 在视频生成阶段按需生成）。

  当前集已有角色：${charList}
  当前集已有场景：${sceneList}
  当前集已有道具：${propList}

  绑定要求：
  - 每个镜头必须根据剧本内容，从上述当前集已有角色中选出出场的角色绑定 character_ids（ID 必须来自上述列表；有角色出场就必须绑定，不要遗漏）
  - 每个镜头尽量匹配上述已有场景填写 scene_id（ID 必须来自上述列表），不要凭空创造新场景
  - 每个镜头出现关键道具（被使用、交接、特写或在画面中明显可见）时，从上述当前集已有道具中绑定 prop_ids（ID 必须来自上述列表）；没有道具出现可传空数组
  - 只有纯环境空镜头才可以不绑定角色`, dramaId, epId.value, refresh, chatModelOverride(), chatConfigId())
  }

  // 按需为单个分镜生成视频提示词：走与批量相同的后端入口（注入 videoEngine skill）
  async function genVideoPrompt(sb) {
    if (!sb || !epId.value) return
    if (videoPromptGeneratingIds.value.includes(sb.id) || videoPromptBatch.value.running) return
    const idx = sbs.value.indexOf(sb) + 1
    videoPromptGeneratingIds.value.push(sb.id)
    try {
      const res = await episodeAPI.generateVideoPrompts(
        epId.value,
        chatModelOverride(),
        chatConfigId(),
        [sb.id],
      )
      if (res?.already_running) {
        videoPromptBatch.value = { running: true, total: 0, completed: 0 }
        pollVideoPromptBatch()
        toast.info('已有提示词任务进行中，已接入轮询')
        return
      }
      if (!res?.total) {
        toast.info('分镜不存在或未能启动生成')
        return
      }
      videoPromptBatch.value = { running: true, total: res.total, completed: 0 }
      toast.info(`正在生成分镜 #${idx} 视频提示词…`)
      pollVideoPromptBatch()
    } catch (e) {
      toast.error(e.message)
    } finally {
      videoPromptGeneratingIds.value = videoPromptGeneratingIds.value.filter(id => id !== sb.id)
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  function watchAsyncResult(check, attempts = 24, delay = 2500) {
    void (async () => {
      for (let i = 0; i < attempts; i++) {
        await sleep(delay)
        await refresh()
        if (check()) return
      }
    })()
  }

  async function genCharImg(id) {
    try {
      if (!isPendingCharImage(id)) pendingCharImageIds.value.push(id)
      const char = chars.value.find(c => c.id === id)
      if (char && !(char.final_prompt || char.finalPrompt)) {
        toast.info('正在生成最终提示词…')
        try {
          await ensureAssetPrompt('character', id)
        } catch {} // 提示词生成失败不阻断：后端生图前会再兜底生成或回退本地拼接
      }
      await characterAPI.generateImage(id, epId.value, bareModelName(imageModel.value) || undefined, ownerConfigId(imageModelOptions.value, imageModel.value), chatModelOverride(), chatConfigId())
      toast.success('角色图片生成中')
      await refresh()
      watchAsyncResult(() => {
        const char = chars.value.find(c => c.id === id)
        const done = !!(char?.image_url || char?.imageUrl)
        if (done) pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== id)
        return done
      })
    } catch (e) {
      pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== id)
      toast.error(e.message)
    }
  }
  function batchCharImages() {
    const ids = visualChars.value.filter(c => !(c.image_url || c.imageUrl)).map(c => c.id)
    if (!ids.length) { toast.info('所有角色图片已生成'); return }
    pendingCharImageIds.value = [...new Set([...pendingCharImageIds.value, ...ids])]
    characterAPI.batchImages(ids, epId.value, bareModelName(imageModel.value) || undefined, ownerConfigId(imageModelOptions.value, imageModel.value), chatModelOverride(), chatConfigId()).then(async () => {
      toast.success('角色图片批量生成中')
      await refresh()
      watchAsyncResult(() => ids.every(id => {
        const char = chars.value.find(c => c.id === id)
        const done = !!(char?.image_url || char?.imageUrl)
        if (done) pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== id)
        return done
      }), 36)
    }).catch(e => {
      pendingCharImageIds.value = pendingCharImageIds.value.filter(item => !ids.includes(item))
      toast.error(e.message)
    })
  }
  async function genSceneImg(id) {
    try {
      if (!isPendingSceneImage(id)) pendingSceneImageIds.value.push(id)
      const scene = scenes.value.find(s => s.id === id)
      if (scene && !(scene.final_prompt || scene.finalPrompt)) {
        toast.info('正在生成最终提示词…')
        try {
          await ensureAssetPrompt('scene', id)
        } catch {} // 提示词生成失败不阻断：后端生图前会再兜底生成或回退本地拼接
      }
      await sceneAPI.generateImage(id, epId.value, bareModelName(imageModel.value) || undefined, ownerConfigId(imageModelOptions.value, imageModel.value), chatModelOverride(), chatConfigId())
      toast.success('场景图片生成中')
      await refresh()
      watchAsyncResult(() => {
        const scene = scenes.value.find(s => s.id === id)
        const done = !!(scene?.image_url || scene?.imageUrl)
        if (done) pendingSceneImageIds.value = pendingSceneImageIds.value.filter(item => item !== id)
        return done
      })
    } catch (e) {
      pendingSceneImageIds.value = pendingSceneImageIds.value.filter(item => item !== id)
      toast.error(e.message)
    }
  }
  async function editCharImg(id, editPrompt) {
    const prompt = String(editPrompt || '').trim()
    if (!prompt) { toast.warning('请输入改图提示词'); return }
    const char = chars.value.find(c => c.id === id)
    if (!char?.image_url && !char?.imageUrl && !char?.local_path && !char?.localPath) {
      toast.warning('请先生成或上传角色图')
      return
    }
    try {
      if (!isPendingCharImage(id)) pendingCharImageIds.value.push(id)
      await characterAPI.editImage(id, epId.value, prompt, lockedImg2imgConfigId.value || undefined)
      toast.success('角色改图中')
      await refresh()
      watchAsyncResult(() => {
        const c = chars.value.find(x => x.id === id)
        const done = !!(c?.image_url || c?.imageUrl)
        if (done) pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== id)
        return done
      })
    } catch (e) {
      pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== id)
      toast.error(e.message)
    }
  }
  async function editSceneImg(id, editPrompt) {
    const prompt = String(editPrompt || '').trim()
    if (!prompt) { toast.warning('请输入改图提示词'); return }
    const scene = scenes.value.find(s => s.id === id)
    if (!scene?.image_url && !scene?.imageUrl && !scene?.local_path && !scene?.localPath) {
      toast.warning('请先生成或上传场景图')
      return
    }
    try {
      if (!isPendingSceneImage(id)) pendingSceneImageIds.value.push(id)
      await sceneAPI.editImage(id, epId.value, prompt, lockedImg2imgConfigId.value || undefined)
      toast.success('场景改图中')
      await refresh()
      watchAsyncResult(() => {
        const s = scenes.value.find(x => x.id === id)
        const done = !!(s?.image_url || s?.imageUrl)
        if (done) pendingSceneImageIds.value = pendingSceneImageIds.value.filter(item => item !== id)
        return done
      })
    } catch (e) {
      pendingSceneImageIds.value = pendingSceneImageIds.value.filter(item => item !== id)
      toast.error(e.message)
    }
  }
  function isPendingPropImage(id) {
    return pendingPropImageIds.value.includes(id)
  }
  async function genPropImg(id) {
    try {
      if (!isPendingPropImage(id)) pendingPropImageIds.value.push(id)
      const prop = propItems.value.find(p => p.id === id)
      if (prop && !(prop.final_prompt || prop.finalPrompt)) {
        toast.info('正在生成最终提示词…')
        try {
          await ensureAssetPrompt('prop', id)
        } catch {} // 提示词生成失败不阻断：后端生图前会再兜底生成或回退本地拼接
      }
      await propAPI.generateImage(id, epId.value, bareModelName(imageModel.value) || undefined, ownerConfigId(imageModelOptions.value, imageModel.value), chatModelOverride(), chatConfigId())
      toast.success('道具图片生成中')
      await refresh()
      watchAsyncResult(() => {
        const prop = propItems.value.find(p => p.id === id)
        const done = !!(prop?.image_url || prop?.imageUrl)
        if (done) pendingPropImageIds.value = pendingPropImageIds.value.filter(item => item !== id)
        return done
      })
    } catch (e) {
      pendingPropImageIds.value = pendingPropImageIds.value.filter(item => item !== id)
      toast.error(e.message)
    }
  }
  function batchSceneImages() {
    const ids = scenes.value.filter(s => !(s.image_url || s.imageUrl)).map(s => s.id)
    if (!ids.length) { toast.info('所有场景图片已生成'); return }
    pendingSceneImageIds.value = [...new Set([...pendingSceneImageIds.value, ...ids])]
    ids.forEach(id => { sceneAPI.generateImage(id, epId.value, bareModelName(imageModel.value) || undefined, ownerConfigId(imageModelOptions.value, imageModel.value), chatModelOverride(), chatConfigId()).then(() => refresh()).catch(e => toast.error(e.message)) })
    toast.success('场景图片批量生成中')
    watchAsyncResult(() => ids.every(id => {
      const scene = scenes.value.find(s => s.id === id)
      const done = !!(scene?.image_url || scene?.imageUrl)
      if (done) pendingSceneImageIds.value = pendingSceneImageIds.value.filter(item => item !== id)
      return done
    }), 36)
  }
  function batchPropImages() {
    const ids = propItems.value.filter(p => !(p.image_url || p.imageUrl)).map(p => p.id)
    if (!ids.length) { toast.info('所有道具图片已生成'); return }
    pendingPropImageIds.value = [...new Set([...pendingPropImageIds.value, ...ids])]
    ids.forEach(id => { propAPI.generateImage(id, epId.value, bareModelName(imageModel.value) || undefined, ownerConfigId(imageModelOptions.value, imageModel.value), chatModelOverride(), chatConfigId()).then(() => refresh()).catch(e => toast.error(e.message)) })
    toast.success('道具图片批量生成中')
    watchAsyncResult(() => ids.every(id => {
      const prop = propItems.value.find(p => p.id === id)
      const done = !!(prop?.image_url || prop?.imageUrl)
      if (done) pendingPropImageIds.value = pendingPropImageIds.value.filter(item => item !== id)
      return done
    }), 36)
  }
  function getVideoUrl(s) { return s?.video_url || s?.videoUrl || s?.composed_video_url || s?.composedVideoUrl || null }
  function hasVid(s) { return !!getVideoUrl(s) }

  // ===== 分镜视频历史（一个分镜可能生成多个视频,sys_task 留存全部记录）=====
  const sbVideoHistory = ref([])
  const previewVideoUrl = ref('') // 正在预览的历史视频(相对路径);空 = 预览当前主视频

  // 注意:/tasks 返回原始行(camelCase),/episodes/:id/generation-tasks 返回 snake_case,两种命名都兼容
  function taskVideoPath(t) { return t?.local_path || t?.localPath || t?.result_url || t?.resultUrl || '' }
  function taskCreatedAt(t) { return t?.created_at || t?.createdAt || '' }
  function isCurrentVideo(t) { const p = taskVideoPath(t); return !!p && p === getVideoUrl(selectedSb.value) }

  async function loadSbVideoHistory() {
    previewVideoUrl.value = ''
    if (!selectedSb.value?.id) { sbVideoHistory.value = []; return }
    try {
      const rows = await taskAPI.list({ type: 'video', storyboard_id: selectedSb.value.id })
      sbVideoHistory.value = (Array.isArray(rows) ? rows : [])
        .filter(t => t.status === 'completed' && taskVideoPath(t))
        .sort((a, b) => taskCreatedAt(b).localeCompare(taskCreatedAt(a)))
    } catch { sbVideoHistory.value = [] }
  }

  watch(() => [selectedSb.value?.id, getVideoUrl(selectedSb.value)], () => { loadSbVideoHistory() })

  function previewHistoryVideo(t) {
    previewVideoUrl.value = isCurrentVideo(t) ? '' : taskVideoPath(t)
  }

  async function setAsMainVideo() {
    const sb = selectedSb.value
    if (!sb || !previewVideoUrl.value) return
    try {
      await storyboardAPI.update(sb.id, { video_url: previewVideoUrl.value })
      sb.video_url = previewVideoUrl.value
      sb.videoUrl = previewVideoUrl.value
      toast.success('已设为主视频')
    } catch (e) { toast.error(e.message || '设置失败') }
  }

  async function removeHistoryVideo(t) {
    try {
      await taskAPI.del(t.id)
      sbVideoHistory.value = sbVideoHistory.value.filter(x => x.id !== t.id)
      if (previewVideoUrl.value === taskVideoPath(t)) previewVideoUrl.value = ''
      toast.success('已删除该历史记录')
    } catch (e) { toast.error(e.message || '删除失败') }
  }

  function formatHistoryTime(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const p = n => String(n).padStart(2, '0')
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  }

  function getShotReferenceImages(sb) {
    const refs = []
    const pushRef = (value) => {
      if (!value || refs.includes(value) || refs.length >= 9) return
      refs.push(value)
    }
    const scene = getStoryboardScene(sb)
    pushRef(scene?.image_url || scene?.imageUrl)
    for (const char of getStoryboardCharacters(sb)) {
      pushRef(char?.image_url || char?.imageUrl)
    }
    for (const prop of getStoryboardProps(sb)) {
      pushRef(prop?.image_url || prop?.imageUrl)
    }
    // 手动上传的参考图片追加到尾部（总计 ≤9）
    for (const url of videoRefImageUrls.value) pushRef(url)
    return refs
  }

  function getShotReferenceAssets(sb) {
    const assets = []
    const scene = getStoryboardScene(sb)
    if (scene) {
      const imageUrl = scene.image_url || scene.imageUrl || ''
      assets.push({
        key: `scene-${scene.id}`,
        type: '场景',
        name: scene.location || '未命名场景',
        meta: scene.time || '场景图',
        imageUrl,
        ready: !!imageUrl,
      })
    }
    for (const char of getStoryboardCharacters(sb)) {
      const imageUrl = char.image_url || char.imageUrl || ''
      assets.push({
        key: `character-${char.id}`,
        type: '角色',
        name: char.name || '未命名角色',
        meta: char.role || '角色形象',
        imageUrl,
        ready: !!imageUrl,
      })
    }
    for (const prop of getStoryboardProps(sb)) {
      const imageUrl = prop.image_url || prop.imageUrl || ''
      assets.push({
        key: `prop-${prop.id}`,
        type: '道具',
        name: prop.name || '未命名道具',
        meta: prop.type || '道具单品图',
        imageUrl,
        ready: !!imageUrl,
      })
    }
    return assets.slice(0, 6)
  }

  // 右侧参考素材面板：本集全部可绑定素材（场景单选、角色/道具多选），bound 标记是否已绑定
  function shotBindableAssets(sb) {
    const out = []
    for (const char of visualChars.value) {
      const imageUrl = char.image_url || char.imageUrl || ''
      out.push({
        key: `character-${char.id}`,
        id: char.id,
        type: '角色',
        name: char.name || '未命名角色',
        meta: char.role || '角色形象',
        imageUrl,
        ready: !!imageUrl,
        bound: getStoryboardCharacterIds(sb).includes(char.id),
      })
    }
    for (const scene of scenes.value) {
      const imageUrl = scene.image_url || scene.imageUrl || ''
      out.push({
        key: `scene-${scene.id}`,
        id: scene.id,
        type: '场景',
        name: `${scene.location} · ${scene.time || '未设时间'}`,
        meta: scene.time || '场景图',
        imageUrl,
        ready: !!imageUrl,
        bound: (sb?.scene_id || sb?.sceneId) === scene.id,
      })
    }
    for (const prop of propItems.value) {
      const imageUrl = prop.image_url || prop.imageUrl || ''
      out.push({
        key: `prop-${prop.id}`,
        id: prop.id,
        type: '道具',
        name: prop.name || '未命名道具',
        meta: prop.type || '道具单品图',
        imageUrl,
        ready: !!imageUrl,
        bound: getStoryboardPropIds(sb).includes(prop.id),
      })
    }
    // 固定顺序（角色→场景→道具，按资产原顺序）：点击绑定/解绑不重排，避免跳动
    return out
  }

  // 右侧参考素材面板渲染用：当前分镜可绑定的全部素材
  const refBindableAssets = computed(() => {
    const sb = selectedSb.value
    return sb ? shotBindableAssets(sb) : []
  })

  // 右侧面板切换绑定：场景单选（切换/解绑），角色/道具多选
  function toggleShotBind(sb, asset) {
    if (asset.type === '场景') {
      const current = sb?.scene_id || sb?.sceneId
      updateField(sb, 'scene_id', current === asset.id ? null : asset.id)
      return
    }
    if (asset.type === '角色') {
      toggleStoryboardCharacter(sb, asset.id)
      return
    }
    toggleStoryboardProp(sb, asset.id)
  }

  // 场景/角色/道具自动绑定占用的参考图片槽位（按素材卡片数，最多 9）
  const autoReferenceImageCount = computed(() => {
    const sb = selectedSb.value
    if (!sb) return 0
    let count = 0
    if (getStoryboardScene(sb)) count += 1
    count += getStoryboardCharacters(sb).length
    count += getStoryboardProps(sb).length
    return Math.min(count, 9)
  })

  // 已占用的参考图片数（场景/角色素材 + 手动上传），展示为 n/9
  const refImageUsedCount = computed(() => Math.min(9, autoReferenceImageCount.value + videoRefImageUrls.value.length))
  // 是否已达 9 张上限（禁用继续上传）
  const refImageFull = computed(() => refImageUsedCount.value >= 9)

  // 视频提示词 @ 引用候选：仅当前分镜已绑定的角色与道具（按名字引用）、场景（按地点引用），展示顺序：角色 → 场景 → 道具
  const mentionOptions = computed(() => {
    const sb = selectedSb.value
    if (!sb) return []
    const scene = getStoryboardScene(sb)
    return [
      ...getStoryboardCharacters(sb).map(c => ({
        label: c.name,
        value: c.name,
        group: '角色',
        image: thumbOf(assetImageSrc(c)),
      })),
      ...(scene ? [{
        label: `${scene.location} · ${scene.time || '未设时间'}`,
        value: scene.location,
        group: '场景',
        image: thumbOf(assetImageSrc(scene)),
      }] : []),
      ...getStoryboardProps(sb).map(p => ({
        label: p.name,
        value: p.name,
        group: '道具',
        image: thumbOf(assetImageSrc(p)),
      })),
    ]
  })

  // 首尾帧视频提示词 @ 引用：在素材引用基础上追加 @首帧 / @尾帧
  const firstLastMentionOptions = computed(() => {
    const sb = selectedSb.value
    if (!sb) return mentionOptions.value
    const frameOpts = []
    if (firstFrameOf(sb)) {
      frameOpts.push({
        label: '首帧',
        value: '首帧',
        group: '镜头帧',
        image: thumbOf(frameSrc(firstFrameOf(sb))),
      })
    }
    if (lastFrameOf(sb)) {
      frameOpts.push({
        label: '尾帧',
        value: '尾帧',
        group: '镜头帧',
        image: thumbOf(frameSrc(lastFrameOf(sb))),
      })
    }
    return [...frameOpts, ...mentionOptions.value]
  })

  // 按参考图顺序（场景图在前、角色图居中、道具图在后）为 @名字 建立索引映射，供视频提示词引用替换
  function getShotReferenceIndexMap(sb) {
    const ordered = []
    const seen = new Set()
    const push = (name, url) => {
      if (!url || seen.has(url) || ordered.length >= 9) return
      seen.add(url)
      ordered.push({ name, imageUrl: url })
    }
    const scene = getStoryboardScene(sb)
    push(scene?.location || '', scene?.image_url || scene?.imageUrl)
    for (const char of getStoryboardCharacters(sb)) {
      push(char.name || '', char?.image_url || char?.imageUrl)
    }
    for (const prop of getStoryboardProps(sb)) {
      push(prop.name || '', prop?.image_url || prop?.imageUrl)
    }
    const nameToIndex = {}
    ordered.forEach((a, i) => { if (a.name && !(a.name in nameToIndex)) nameToIndex[a.name] = i + 1 })
    return nameToIndex
  }

  // 将视频提示词里的 @名字 替换为 @图片N名字（N 为参考图序号，1 起），生成时使用
  function resolveVideoPromptRefs(sb) {
    const prompt = sb.video_prompt || sb.videoPrompt || ''
    return replaceAssetMentions(prompt, getShotReferenceIndexMap(sb))
  }

  const FIRST_LAST_FRAME_TOKENS = new Set(['首帧', '尾帧'])

  function replaceAssetMentions(prompt, map) {
    const names = Object.keys(map).sort((a, b) => b.length - a.length)
    if (!names.length) return prompt
    return prompt.replace(/@([^\s@]+)/g, (m, raw) => {
      if (FIRST_LAST_FRAME_TOKENS.has(raw)) return m
      for (const name of names) {
        if (raw.startsWith(name)) {
          return `@图片${map[name]}${name}${raw.slice(name.length)}`
        }
      }
      return m
    })
  }

  // 首尾帧视频提示词：优先 first_last_prompt，回退 video_prompt；保留 @首帧/@尾帧，素材 @ 转 @图片N
  function resolveFirstLastPromptRefs(sb) {
    const prompt = (sb.first_last_prompt || sb.firstLastPrompt || sb.video_prompt || sb.videoPrompt || '').trim()
    return replaceAssetMentions(prompt, getShotReferenceIndexMap(sb))
  }

  // 切换选中分镜时重置视频生成面板
  watch(selectedSb, (sb) => {
    videoRefVideoUrls.value = []
    videoRefAudioUrls.value = []
    videoRefImageUrls.value = []
    videoDuration.value = Number(sb?.duration || 10)
  })

  function pickFile(accept, cb) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => { const f = input.files?.[0]; if (f) cb(f) }
    input.click()
  }

  // ===== 资产图片手动上传（角色形象 / 场景图 / 道具图）=====
  const ASSET_UPLOAD_LABELS = { character: '角色形象', scene: '场景图', prop: '道具图' }
  const uploadingAssetKeys = ref([])
  function isUploadingAsset(kind, id) { return uploadingAssetKeys.value.includes(`${kind}:${id}`) }
  function uploadAssetImage(kind, id) {
    pickFile('image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp', async (file) => {
      const key = `${kind}:${id}`
      if (!uploadingAssetKeys.value.includes(key)) uploadingAssetKeys.value.push(key)
      try {
        const res = await uploadAPI.image(file)
        // 与生图回写保持一致：存相对路径（static/...），前端展示时补前导斜杠
        const payload = { image_url: res.path, local_path: res.path }
        if (kind === 'character') await characterAPI.update(id, payload)
        else if (kind === 'scene') await sceneAPI.update(id, payload)
        else await propAPI.update(id, payload)
        toast.success(`${ASSET_UPLOAD_LABELS[kind]}已上传`)
        await refresh()
      } catch (e) {
        toast.error(e.message)
      } finally {
        uploadingAssetKeys.value = uploadingAssetKeys.value.filter(k => k !== key)
      }
    })
  }

  function uploadRefMedia(kind) {
    if (kind === 'image') {
      if (refImageFull.value) { toast.info('参考图片已达上限（含场景/角色素材）'); return }
      pickFile('image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp', async (file) => {
        uploadingRefMedia.value = true
        try {
          const res = await uploadAPI.image(file)
          videoRefImageUrls.value = [...videoRefImageUrls.value, res.url]
          toast.success('参考图片已上传')
        } catch (e) { toast.error(e.message) } finally { uploadingRefMedia.value = false }
      })
      return
    }
    const isVideo = kind === 'video'
    const list = isVideo ? videoRefVideoUrls : videoRefAudioUrls
    const label = isVideo ? '视频' : '音频'
    if (list.value.length >= 3) { toast.info(`参考${label}最多 3 个`); return }
    const accept = isVideo ? 'video/mp4,video/quicktime,video/webm,.m4v' : 'audio/mpeg,audio/wav,audio/mp4,.aac'
    pickFile(accept, async (file) => {
      uploadingRefMedia.value = true
      try {
        const res = isVideo ? await uploadAPI.video(file) : await uploadAPI.audio(file)
        list.value = [...list.value, res.url]
        toast.success(`参考${label}已上传`)
      } catch (e) { toast.error(e.message) } finally { uploadingRefMedia.value = false }
    })
  }

  function removeRefMedia(kind, index) {
    const list = kind === 'image' ? videoRefImageUrls : kind === 'video' ? videoRefVideoUrls : videoRefAudioUrls
    list.value = list.value.filter((_, i) => i !== index)
  }

  function firstFrameOf(sb) {
    return sb?.first_frame_image || sb?.firstFrameImage || ''
  }
  function lastFrameOf(sb) {
    return sb?.last_frame_image || sb?.lastFrameImage || ''
  }
  function framesReadyCount(sb) {
    return (firstFrameOf(sb) ? 1 : 0) + (lastFrameOf(sb) ? 1 : 0)
  }
  function frameSrc(raw) {
    if (!raw) return ''
    if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) return raw
    return `/${raw}`
  }
  function firstShotDescription(sb) {
    const desc = sb?.description || ''
    const match = desc.match(/【镜头\d+】([^【]*)/)
    if (match) return (match[1] || '').trim() || desc
    return desc
  }
  function lastShotDescription(sb) {
    const desc = sb?.description || ''
    const matches = [...desc.matchAll(/【镜头\d+】([^【]*)/g)]
    if (matches.length) return (matches[matches.length - 1][1] || '').trim() || desc
    return desc
  }
  function effectiveFirstFramePrompt(sb) {
    const stored = (sb?.first_frame_prompt || sb?.firstFramePrompt || '').trim()
    if (stored) return stored
    return (sb?.image_prompt || sb?.imagePrompt || '').trim() || firstShotDescription(sb)
  }
  function effectiveLastFramePrompt(sb) {
    const stored = (sb?.last_frame_prompt || sb?.lastFramePrompt || '').trim()
    if (stored) return stored
    return lastShotDescription(sb) || (sb?.image_prompt || sb?.imagePrompt || '').trim()
  }

  const pendingFrameKeys = ref([])
  const uploadingFrameKeys = ref([])
  function frameKey(id, type) { return `${id}:${type}` }
  function isPendingFrame(id, type) { return pendingFrameKeys.value.includes(frameKey(id, type)) }
  function isUploadingFrame(id, type) { return uploadingFrameKeys.value.includes(frameKey(id, type)) }

  function applyFramePath(sb, frameType, path) {
    const field = frameType === 'first_frame' ? 'first_frame_image' : 'last_frame_image'
    const camel = frameType === 'first_frame' ? 'firstFrameImage' : 'lastFrameImage'
    sb[field] = path
    sb[camel] = path
  }

  async function pollFrameTask(taskId, sbId, frameType) {
    const key = frameKey(sbId, frameType)
    for (let i = 0; i < 80; i++) {
      await sleep(2500)
      try {
        const row = await taskAPI.get(taskId)
        const status = row?.status
        if (status === 'completed') {
          await refresh()
          pendingFrameKeys.value = pendingFrameKeys.value.filter(k => k !== key)
          return
        }
        if (status === 'failed' || status === 'cancelled') {
          pendingFrameKeys.value = pendingFrameKeys.value.filter(k => k !== key)
          toast.error(row?.error_msg || row?.errorMsg || '首尾帧图生成失败')
          return
        }
      } catch { /* keep polling */ }
    }
    pendingFrameKeys.value = pendingFrameKeys.value.filter(k => k !== key)
  }

  async function genStoryboardFrame(sb, frameType) {
    if (!sb?.id) return
    const prompt = frameType === 'first_frame' ? effectiveFirstFramePrompt(sb) : effectiveLastFramePrompt(sb)
    if (!prompt) {
      toast.error('请先填写分镜描述或图片提示词')
      return
    }
    const key = frameKey(sb.id, frameType)
    if (!pendingFrameKeys.value.includes(key)) pendingFrameKeys.value.push(key)
    try {
      const task = await taskAPI.generate({
        type: 'image',
        storyboard_id: sb.id,
        drama_id: dramaId,
        prompt,
        frame_type: frameType,
        model: bareModelName(imageModel.value) || undefined,
        config_id: ownerConfigId(imageModelOptions.value, imageModel.value),
      })
      toast.success(frameType === 'first_frame' ? '首帧生成中' : '尾帧生成中')
      if (task?.id) pollFrameTask(task.id, sb.id, frameType)
      else {
        await refresh()
        pendingFrameKeys.value = pendingFrameKeys.value.filter(k => k !== key)
      }
    } catch (e) {
      pendingFrameKeys.value = pendingFrameKeys.value.filter(k => k !== key)
      toast.error(e.message)
    }
  }

  function uploadStoryboardFrame(sb, frameType) {
    if (!sb?.id) return
    const key = frameKey(sb.id, frameType)
    pickFile('image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp', async (file) => {
      if (!uploadingFrameKeys.value.includes(key)) uploadingFrameKeys.value.push(key)
      try {
        const res = await uploadAPI.image(file)
        const field = frameType === 'first_frame' ? 'first_frame_image' : 'last_frame_image'
        applyFramePath(sb, frameType, res.path)
        await storyboardAPI.update(sb.id, { [field]: res.path })
        toast.success(frameType === 'first_frame' ? '首帧已上传' : '尾帧已上传')
      } catch (e) {
        toast.error(e.message)
      } finally {
        uploadingFrameKeys.value = uploadingFrameKeys.value.filter(k => k !== key)
      }
    })
  }

  function clearStoryboardFrame(sb, frameType) {
    const field = frameType === 'first_frame' ? 'first_frame_image' : 'last_frame_image'
    applyFramePath(sb, frameType, '')
    storyboardAPI.update(sb.id, { [field]: '' }).catch(e => toast.error(e.message))
  }

  function firstLastConfigId() {
    return lockedFirstLastConfigId.value || [...firstLastConfigs.value].filter(c => c.is_active).sort((a, b) => (b.priority || 0) - (a.priority || 0))[0]?.id
  }

  async function genFirstLastVid(sb) {
    if (!sb?.id) return
    if (!hasFirstLastService.value) {
      toast.error('请先在设置中添加首尾帧服务')
      return
    }
    const first = firstFrameOf(sb)
    const last = lastFrameOf(sb)
    if (!first || !last) {
      toast.error(!first && !last ? '请先配齐首帧和尾帧' : (!first ? '请先配齐首帧' : '请先配齐尾帧'))
      return
    }
    try {
      delete failedVideoMessages.value[sb.id]
      if (!isPendingVideo(sb.id)) pendingVideoIds.value.push(sb.id)
      const generation = await taskAPI.generate({
        type: 'video',
        reference_mode: 'first_last',
        storyboard_id: sb.id,
        drama_id: dramaId,
        prompt: resolveFirstLastPromptRefs(sb),
        duration: Number(videoDuration.value || sb.duration || 10),
        aspect_ratio: dramaAspectRatio.value,
        first_frame_url: first,
        last_frame_url: last,
        reference_image_urls: getShotReferenceImages(sb),
        config_id: firstLastConfigId(),
      })
      toast.success('首尾帧视频生成中')
      await refresh()
      pollVideoGeneration(generation?.id, sb.id)
    } catch (e) {
      pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== sb.id)
      failedVideoMessages.value = {
        ...failedVideoMessages.value,
        [sb.id]: e.message || '视频生成失败',
      }
      toast.error(e.message)
    }
  }

  function batchSelectedReferenceVideos() {
    const selected = sbs.value.filter(sb => selectedSbIds.value.includes(sb.id))
    if (!selected.length) return
    selected.forEach(sb => genVid(sb))
  }

  function batchFirstLastVideos(list) {
    const selected = Array.isArray(list)
      ? list
      : sbs.value.filter(sb => selectedSbIds.value.includes(sb.id))
    if (!selected.length) return
    if (!hasFirstLastService.value) {
      toast.error('请先在设置中添加首尾帧服务')
      return
    }
    const ready = selected.filter(sb => firstFrameOf(sb) && lastFrameOf(sb))
    const skipped = selected.length - ready.length
    if (skipped) toast.warning(`已跳过 ${skipped} 条缺帧分镜`)
    if (!ready.length) {
      toast.error('所选分镜均未配齐首尾帧')
      return
    }
    ready.forEach(sb => genFirstLastVid(sb))
  }

  async function genVid(sb) {
    const referenceImages = getShotReferenceImages(sb)
    const params = {
      storyboard_id: sb.id,
      drama_id: dramaId,
      prompt: resolveVideoPromptRefs(sb),
      duration: Number(videoDuration.value || sb.duration || 10),
      aspect_ratio: dramaAspectRatio.value,
      generate_audio: true,
      model: bareModelName(videoModel.value) || undefined,
      config_id: ownerConfigId(videoModelOptions.value, videoModel.value),
      reference_image_urls: referenceImages,
      reference_video_urls: videoRefVideoUrls.value,
      reference_audio_urls: videoRefAudioUrls.value,
    }
    if (params.reference_audio_urls.length && !referenceImages.length && !params.reference_video_urls.length) {
      toast.error('参考音频需要至少 1 个参考图片或视频')
      return
    }
    if (!params.prompt && !referenceImages.length && !params.reference_video_urls.length && !params.reference_audio_urls.length) {
      toast.error('需要至少一个参考素材或视频提示词')
      return
    }
    try {
      delete failedVideoMessages.value[sb.id]
      if (!isPendingVideo(sb.id)) pendingVideoIds.value.push(sb.id)
      const generation = await taskAPI.generate({ type: 'video', ...params })
      toast.success('视频生成中')
      await refresh()
      pollVideoGeneration(generation?.id, sb.id)
    } catch (e) {
      pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== sb.id)
      failedVideoMessages.value = {
        ...failedVideoMessages.value,
        [sb.id]: e.message || '视频生成失败',
      }
      toast.error(e.message)
    }
  }
  async function pollVideoGeneration(generationId, storyboardId) {
    const key = `${storyboardId}:${generationId || 'watch'}`
    if (videoPollInFlight.has(key)) return
    videoPollInFlight.add(key)
    try {
      if (!generationId) {
        // 无任务 id 时只能靠「状态离开 processing」；不能用是否已有 video_url（重新生成时旧片还在）
        for (let i = 0; i < 120; i++) {
          await sleep(4000)
          await refresh()
          if (!isPendingVideo(storyboardId)) return
          const still = genTasks.value.some((t) =>
            (t.type === 'video')
            && Number(t.storyboard_id ?? t.storyboardId) === Number(storyboardId)
            && (t.status === 'processing' || t.status === 'pending'),
          )
          if (!still) {
            pendingVideoIds.value = pendingVideoIds.value.filter((item) => item !== storyboardId)
            return
          }
        }
        pendingVideoIds.value = pendingVideoIds.value.filter((item) => item !== storyboardId)
        return
      }
      for (let i = 0; i < 120; i++) {
        await sleep(4000)
        try {
          const res = await taskAPI.get(generationId)
          await refresh()
          if (res?.status === 'completed') {
            pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
            delete failedVideoMessages.value[storyboardId]
            toast.success('视频生成完成')
            return
          }
          if (res?.status === 'cancelled') {
            pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
            delete failedVideoMessages.value[storyboardId]
            return
          }
          if (res?.status === 'failed') {
            pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
            failedVideoMessages.value = {
              ...failedVideoMessages.value,
              [storyboardId]: res?.error_msg || res?.errorMsg || '视频生成失败',
            }
            toast.error(failedVideoMessages.value[storyboardId])
            return
          }
        } catch {}
      }
      pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
      failedVideoMessages.value = {
        ...failedVideoMessages.value,
        [storyboardId]: '视频生成超时',
      }
      toast.error('视频生成超时')
    } finally {
      videoPollInFlight.delete(key)
    }
  }

  function findActiveVideoTaskId(storyboardId) {
    const rows = genTasks.value.filter((t) =>
      (t.type === 'video')
      && Number(t.storyboard_id ?? t.storyboardId) === Number(storyboardId)
      && (t.status === 'processing' || t.status === 'pending'),
    )
    if (rows.length) return rows[0].id
    return null
  }

  async function cancelVid(sb) {
    if (!sb?.id || cancellingVideoIds.value.includes(sb.id)) return
    cancellingVideoIds.value = [...cancellingVideoIds.value, sb.id]
    try {
      let taskId = findActiveVideoTaskId(sb.id)
      if (!taskId) {
        const rows = await taskAPI.list({ type: 'video', storyboard_id: sb.id })
        const active = (Array.isArray(rows) ? rows : [])
          .filter(t => t.status === 'processing' || t.status === 'pending')
          .sort((a, b) => String(b.createdAt || b.created_at || '').localeCompare(String(a.createdAt || a.created_at || '')))
        taskId = active[0]?.id
      }
      if (!taskId) {
        pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== sb.id)
        toast.info('没有进行中的视频任务')
        return
      }
      await taskAPI.cancel(taskId)
      pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== sb.id)
      delete failedVideoMessages.value[sb.id]
      await loadGenTasks()
      toast.success('已取消视频生成')
    } catch (e) {
      toast.error(e.message || '取消失败')
    } finally {
      cancellingVideoIds.value = cancellingVideoIds.value.filter(id => id !== sb.id)
    }
  }

  async function cancelAllVids() {
    if (!epId.value || cancellingAllVideos.value) return
    if (!pendingVideoIds.value.length) {
      toast.info('没有进行中的视频任务')
      return
    }
    cancellingAllVideos.value = true
    try {
      const result = await taskAPI.cancelAll({ episode_id: epId.value, type: 'video' })
      pendingVideoIds.value = []
      cancellingVideoIds.value = []
      await loadGenTasks()
      await refresh()
      const n = result?.cancelled ?? result?.ids?.length ?? 0
      toast.success(n ? `已取消 ${n} 个视频任务` : '已取消全部视频任务')
    } catch (e) {
      toast.error(e.message || '全部取消失败')
    } finally {
      cancellingAllVideos.value = false
    }
  }

  function batchVideos() {
    const missing = sbs.value.filter(s => !hasVid(s) && !isPendingVideo(s.id))
    if (!missing.length) {
      toast.info('所有镜头视频已生成')
      return
    }
    const pendingIds = missing.map(s => s.id)
    pendingIds.forEach(id => {
      const sb = sbs.value.find(item => item.id === id)
      if (sb) genVid(sb)
    })
    if (pendingIds.length) {
      pendingVideoIds.value = [...new Set([...pendingVideoIds.value, ...pendingIds])]
      watchAsyncResult(() => pendingIds.every(id => {
        const target = sbs.value.find(s => s.id === id)
        const done = !!getVideoUrl(target)
        if (done) pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== id)
        return done
      }), 80, 4000)
    }
  }
  async function doMerge(ids) {
    const storyboardIds = Array.isArray(ids) ? ids : undefined
    if (storyboardIds && !storyboardIds.length) {
      toast.error('请先勾选至少一个已生成视频的镜头')
      return
    }
    try {
      await mergeAPI.merge(epId.value, storyboardIds)
      toast.success('拼接中...')
    } catch (e) {
      toast.error(e.message || '拼接失败')
      return
    }
    const poll = setInterval(async () => {
      try { mergeData.value = await mergeAPI.status(epId.value) } catch {}
      if (mergeData.value?.status === 'completed' || mergeData.value?.status === 'failed') {
        clearInterval(poll)
        if (mergeData.value.status === 'completed') {
          toast.success('拼接完成')
          loadExportMerges()
        } else {
          toast.error(mergeData.value?.error_msg || mergeData.value?.errorMsg || '拼接失败')
        }
      }
    }, 3000)
  }
  async function loadConfigs() {
    try {
      const [imgCfgs, img2imgCfgs, vidCfgs, firstLastCfgs, txtCfgs] = await Promise.all([
        aiConfigAPI.list('image'),
        aiConfigAPI.list('img2img'),
        aiConfigAPI.list('video'),
        aiConfigAPI.list('first_last'),
        aiConfigAPI.list('text'),
      ])
      imageConfigs.value = imgCfgs || []
      img2imgConfigs.value = img2imgCfgs || []
      videoConfigs.value = vidCfgs || []
      firstLastConfigs.value = firstLastCfgs || []
      textConfigs.value = txtCfgs || []
    } catch (e) { console.error('Failed to load AI configs', e) }
  }

  onMounted(async () => {
    window.addEventListener('keydown', handleImageViewerKeydown)
    await refresh()
    loadConfigs()
    syncExtractStatus()
  })
  return reactive({
    drama, episode, chars, scenes, propItems, sbs, mergeData, dramaId, episodeNumber,
    panel, scriptStep, prodTab, prodTabIdx, localRaw, localScript, rawContent, scriptContent, epId,
    rawLen, scriptLen, mergeUrl, rn, rt,     chatModel, imageModel, videoModel,
    textModelOptions, imageModelOptions, videoModelOptions, textModelMultiCfg, imageModelMultiCfg, videoModelMultiCfg,
    assistantUiContext,
    taskDrawer, genTaskActiveCount, genTaskRows, genTaskDoneCount, genTaskFailedCount,
    sidebarSections, sidebarJumpSteps, activeSubStepKey, sectionState, goSubStep,
    currentSubStageLabel, pipelineProgress, pipelineTotal, refresh, openTaskDrawer, closeTaskDrawer, loadGenTasks,
    genTaskKindLabel, genTaskStatusLabel, genTaskStateClass, genTaskPreviewSrc, genTaskDuration, openImageViewer,
    productionBlockMessage, productionBlockActionLabel, goProductionBlockTarget, canExport, goNextProd,
    prevStepLabel, nextStepLabel, canGoNext, goPrevStep, goNextStep, showBottomBubble, bubbleSteps, activeBubbleKey,
    prodTabDefs, saveRaw, saveScr, doRewrite, skipRewrite, assetImportOpen, storyboardImportOpen, onAssetImported, onStoryboardImported,
    EXTRACT_TARGETS, extractingTargets, extractingLabels, isExtracting, doExtract, doExtractAll,
    exportMerges, exportSelectedReadyIds, exportReadyIds, isExportSelected, toggleExportSelect, toggleSelectAllExport,
    loadExportMerges, doMerge, shotVidCount, hasVid, getVideoUrl, formatHistoryTime,
    assetDetail, assetDetailDraft, assetImageHistory, assetPreviewImageUrl, assetDetailDisplayUrl,
    openAssetDetail, closeAssetDetail, saveAssetDetail, assetTypeLabel, assetDetailTitle, assetImageSrc, assetDownloadName,
    characterAppearanceValue, characterStylingValue, characterVisualSummary, sceneDescriptionValue, sceneLightingValue,
    isCurrentAssetImage, previewAssetHistoryImage, setAssetAsMainImage, removeAssetHistoryImage,
    assetCreate, assetCreateDraft, assetCreateTypeLabel, openAssetCreate, saveAssetCreate,
    assetPick, assetPickTypeLabel, openAssetPick, toggleAssetPick, confirmAssetPick, assetPickSubtitle,
    assetDelete, assetDeleteTypeLabel, assetDeleteName, assetDeleteTitle, assetDeleteMessage,
    assetDeleteLibraryLoading, confirmDeleteAsset, confirmDeleteAssetFromLibrary,
    assetSelectMode, selectedAssetCount, allAssetsSelected, isAssetSelected, enterAssetSelectMode, exitAssetSelectMode,
    toggleAssetSelect, toggleSelectAllAssets, onAssetCardClick, askBatchDeleteAssets,
    sbDelete, confirmDeleteStoryboard, askDeleteStoryboard, askDeleteAsset,
    duplicateAsset, duplicatingAsset,
    imageViewer, closeImageViewer, activeMerge, handleImageViewerKeydown,
    visualChars, lockedImageConfigLabel, lockedVideoConfigLabel, lockedFirstLastConfigLabel, hasFirstLastService,
    effectiveImageConfigLabel, effectiveVideoConfigLabel,
    assetReadyCount, assetTotalCount, batchCharImages, batchSceneImages, batchPropImages,
    isPendingCharImage, isPendingSceneImage, isPendingPropImage, genCharImg, genSceneImg, genPropImg,
    isUploadingAsset, uploadAssetImage, openAssetImport,
    isGeneratingPrompt, onAssetPromptInput, assetPromptDraft, assetPromptDirty, assetEditPrompt, genAssetFinalPrompt, copyAssetFinalPrompt,
    assetFinalPrompt, isAssetImagePending, savingAssetDetail, lockedImg2imgConfigLabel, editCharImg, editSceneImg,
    selectedSb, selectedSbIds, sbSelectMode, isSbSelected, toggleSbSelect, toggleSelectAllSbs, onShotCardClick,
    selectedVideoTaskNumber,
    selectMissingSbs, exitSbSelectMode, generateSelectedVideoPrompts, videoPromptBatch, videoPromptGeneratingIds,
    batchVideoPrompts, doBreakdown, genVideoPrompt, addStoryboard, creatingSb,
    updateField, getStoryboardCharacters, getStoryboardCharacterIds, getStoryboardProps, getStoryboardPropIds,
    getSceneName, getStoryboardScene, toggleStoryboardCharacter, toggleStoryboardProp, totalDuration,
    firstFrameOf, lastFrameOf, frameSrc, framesReadyCount, isPendingFrame, isUploadingFrame,
    genStoryboardFrame, uploadStoryboardFrame, clearStoryboardFrame, mentionOptions, firstLastMentionOptions, refBindableAssets, toggleShotBind,
    videoTaskRows, videoTaskDoneCount, videoTaskFailedCount, videoTaskState, videoTaskStatusLabel, videoTaskActionLabel,
    isPendingVideo, videoFailMessage, cancellingVideoIds, cancellingAllVideos, cancelVid, cancelAllVids,
    genVid, genFirstLastVid, batchVideos, batchSelectedReferenceVideos, batchFirstLastVideos,
    previewVideoUrl, sbVideoHistory, previewHistoryVideo, setAsMainVideo, removeHistoryVideo, taskVideoPath, isCurrentVideo,
    getShotReferenceAssets, getShotReferenceImages, videoRefImageUrls, videoRefVideoUrls, videoRefAudioUrls,
    refImageUsedCount, refImageFull, uploadRefMedia, uploadingRefMedia, removeRefMedia, videoDuration, dramaAspectRatio,
    pendingVideoIds,
    thumbOf, thumbFallback, posterOf, toast,
  })
}
