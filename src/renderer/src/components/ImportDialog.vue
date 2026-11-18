<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import type { CategoryRecord } from '../../../shared/document'
import type { ImportOutcome } from '../stores/document'
import { useI18n } from '../i18n/useI18n'

const props = defineProps<{
  open: boolean
  categories: readonly CategoryRecord[]
  defaultCategoryId: string | null
  busy: boolean
}>()

const emit = defineEmits<{
  close: []
  submit: [options: { mode: 'files' | 'folder' | 'archive'; categoryId: string | null; merge: boolean }]
}>()
const { t } = useI18n()

type Mode = 'files' | 'folder' | 'archive'

const mode = ref<Mode>('files')
const categoryId = ref<string | null>(props.defaultCategoryId)
const merge = ref(false)
const result = ref<ImportOutcome | null>(null)
const dialog = ref<HTMLElement | null>(null)

const modeOptions: Array<{ value: Mode; labelKey: string; hintKey: string; icon: string }> = [
  { value: 'files', labelKey: 'import.mode.files', hintKey: 'import.mode.filesHint', icon: 'filePlus' },
  { value: 'folder', labelKey: 'import.mode.folder', hintKey: 'import.mode.folderHint', icon: 'folder' },
  { value: 'archive', labelKey: 'import.mode.archive', hintKey: 'import.mode.archiveHint', icon: 'attachment' },
]

const failureCount = computed(() => (result.value?.failed.length ?? 0) + (result.value?.empty.length ?? 0))
const hasResult = computed(() => result.value !== null)
const successCount = computed(() => result.value?.created ?? 0)

// Re-sync the category default every time the dialog opens, so it follows
// whatever the user has selected in the sidebar.
watch(() => props.open, async (open) => {
  if (!open) return
  categoryId.value = props.defaultCategoryId
  mode.value = 'files'
  merge.value = false
  result.value = null
  await nextTick()
  dialog.value?.querySelector<HTMLElement>('.import-mode-button')?.focus()
})

/**
 * Prefers the stable code from the main process so the reason follows the UI
 * language; older failures without a code fall back to their original text.
 */
function issueLabel(item: { reason: string; code?: string; params?: Record<string, string | number> }): string {
  if (!item.code) return item.reason
  const key = `import.${item.code}`
  const translated = t(key, item.params)
  return translated === key ? item.reason : translated
}

function categoryLabel(id: string | null): string {
  if (id === null) return t('import.categoryUncategorized')
  return props.categories.find((category) => category.id === id)?.name ?? t('import.categoryUncategorized')
}

function submit(): void {
  if (props.busy) return
  result.value = null
  emit('submit', { mode: mode.value, categoryId: categoryId.value, merge: merge.value })
}

function showResult(outcome: ImportOutcome): void {
  result.value = outcome
}

function handleKeydown(event: KeyboardEvent): void {
  if (!props.open) return
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}

defineExpose({ showResult })
</script>

<template>
  <Teleport to="body">
    <Transition name="import-dialog">
      <div v-if="props.open" class="import-backdrop" role="presentation" @mousedown.self="emit('close')">
        <section
          ref="dialog"
          class="import-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-title"
          @keydown="handleKeydown"
        >
          <header class="import-header">
            <span class="import-mark"><AppIcon name="filePlus" :size="18" /></span>
            <div>
              <h2 id="import-title">{{ t('import.title') }}</h2>
              <p>{{ t('import.subtitle') }}</p>
            </div>
            <button type="button" class="import-close" :aria-label="t('import.result.close')" @click="emit('close')">
              <AppIcon name="x" :size="17" />
            </button>
          </header>

          <template v-if="!hasResult">
            <div class="import-modes" role="radiogroup" :aria-label="t('import.sourceAria')">
              <button
                v-for="option in modeOptions"
                :key="option.value"
                type="button"
                role="radio"
                class="import-mode-button"
                :class="{ active: mode === option.value }"
                :aria-checked="mode === option.value"
                :disabled="props.busy"
                @click="mode = option.value"
              >
                <span class="import-mode-icon"><AppIcon :name="option.icon" :size="17" /></span>
                <span class="import-mode-copy">
                  <strong>{{ t(option.labelKey) }}</strong>
                  <small>{{ t(option.hintKey) }}</small>
                </span>
              </button>
            </div>

            <div class="import-field">
              <label for="import-category">{{ t('import.categoryLabel') }}</label>
              <select id="import-category" v-model="categoryId" :disabled="props.busy || merge">
                <option :value="null">{{ t('import.categoryUncategorized') }}</option>
                <option v-for="category in props.categories" :key="category.id" :value="category.id">
                  {{ category.name }}
                </option>
              </select>
            </div>

            <label class="import-checkbox" :class="{ disabled: props.busy }">
              <input v-model="merge" type="checkbox" :disabled="props.busy" />
              <span>
                {{ t('import.merge') }}
                <small>{{ t('import.mergeHint') }}</small>
              </span>
            </label>

            <footer class="import-footer">
              <span class="import-note">
                {{ t('import.hint') }}
              </span>
              <div class="import-actions">
                <button type="button" :disabled="props.busy" @click="emit('close')">{{ t('common.cancel') }}</button>
                <button type="button" class="import-primary" :disabled="props.busy" @click="submit">
                  {{ props.busy ? t('import.importing') : t('import.start') }}
                </button>
              </div>
            </footer>
          </template>

          <template v-else>
            <div class="import-result" :class="{ 'has-failures': failureCount > 0 }">
              <strong v-if="successCount > 0">{{ t('import.result.created', { count: successCount }) }}</strong>
              <strong v-else-if="failureCount > 0">{{ t('import.result.none') }}</strong>
              <strong v-else>{{ t('import.result.none') }}</strong>
              <span v-if="merge">{{ t('import.merged') }}</span>
              <span v-else-if="successCount > 0">{{ t('import.savedTo', { name: categoryLabel(categoryId) }) }}</span>
            </div>

            <div v-if="result?.failed.length" class="import-issues">
              <h3>{{ t('import.result.failed') }}</h3>
              <ul>
                <li v-for="item in result.failed" :key="`f-${item.sourceLabel}`">
                  <code>{{ item.sourceLabel }}</code><span>{{ issueLabel(item) }}</span>
                </li>
              </ul>
            </div>

            <div v-if="result?.empty.length" class="import-issues">
              <h3>{{ t('import.result.emptyDocs') }}</h3>
              <ul>
                <li v-for="label in result.empty" :key="`e-${label}`">
                  <code>{{ label }}</code><span>{{ t('import.result.emptyDoc') }}</span>
                </li>
              </ul>
            </div>

            <div v-if="result?.skipped.length" class="import-issues muted">
              <h3>{{ t('import.result.skipped') }}</h3>
              <ul>
                <li v-for="item in result.skipped" :key="`s-${item.sourceLabel}`">
                  <code>{{ item.sourceLabel }}</code><span>{{ issueLabel(item) }}</span>
                </li>
              </ul>
            </div>

            <footer class="import-footer">
              <span class="import-note">{{ t('import.continueHint') }}</span>
              <div class="import-actions">
                <button type="button" @click="result = null">{{ t('import.importMore') }}</button>
                <button type="button" class="import-primary" @click="emit('close')">{{ t('import.result.done') }}</button>
              </div>
            </footer>
          </template>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.import-backdrop {
  position: fixed;
  z-index: 130;
  display: grid;
  inset: 0;
  place-items: center;
  background: rgba(29, 24, 44, 0.28);
  backdrop-filter: blur(3px);
}

