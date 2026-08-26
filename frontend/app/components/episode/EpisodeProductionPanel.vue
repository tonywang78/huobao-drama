<script setup>
const wb = useEpisodeWorkbenchInject()
</script>

<template>
  <div class="content-panel">
    <div v-if="wb.productionBlockMessage" class="step-empty" style="flex:1">
      <div class="empty-visual">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
      </div>
      <div class="empty-title">尚未准备就绪</div>
      <div class="empty-desc">{{ wb.productionBlockMessage }}</div>
      <button class="btn btn-primary" @click="wb.goProductionBlockTarget">{{ wb.productionBlockActionLabel }}</button>
    </div>
    <template v-else>
      <EpisodeAssetsPanel v-if="wb.prodTab === 'assets'" />
      <EpisodeStoryboardPanel v-else-if="wb.prodTab === 'storyboard'" />
      <EpisodeVideosPanel v-else-if="wb.prodTab === 'videos'" />
    </template>
  </div>
</template>
