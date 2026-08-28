<template>
  <Teleport to="body">
    <div v-if="open" class="overlay" @click.self="emit('cancel')">
      <div class="dialog confirm-dialog" role="alertdialog" aria-modal="true" :aria-label="title">
        <div class="confirm-icon">
          <Trash2 :size="20" :stroke-width="1.8" />
        </div>
        <h2 class="confirm-title">{{ title }}</h2>
        <p class="confirm-message">{{ message }}</p>
        <div class="confirm-actions" :class="{ 'has-secondary': !!secondaryConfirmText }">
          <button type="button" class="btn" :disabled="loading" @click="emit('cancel')">取消</button>
          <button type="button" class="btn confirm-danger-btn" :disabled="loading" @click="emit('confirm')">
            <Loader2 v-if="loading && !secondaryLoading" :size="13" class="animate-spin" />
            {{ loading && !secondaryLoading ? loadingText : confirmText }}
          </button>
          <button
            v-if="secondaryConfirmText"
            type="button"
            class="btn confirm-danger-btn confirm-secondary-btn"
            :disabled="loading"
            @click="emit('secondary-confirm')"
          >
            <Loader2 v-if="secondaryLoading" :size="13" class="animate-spin" />
            {{ secondaryLoading ? secondaryLoadingText : secondaryConfirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { Trash2, Loader2 } from 'lucide-vue-next'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '确认删除' },
  message: { type: String, default: '' },
  confirmText: { type: String, default: '删除' },
  loadingText: { type: String, default: '删除中...' },
  loading: { type: Boolean, default: false },
  /** 可选第二危险操作（如「从共享库删除」）；Enter 仍触发主确认 */
  secondaryConfirmText: { type: String, default: '' },
  secondaryLoadingText: { type: String, default: '删除中...' },
  secondaryLoading: { type: Boolean, default: false },
})

const emit = defineEmits(['confirm', 'secondary-confirm', 'cancel'])

function onKeydown(e) {
  if (e.key === 'Escape') emit('cancel')
  if (e.key === 'Enter' && !props.loading) emit('confirm')
}

watch(() => props.open, (v) => {
  if (v) window.addEventListener('keydown', onKeydown)
  else window.removeEventListener('keydown', onKeydown)
})

onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<style scoped>
.confirm-dialog {
  width: 400px;
  max-width: calc(100vw - 48px);
  padding: 28px 24px 20px;
  align-items: center;
  text-align: center;
}
.confirm-icon {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--action-danger-bg);
  color: var(--action-danger);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
}
.confirm-title {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text-0);
}
.confirm-message {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.65;
  color: var(--text-2);
  max-width: 320px;
  word-break: break-word;
}
.confirm-actions {
  display: flex;
  gap: 10px;
  width: 100%;
  margin-top: 22px;
}
.confirm-actions.has-secondary {
  flex-wrap: wrap;
}
.confirm-actions .btn { flex: 1; }
.confirm-actions.has-secondary .btn {
  flex: 1 1 calc(50% - 5px);
  min-width: 0;
}
.confirm-actions.has-secondary .confirm-secondary-btn {
  flex: 1 1 100%;
}
.confirm-danger-btn {
  background: var(--action-danger);
  color: #fff;
}
.confirm-danger-btn:hover { background: #d70015; color: #fff; }
.confirm-danger-btn:disabled { opacity: 0.6; }
.confirm-secondary-btn {
  background: transparent;
  color: var(--action-danger);
  border: 1px solid var(--action-danger);
}
.confirm-secondary-btn:hover {
  background: var(--action-danger-bg);
  color: var(--action-danger);
}
</style>
