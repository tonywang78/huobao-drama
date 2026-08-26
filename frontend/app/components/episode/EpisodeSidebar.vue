<script setup>
import { Loader2, Plus, X, ListTodo, Upload, Play, MapPin } from 'lucide-vue-next'

const wb = useEpisodeWorkbenchInject()
</script>

<template>
    <aside class="sidebar">
      <nav class="pipeline">
        <div
          v-for="section in wb.sidebarSections"
          :key="section.id"
          :class="['pipe-section', 'is-' + wb.sectionState(section.id)]"
        >
          <div class="pipe-section-label">
            <span v-if="wb.sectionState(section.id) !== 'none'" class="pipe-section-state">
              <svg v-if="wb.sectionState(section.id) === 'done'" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span v-else-if="wb.sectionState(section.id) === 'active'" class="pipe-section-pulse" />
              <span v-else class="pipe-section-dot" />
            </span>
            <span>{{ section.label }}</span>
            <span v-if="wb.sectionState(section.id) === 'active'" class="pipe-section-tag">进行中</span>
          </div>
          <button
            v-for="item in section.items"
            :key="item.key"
            :class="['pipe-item pipe-item-sub', {
              active: wb.activeSubStepKey === item.key,
              done: wb.sectionState(section.id) === 'done',
              doing: wb.sectionState(section.id) === 'active',
            }]"
            @click="wb.goSubStep(item.key)"
          >
            <span class="pipe-icon" :class="wb.sectionState(section.id) === 'done' ? 'icon-done' : wb.activeSubStepKey === item.key ? 'icon-active' : ''">
              <svg v-if="wb.sectionState(section.id) === 'done'" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span v-else-if="wb.sectionState(section.id) === 'active'" class="pipe-item-pulse" />
              <component v-else :is="item.icon" :size="11" />
            </span>
            <span class="pipe-copy">
              <span class="pipe-label">{{ item.label }}</span>
              <span v-if="item.desc" class="pipe-sub">{{ item.desc }}</span>
            </span>
          </button>
        </div>
      </nav>

      <!-- Bottom: Refresh -->
      <div class="sidebar-bottom">
        <div class="sidebar-jumper" v-if="wb.sidebarJumpSteps.length">
          <button
            v-for="step in wb.sidebarJumpSteps"
            :key="step.key"
            :class="['sidebar-jump-dot', { active: wb.activeSubStepKey === step.key }]"
            @click="wb.goSubStep(step.key)"
            :title="step.label"
          ></button>
        </div>
        <button class="wb.refresh-btn" @click="wb.refresh">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          刷新数据
        </button>
      </div>
    </aside>
</template>
