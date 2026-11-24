<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { useI18n } from '../i18n/useI18n'

/**
 * Confirms what a journal is promoted to: the document title and the category
 * it lands in. The content is copied by the store, never edited here.
 */
const props = defineProps<{
  open: boolean
  defaultTitle: string
  categories: ReadonlyArray<{ id: string; name: string }>
  defaultCategoryId?: string | null
  /** True when the journal already has a document; the copy is an update. */
  updating?: boolean
  busy?: boolean
}>()

const emit = defineEmits<{
  close: []
  submit: [options: { title: string; categoryId: string | null }]
}>()

const { t } = useI18n()
const title = ref('')
const categoryId = ref<string | null>(null)
const input = ref<HTMLInputElement | null>(null)

watch(() => props.open, async (open) => {
  if (!open) return
  title.value = props.defaultTitle
  categoryId.value = props.defaultCategoryId ?? null
  await nextTick()
  input.value?.focus()
  input.value?.select()
})

function submit(): void {
  if (props.busy) return
  emit('submit', {
    title: title.value.trim() || props.defaultTitle,
    categoryId: categoryId.value,
  })
}

function handleKeydown(event: KeyboardEvent): void {
  if (!props.open) return
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="props.open" class="dialog-backdrop" role="presentation" @mousedown.self="emit('close')">
        <form
          class="promote-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="promote-title"
          novalidate
          @submit.prevent="submit"
          @keydown="handleKeydown"
        >
          <header>
            <span class="promote-icon"><AppIcon name="library" :size="17" /></span>
            <div>
              <h2 id="promote-title">{{ t('journal.promoteTitle') }}</h2>
              <p>{{ t('journal.promoteDescription') }}</p>
            </div>
          </header>

          <label class="promote-field">
            <span>{{ t('journal.promoteTitleLabel') }}</span>
            <input ref="input" v-model="title" maxlength="120" autocomplete="off" />
          </label>
          <label class="promote-field">
            <span>{{ t('journal.promoteCategoryLabel') }}</span>
            <select v-model="categoryId">
              <option :value="null">{{ t('import.categoryUncategorized') }}</option>
              <option v-for="category in props.categories" :key="category.id" :value="category.id">
                {{ category.name }}
              </option>
            </select>
          </label>

          <div class="promote-actions">
            <button type="button" @click="emit('close')">{{ t('common.cancel') }}</button>
            <button type="submit" class="promote-primary" :disabled="props.busy">
              {{ props.busy ? t('common.saving') : props.updating ? t('journal.promoteConfirm') : t('journal.promote') }}
            </button>
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
  display: grid;
  inset: 0;
  place-items: center;
  padding: 24px;
  background: rgba(28, 24, 44, 0.32);
  backdrop-filter: blur(2px);
}

.promote-dialog {
  display: flex;
  width: min(440px, 100%);
  flex-direction: column;
  gap: 11px;
  padding: 20px;
  border: 1px solid var(--border-soft);
  border-radius: 14px;
  background: var(--panel-strong);
  box-shadow: var(--shadow-float);
}

.promote-dialog header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.promote-icon {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 9px;
  background: var(--accent-faint);
  color: var(--accent);
}

.promote-dialog h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 15px;
}

.promote-dialog p {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 10.5px;
  line-height: 1.5;
}

.promote-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--text-secondary);
  font-size: 10.5px;
}

.promote-field input,
.promote-field select {
  height: 32px;
  padding: 0 9px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--panel-muted);
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
}

.promote-field input:focus,
.promote-field select:focus {
  border-color: var(--accent);
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-faint);
}

.promote-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 2px;
}

.promote-actions button {
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--panel-strong);
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 11.5px;
}

.promote-actions button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.promote-actions .promote-primary {
  border-color: var(--accent);
  background: var(--accent);
  color: white;
  font-weight: 620;
}
</style>
