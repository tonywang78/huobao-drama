<script setup>
import { ListTodo, Sparkles } from 'lucide-vue-next'
import ModelSelect from '~/components/ModelSelect.vue'
const wb = useEpisodeWorkbenchInject()
const assistant = useStudioAssistant()
</script>

<template>
    <header class="studio-topbar">
      <div class="studio-topbar-main">
        <button class="back-btn topbar-back" @click="navigateTo(`/drama/${wb.dramaId}`)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          返回项目
        </button>
        <div class="studio-identity">
          <h1 class="studio-title">{{ wb.drama.title }}</h1>
          <span class="studio-episode-chip">第 {{ wb.episodeNumber }} 集</span>
          <div class="studio-meta-row">
            <span class="studio-meta-pill">{{ wb.currentSubStageLabel }}</span>
            <span class="studio-meta-pill is-progress">{{ wb.pipelineProgress }}/{{ wb.pipelineTotal }}</span>
            <span class="studio-meta-inline">{{ wb.chars.length }} 角色 · {{ wb.sbs.length }} 段落</span>
          </div>
        </div>
      </div>

      <div class="studio-topbar-side">
        <div class="studio-model-picks">
          <ModelSelect
            v-if="wb.textModelOptions.length"
            v-model="wb.chatModel"
            label="文本"
            :options="wb.textModelOptions"
            :default-label="`默认 · ${wb.textModelOptions[0].model}`"
            :show-config="wb.textModelMultiCfg"
          />
          <ModelSelect
            v-if="wb.imageModelOptions.length"
            v-model="wb.imageModel"
            label="图片"
            :options="wb.imageModelOptions"
            :default-label="`默认 · ${wb.imageModelOptions[0].model}`"
            :show-config="wb.imageModelMultiCfg"
          />
          <ModelSelect
            v-if="wb.videoModelOptions.length"
            v-model="wb.videoModel"
            label="视频"
            :options="wb.videoModelOptions"
            :default-label="`默认 · ${wb.videoModelOptions[0].model}`"
            :show-config="wb.videoModelMultiCfg"
          />
        </div>
        <div class="studio-actions">
          <button class="btn" @click="wb.refresh">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            刷新
          </button>
          <button class="btn task-drawer-trigger" @click="wb.openTaskDrawer">
            <ListTodo :size="12" />
            任务
            <span v-if="wb.genTaskActiveCount" class="task-drawer-badge">{{ wb.genTaskActiveCount }}</span>
          </button>
          <button class="btn" :class="{ 'is-on': assistant.open }" @click="assistant.toggle()">
            <Sparkles :size="12" />
            助手
          </button>
          <button class="btn btn-primary" @click="wb.panel = wb.mergeUrl ? 'export' : (wb.sbs.length ? 'production' : 'script')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            {{ wb.mergeUrl ? '查看成片' : (wb.sbs.length ? '继续制作' : '开始制作') }}
          </button>
        </div>
      </div>
    </header>
</template>
