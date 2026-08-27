<template>
  <div class="studio" v-if="wb.drama">
    <EpisodeTopbar />
    <div class="studio-body" :class="{ 'has-assistant': assistantOpen }">
      <EpisodeSidebar />
      <main class="main">
        <EpisodeScriptPanel v-if="wb.panel === 'script'" />
        <EpisodeProductionPanel v-else-if="wb.panel === 'production'" />
        <EpisodeExportPanel v-else />
        <EpisodeTaskDrawer />
        <EpisodeBottomBubble />
        <EpisodeAssetDetailDialog />
        <EpisodeImageViewer />
        <EpisodeMergeViewer />
        <EpisodeAssetCreateDialog />
        <EpisodeAssetPickDialog />
        <AssetImportDialog
          :open="wb.assetImportOpen"
          :drama-id="wb.dramaId"
          :episode-id="wb.epId"
          @close="wb.assetImportOpen = false"
          @imported="wb.onAssetImported"
        />
        <StoryboardImportDialog
          :open="wb.storyboardImportOpen"
          :episode-id="wb.epId"
          :has-existing="!!wb.sbs.length"
          @close="wb.storyboardImportOpen = false"
          @imported="wb.onStoryboardImported"
        />
        <ConfirmDialog
          :open="wb.assetDelete.open"
          :title="`从本集移除${wb.assetDeleteTypeLabel}`"
          :message="`确定将${wb.assetDeleteTypeLabel}「${wb.assetDeleteName}」从本集移除吗？其他集与项目素材库仍保留。`"
          confirm-text="移除"
          loading-text="移除中..."
          :loading="wb.assetDelete.loading"
          @confirm="wb.confirmDeleteAsset"
          @cancel="wb.assetDelete.open = false"
        />
        <ConfirmDialog
          :open="wb.sbDelete.open"
          title="删除分镜"
          :message="`确定删除分镜 #${String(wb.sbDelete.index + 1).padStart(2, '0')} 吗？相关视频生成记录将一并删除。`"
          :loading="wb.sbDelete.loading"
          @confirm="wb.confirmDeleteStoryboard"
          @cancel="wb.sbDelete.open = false"
        />
      </main>
      <AssistantPanel variant="dock" />
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'studio' })

const route = useRoute()
const wb = useEpisodeWorkbench(Number(route.params.id), Number(route.params.episodeNumber))
provideEpisodeWorkbench(wb)
const assistantOpen = useState('assistant-open', () => {
  try { return localStorage.getItem('huobao:assistant:open') === '1' } catch { return false }
})
</script>

<style src="./episode.css"></style>
