<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { useI18n } from '../i18n/useI18n'

const props = defineProps<{
  open: boolean
  title: string
  label?: string
  initialValue?: string
  placeholder?: string
  confirmLabel?: string
  maxlength?: number
  error?: string | null
}>()

const emit = defineEmits<{ submit: [value: string]; close: [] }>()
const { t } = useI18n()
const value = ref('')
const input = ref<HTMLInputElement | null>(null)
const localError = ref<string | null>(null)

watch(() => props.open, async (open) => {
  if (!open) return
  value.value = props.initialValue ?? ''
  localError.value = null
  await nextTick()
  input.value?.focus()
  input.value?.select()
})

function submit(): void {
  const next = value.value.trim()
  if (!next) {
    localError.value = t('library.validation.empty')
    return
  }
  emit('submit', next)
}

function close(): void {
  localError.value = null
  emit('close')
}

function handleKeydown(event: KeyboardEvent): void {
  if (!props.open) return
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="props.open" class="dialog-backdrop" role="presentation" @mousedown.self="close">
        <form class="prompt-dialog" role="dialog" aria-modal="true" aria-labelledby="prompt-title" novalidate @submit.prevent="submit" @keydown="handleKeydown">
          <header>
            <span class="prompt-icon"><AppIcon name="edit" :size="16" /></span>
            <h2 id="prompt-title">{{ props.title }}</h2>
          </header>
          <label v-if="props.label" class="prompt-label" for="prompt-input">{{ props.label }}</label>
          <input
            id="prompt-input"
            ref="input"
            v-model="value"
            :maxlength="props.maxlength ?? 120"
            :placeholder="props.placeholder"
            autocomplete="off"
          />
          <p v-if="localError || props.error" class="prompt-error" role="alert">{{ localError || props.error }}</p>
          <div class="prompt-actions">
            <button type="button" class="prompt-cancel" @click="close">{{ t('common.cancel') }}</button>
            <button type="submit" class="prompt-submit">{{ props.confirmLabel ?? t('common.confirm') }}</button>
          </div>
        </form>
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

.prompt-dialog {
  display: flex;
  width: min(400px, 100%);
  flex-direction: column;
  gap: 9px;
  padding: 20px;
  border: 1px solid var(--border-soft);
  border-radius: 14px;
  background: var(--panel-strong);
  box-shadow: var(--shadow-float);
}

.prompt-dialog header {
  display: flex;
  align-items: center;
  gap: 9px;
}

.prompt-icon {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 9px;
  background: var(--accent-faint);
  color: var(--accent);
}

.prompt-dialog h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 15px;
}

.prompt-label {
  color: var(--text-secondary);
  font-size: 10.5px;
}

.prompt-dialog input {
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  outline: none;
  background: var(--panel-muted);
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
}

.prompt-dialog input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-faint);
}

.prompt-error {
  margin: 0;
  color: var(--state-danger-fg);
  font-size: 10.5px;
}

.prompt-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.prompt-actions button {
  height: 32px;
  padding: 0 14px;
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
}

.prompt-cancel {
  border: 1px solid var(--border-strong);
  background: var(--panel-strong);
  color: var(--text-secondary);
}

.prompt-submit {
  border: 1px solid var(--accent);
  background: var(--accent);
  color: white;
}
</style>
