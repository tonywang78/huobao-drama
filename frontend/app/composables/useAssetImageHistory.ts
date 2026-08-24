import { ref, watch, computed, type Ref } from 'vue'
import { toast } from 'vue-sonner'
import { characterAPI, sceneAPI, propAPI, taskAPI } from './useApi'

export type AssetKind = 'character' | 'scene' | 'prop'

export function normalizeAssetImageSrc(raw: string) {
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) return raw
  return `/${raw}`
}

export function taskImagePath(t: any) {
  return t?.local_path || t?.localPath || t?.result_url || t?.resultUrl || ''
}

export function taskCreatedAt(t: any) {
  return t?.created_at || t?.createdAt || ''
}

export function formatHistoryTime(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function currentImageFromItem(item: any) {
  return item?.image_url || item?.imageUrl || item?.local_path || item?.localPath || ''
}

export function useAssetImageHistory(
  assetType: Ref<AssetKind | ''>,
  assetItem: Ref<any | null>,
) {
  const history = ref<any[]>([])
  const previewImageUrl = ref('')

  const displayImageUrl = computed(() => {
    const raw = previewImageUrl.value || currentImageFromItem(assetItem.value)
    return normalizeAssetImageSrc(raw)
  })

  function isCurrentImage(t: any) {
    const p = taskImagePath(t)
    return !!p && p === currentImageFromItem(assetItem.value)
  }

  async function loadHistory() {
    previewImageUrl.value = ''
    const type = assetType.value
    const item = assetItem.value
    if (!type || !item?.id) {
      history.value = []
      return
    }
    try {
      const params: {
        type: 'image'
        character_id?: number
        scene_id?: number
        prop_id?: number
      } = { type: 'image' }
      if (type === 'character') params.character_id = item.id
      else if (type === 'scene') params.scene_id = item.id
      else params.prop_id = item.id
      const rows = await taskAPI.list(params)
      history.value = (Array.isArray(rows) ? rows : [])
        .filter(t => t.status === 'completed' && taskImagePath(t))
        .sort((a, b) => taskCreatedAt(b).localeCompare(taskCreatedAt(a)))
    } catch {
      history.value = []
    }
  }

  watch(
    () => [assetType.value, assetItem.value?.id, currentImageFromItem(assetItem.value)],
    () => { loadHistory() },
  )

  function previewHistoryImage(t: any) {
    previewImageUrl.value = isCurrentImage(t) ? '' : taskImagePath(t)
  }

  async function setAsMainImage() {
    const type = assetType.value
    const item = assetItem.value
    if (!type || !item?.id || !previewImageUrl.value) return false
    const path = previewImageUrl.value
    const payload = {
      image_url: path,
      local_path: path,
      skip_image_history: true,
    }
    try {
      if (type === 'character') await characterAPI.update(item.id, payload)
      else if (type === 'scene') await sceneAPI.update(item.id, payload)
      else await propAPI.update(item.id, payload)
      item.image_url = path
      item.imageUrl = path
      item.local_path = path
      item.localPath = path
      previewImageUrl.value = ''
      toast.success('已设为主图')
      await loadHistory()
      return true
    } catch (e: any) {
      toast.error(e.message || '设置失败')
      return false
    }
  }

  async function removeHistoryImage(t: any) {
    try {
      await taskAPI.del(t.id)
      history.value = history.value.filter(x => x.id !== t.id)
      if (previewImageUrl.value === taskImagePath(t)) previewImageUrl.value = ''
      toast.success('已删除该历史记录')
    } catch (e: any) {
      toast.error(e.message || '删除失败')
    }
  }

  return {
    history,
    previewImageUrl,
    displayImageUrl,
    loadHistory,
    isCurrentImage,
    previewHistoryImage,
    setAsMainImage,
    removeHistoryImage,
    formatHistoryTime,
    taskImagePath,
    taskCreatedAt,
  }
}
