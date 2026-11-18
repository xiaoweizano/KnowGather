<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { useI18n } from '../i18n/useI18n'

const props = defineProps<{
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}>()

const emit = defineEmits<{ confirm: []; close: [] }>()
const { t } = useI18n()

function cancel(): void {
  emit('close')
}

function handleKeydown(event: KeyboardEvent): void {
  if (!props.open) return
  if (event.key === 'Escape') {
    event.preventDefault()
    cancel()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="props.open" class="dialog-backdrop" role="presentation" @mousedown.self="cancel">
        <section
          class="confirm-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          @keydown="handleKeydown"
        >
          <span class="confirm-icon" :class="{ danger: props.danger }">
            <AppIcon :name="props.danger ? 'trash' : 'info'" :size="18" />
          </span>
          <h2 id="confirm-title">{{ props.title }}</h2>
          <p v-if="props.description">{{ props.description }}</p>
          <div class="confirm-actions">
            <button type="button" class="confirm-cancel" @click="cancel">
              {{ props.cancelLabel ?? t('common.cancel') }}
            </button>
            <button
              type="button"
              class="confirm-ok"
              :class="{ danger: props.danger }"
              autofocus
              @click="emit('confirm')"
            >
              {{ props.confirmLabel ?? t('common.confirm') }}
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-backdrop {
  position: fixed;
  z-index: 300;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(28, 24, 44, 0.32);
  backdrop-filter: blur(2px);
}

.confirm-dialog {
  display: flex;
  width: min(400px, 100%);
  flex-direction: column;
  gap: 10px;
  padding: 20px;
  border: 1px solid var(--border-soft);
  border-radius: 14px;
  background: var(--panel-strong);
  box-shadow: var(--shadow-float);
}

.confirm-icon {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 10px;
  background: var(--accent-faint);
  color: var(--accent);
}

.confirm-icon.danger {
  background: var(--state-danger-bg);
  color: var(--state-danger-fg);
}

.confirm-dialog h2 {
  margin: 2px 0 0;
  color: var(--text-primary);
  font-size: 15px;
}

.confirm-dialog p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 11.5px;
  line-height: 1.6;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.confirm-actions button {
  height: 32px;
  padding: 0 14px;
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
}

.confirm-cancel {
  border: 1px solid var(--border-strong);
  background: var(--panel-strong);
  color: var(--text-secondary);
}

.confirm-ok {
  border: 1px solid var(--accent);
  background: var(--accent);
  color: white;
}

.confirm-ok.danger {
  border-color: var(--danger);
  background: var(--danger);
}
</style>
