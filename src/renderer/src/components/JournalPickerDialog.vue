<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import type { JournalRecord } from '../../../shared/document'
import { formatJournalDay } from '../app/journalView'
import { useI18n } from '../i18n/useI18n'

/**
 * Picks a journal entry to promote into a new library document, then asks for
 * the document title and category. Kept as one dialog: both choices belong to
 * the same "create a document from this entry" action.
 */
const props = defineProps<{
  open: boolean
  journals: readonly JournalRecord[]
  categories: ReadonlyArray<{ id: string; name: string }>
  defaultCategoryId?: string | null
  busy?: boolean
}>()

const emit = defineEmits<{
  close: []
  submit: [options: { journalId: string; title: string; categoryId: string | null }]
}>()

const { t, locale } = useI18n()
const query = ref('')
const selectedId = ref<string | null>(null)
const title = ref('')
const categoryId = ref<string | null>(null)
const dialog = ref<HTMLElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)

const entries = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  if (!needle) return props.journals
  return props.journals.filter((journal) => journal.title.toLocaleLowerCase().includes(needle))
})

const selected = computed(() => props.journals.find((journal) => journal.id === selectedId.value) ?? null)

watch(() => props.open, async (open) => {
  if (!open) return
  query.value = ''
  selectedId.value = null
  title.value = ''
  categoryId.value = props.defaultCategoryId ?? null
  await nextTick()
  searchInput.value?.focus()
})

function choose(journal: JournalRecord): void {
  selectedId.value = journal.id
  title.value = journal.title
}

function submit(): void {
  if (props.busy || !selectedId.value) return
  emit('submit', {
    journalId: selectedId.value,
    title: title.value.trim() || selected.value?.title || t('common.untitledDocument'),
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
        <section
          ref="dialog"
          class="picker-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="journal-picker-title"
          @keydown="handleKeydown"
        >
          <header>
            <span class="picker-icon"><AppIcon name="journal" :size="17" /></span>
            <h2 id="journal-picker-title">{{ t('library.fromJournalTitle') }}</h2>
          </header>

          <label class="picker-search">
            <AppIcon name="search" :size="14" />
            <input
              ref="searchInput"
              v-model="query"
              type="search"
              :placeholder="t('library.fromJournalSearch')"
              :aria-label="t('library.fromJournalSearch')"
            />
          </label>

          <ul v-if="entries.length" class="picker-list">
            <li v-for="journal in entries" :key="journal.id">
              <button
                type="button"
                class="picker-entry"
                :class="{ active: journal.id === selectedId }"
                :aria-pressed="journal.id === selectedId"
                @click="choose(journal)"
              >
                <strong>{{ journal.title }}</strong>
                <small>{{ formatJournalDay(journal.createdAt, locale) }}</small>
              </button>
            </li>
          </ul>
          <p v-else class="picker-empty">{{ t('library.fromJournalEmpty') }}</p>

          <template v-if="selected">
            <label class="picker-field">
              <span>{{ t('library.fromJournalTitleLabel') }}</span>
              <input v-model="title" maxlength="120" />
            </label>
            <label class="picker-field">
              <span>{{ t('library.fromJournalCategoryLabel') }}</span>
              <select v-model="categoryId">
                <option :value="null">{{ t('import.categoryUncategorized') }}</option>
                <option v-for="category in props.categories" :key="category.id" :value="category.id">
                  {{ category.name }}
                </option>
              </select>
            </label>
          </template>

          <div class="picker-actions">
            <button type="button" @click="emit('close')">{{ t('common.cancel') }}</button>
            <button type="button" class="picker-primary" :disabled="props.busy || !selected" @click="submit">
              {{ props.busy ? t('library.creatingCategory') : t('library.fromJournalConfirm') }}
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
  display: grid;
  inset: 0;
  place-items: center;
  padding: 24px;
  background: rgba(28, 24, 44, 0.32);
  backdrop-filter: blur(2px);
}

.picker-dialog {
  display: flex;
  width: min(520px, 100%);
  max-height: min(620px, calc(100vh - 48px));
  flex-direction: column;
  gap: 11px;
  padding: 20px;
  border: 1px solid var(--border-soft);
  border-radius: 14px;
  background: var(--panel-strong);
  box-shadow: var(--shadow-float);
}

.picker-dialog header {
  display: flex;
  align-items: center;
  gap: 9px;
}

.picker-icon {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 9px;
  background: var(--accent-faint);
  color: var(--accent);
}

.picker-dialog h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 15px;
}

.picker-search {
  display: flex;
  height: 34px;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--panel-muted);
  color: var(--text-secondary);
}

.picker-search input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
}

.picker-list {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.picker-entry {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.picker-entry:hover {
  background: var(--panel-muted);
}

.picker-entry.active {
  border-color: var(--accent-soft-border);
  background: var(--accent-faint);
}

.picker-entry strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-entry small {
  color: var(--text-tertiary);
  font-size: 10px;
}

.picker-empty {
  margin: 0;
  padding: 18px;
  color: var(--text-tertiary);
  font-size: 11px;
  text-align: center;
}

.picker-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--text-secondary);
  font-size: 10.5px;
}

.picker-field input,
.picker-field select {
  height: 32px;
  padding: 0 9px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--panel-muted);
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
}

.picker-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 2px;
}

.picker-actions button {
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

.picker-actions button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.picker-actions .picker-primary {
  border-color: var(--accent);
  background: var(--accent);
  color: white;
  font-weight: 620;
}
</style>