.import-dialog {
  width: min(620px, calc(100vw - 36px));
  max-height: min(680px, calc(100vh - 40px));
  padding: 20px;
  overflow-y: auto;
  border: 1px solid var(--border-soft);
  border-radius: 16px;
  background: var(--panel-strong);
  box-shadow: var(--shadow-float);
}

.import-header {
  display: flex;
  align-items: flex-start;
  gap: 11px;
}

.import-mark {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 10px;
  background: var(--accent-faint);
  color: var(--accent);
}

.import-header h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 16px;
}

.import-header p {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 10.5px;
  line-height: 1.5;
}

.import-close {
  display: grid;
  width: 30px;
  height: 30px;
  margin-left: auto;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.import-close:hover {
  background: var(--panel-muted);
}

.import-modes {
  display: grid;
  gap: 8px;
  margin-top: 18px;
}

.import-mode-button {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 11px;
  padding: 10px 12px;
  border: 1px solid var(--border-soft);
  border-radius: 11px;
  background: var(--panel-strong);
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.import-mode-button:hover:not(:disabled) {
  border-color: var(--accent);
}

.import-mode-button.active {
  border-color: var(--accent);
  background: var(--accent-faint);
}

.import-mode-button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.import-mode-icon {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 8px;
  background: var(--panel-muted);
  color: var(--accent-strong);
}

.import-mode-button.active .import-mode-icon {
  background: var(--accent-soft);
}

.import-mode-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.import-mode-copy strong {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 620;
}

.import-mode-copy small {
  color: var(--text-tertiary);
  font-size: 10px;
}

.import-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 16px;
}

.import-field label {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
}

.import-field select {
  min-width: 180px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--panel-muted);
  color: var(--text-primary);
  font: inherit;
  font-size: 11px;
}

.import-field select:disabled {
  opacity: 0.55;
}

.import-checkbox {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-top: 14px;
  padding: 10px 12px;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: var(--panel-muted);
  cursor: pointer;
}

.import-checkbox.disabled {
  opacity: 0.6;
}

.import-checkbox input {
  margin-top: 2px;
  accent-color: var(--accent);
}

.import-checkbox span {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--text-primary);
  font-size: 11.5px;
}

.import-checkbox small {
  color: var(--text-tertiary);
  font-size: 10px;
}

.import-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px solid var(--border-soft);
}

.import-note {
  color: var(--text-tertiary);
  font-size: 9.5px;
  line-height: 1.5;
}

.import-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}

.import-actions button {
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--panel-strong);
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
}

.import-actions button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.import-actions .import-primary {
  border-color: var(--accent);
  background: var(--accent);
  color: white;
  font-weight: 620;
}

.import-result {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 18px;
  padding: 13px 14px;
  border: 1px solid var(--state-success-bg);
  border-radius: 10px;
  background: var(--state-success-bg);
  color: var(--state-success-fg);
}

.import-result.has-failures {
  border-color: var(--state-warning-bg);
  background: var(--state-warning-bg);
  color: var(--state-warning-fg);
}

.import-result strong {
  font-size: 12.5px;
}

.import-result span {
  font-size: 10.5px;
}

.import-issues {
  margin-top: 14px;
}

.import-issues.muted {
  opacity: 0.75;
}

.import-issues h3 {
  margin: 0 0 6px;
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.import-issues ul {
  display: flex;
  max-height: 160px;
  flex-direction: column;
  gap: 5px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.import-issues li {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 9px;
  border: 1px solid var(--border-soft);
  border-radius: 7px;
  background: var(--panel-muted);
  font-size: 10.5px;
}

.import-issues code {
  flex: 0 0 auto;
  max-width: 45%;
  overflow: hidden;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.import-issues li span {
  color: var(--text-tertiary);
}

.import-dialog-enter-active,
.import-dialog-leave-active {
  transition: opacity 140ms ease;
}

.import-dialog-enter-from,
.import-dialog-leave-to {
  opacity: 0;
}
</style>
