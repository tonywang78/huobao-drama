<script setup>
import { Loader2, Plus, X, ListTodo, Upload, Play, MapPin } from 'lucide-vue-next'

const wb = useEpisodeWorkbenchInject()
</script>

<template>
      <div v-if="wb.showBottomBubble" class="step-bubble">
        <button
          v-if="wb.panel === 'script'"
          class="bubble-btn"
          :disabled="wb.scriptStep === 0"
          @click="wb.goPrevStep"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          {{ wb.prevStepLabel || '上一步' }}
        </button>
        <button
          v-else-if="wb.panel === 'production'"
          class="bubble-btn"
          :disabled="wb.prodTabIdx === 0"
          @click="wb.prodTabIdx = Math.max(0, wb.prodTabIdx - 1)"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          {{ wb.prodTabDefs[Math.max(0, wb.prodTabIdx - 1)]?.label || '上一步' }}
        </button>

        <div class="bubble-dots">
          <button
            v-for="step in wb.bubbleSteps"
            :key="step.key"
            :class="['bubble-dot', { current: step.key === wb.activeBubbleKey }]"
            @click="wb.goSubStep(step.key)"
            :title="step.label"
          ></button>
        </div>

        <button
          v-if="wb.panel === 'script'"
          class="bubble-btn primary"
          :disabled="!wb.canGoNext"
          @click="wb.goNextStep"
        >
          {{ wb.nextStepLabel || '下一步' }}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
        <button
          v-else-if="wb.panel === 'production'"
          class="bubble-btn primary"
          :disabled="wb.prodTab === 'videos' && !wb.canExport"
          @click="wb.goNextProd"
        >
          {{ wb.prodTabIdx < wb.prodTabDefs.length - 1 ? (wb.prodTabDefs[wb.prodTabIdx + 1]?.label || '下一步') : '进入导出' }}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
      </div>
</template>
