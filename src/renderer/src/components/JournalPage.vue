<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import ActivityHeatmap from './ActivityHeatmap.vue'
import EditorPane from './EditorPane.vue'
import PromoteJournalDialog from './PromoteJournalDialog.vue'
import { useDocumentStore } from '../stores/document'
import { useJournalTemplateStore } from '../stores/journalTemplates'
import { useI18n } from '../i18n/useI18n'
import { formatJournalDay, journalTitleForDate } from '../app/journalView'
import { journalDaysSet, todayDayKey } from '../app/knowledgeNavigation'
import { journalTemplateLabel, promoteTitleFromJournal, type JournalTemplate } from '../app/journalTemplates'
import { countDocumentCharacters } from '../stores/document'
import type { TiptapDocument } from '../../../shared/document'

const emit = defineEmits<{
  /** Opens the day's entry, creating it when the day is empty. */
  openDay: [dayKey: string]
  /** The library view should open this document after a sync. */
  openDocument: [id: string]
  /** Opens the import dialog; imported history lands in the journal. */
  importHistory: []
}>()

const documentStore = useDocumentStore()
const templateStore = useJournalTemplateStore()
const { t, locale } = useI18n()
const creating = ref(false)
const deletingId = ref<string | null>(null)
const openingId = ref<string | null>(null)
const actionError = ref<string | null>(null)
const titleDraft = ref('')
const toast = ref('')
const templateMenuOpen = ref(false)
const promoteOpen = ref(false)
const promoting = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null

const activity = computed(() => documentStore.activity)
const activityLoaded = computed(() => documentStore.activityLoaded)

const currentJournal = computed(() => documentStore.currentJournal)
const journals = computed(() => documentStore.journals)
const journalDays = computed(() => journalDaysSet(journals.value))
const today = computed(() => todayDayKey())
const saveLabel = computed(() => {
  const phase = documentStore.journalSaveState.phase
  if (phase === 'saving') return t('journal.save.saving')
  if (phase === 'dirty') return t('journal.save.dirty')
  if (phase === 'error') return t('journal.save.error')
  return t('journal.save.saved')
})

/** Journal entries grouped by the month they were written in, newest first. */
const groupedJournals = computed(() => {
  const groups = new Map<string, typeof journals.value>()
  for (const journal of journals.value) {
    const key = monthKey(journal.createdAt)
    const bucket = groups.get(key) ?? []
    bucket.push(journal)
    groups.set(key, bucket)
  }
  return [...groups.entries()].map(([key, entries]) => ({ key, label: monthLabel(key), entries }))
})

const syncedDocument = computed(() => {
  const id = currentJournal.value?.documentId
  if (!id) return null
  return documentStore.documents.find((document) => document.id === id) ?? null
})

const templates = computed(() => templateStore.all)

watch(currentJournal, (journal) => {
  titleDraft.value = journal?.title ?? ''
}, { immediate: true })

watch(() => currentJournal.value?.documentId, () => {
  promoteOpen.value = false
})

onMounted(() => {
  // Shared with the home page; a failed read only leaves the heatmap empty.
  void documentStore.refreshActivity()
})

function templateName(template: JournalTemplate): string {
  return journalTemplateLabel(template, t)
}

async function createJournal(title = journalTitleForDate(), content?: TiptapDocument): Promise<void> {
  if (creating.value) return
  creating.value = true
  actionError.value = null
  try {
    const created = await documentStore.createJournal({ title, content })
    if (!created) {
      actionError.value = documentStore.error ?? t('journal.createFailed')
      return
    }
    const opened = await documentStore.selectJournal(created.id)
    if (!opened) actionError.value = documentStore.error ?? t('journal.openFailed')
  } finally {
    creating.value = false
  }
}

async function createFromTemplate(template: JournalTemplate): Promise<void> {
  templateMenuOpen.value = false
  // Templates keep their own headings, so the date stays in the title only.
  await createJournal(journalTitleForDate(), template.content)
}

function saveAsTemplate(): void {
  const journal = currentJournal.value
  if (!journal) return
  const name = promoteTitleFromJournal(journal.title) || journal.title
  const template = templateStore.saveTemplate(name, journal.content)
  showToast(template ? t('journal.template.savedToast', { name: template.title }) : t('journal.template.saveFailed'))
}

/** Reuses today's entry when one already exists instead of piling up duplicates. */
async function openToday(): Promise<void> {
  emit('openDay', today.value)
}

async function openJournal(id: string): Promise<void> {
  if (openingId.value) return
  openingId.value = id
  actionError.value = null
  try {
    const opened = await documentStore.selectJournal(id)
    if (!opened) actionError.value = documentStore.error ?? t('journal.openFailed')
  } finally {
    openingId.value = null
  }
}

async function deleteJournal(id: string): Promise<void> {
  if (deletingId.value) return
  deletingId.value = id
  actionError.value = null
  try {
    const deleted = await documentStore.deleteJournal(id)
    if (!deleted) actionError.value = documentStore.error ?? t('journal.deleteFailed')
  } finally {
    deletingId.value = null
  }
}

async function openSyncedDocument(): Promise<void> {
  const document = syncedDocument.value
  if (document) emit('openDocument', document.id)
}

async function promote(options: { title: string; categoryId: string | null }): Promise<void> {
  const journal = currentJournal.value
  if (!journal || promoting.value) return
  promoting.value = true
  actionError.value = null
  try {
    const document = await documentStore.promoteJournalToDocument(journal.id, options)
    if (!document) {
      actionError.value = documentStore.error ?? t('journal.promoteFailed')
      return
    }
    promoteOpen.value = false
    showToast(t('journal.promoted'))
  } finally {
    promoting.value = false
  }
}

async function closeEditor(): Promise<void> {
  commitTitle()
  // Flush before tearing the autosave down: `closeJournal` disposes the pending
  // timer, which would drop a title or keystroke made just before leaving.
  await documentStore.saveJournalNow()
  documentStore.closeJournal()
}

function commitTitle(): void {
  const journal = currentJournal.value
  if (!journal) return
  const next = titleDraft.value.trim() || t('journal.untitled')
  titleDraft.value = next
  if (next !== journal.title) documentStore.updateJournalTitle(next)
}

function handleContent(content: TiptapDocument): void {
  documentStore.updateJournalContent(content)
}

function showToast(message: string): void {
  toast.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 2000)
}

/** Imported entries can sit on any day, so the list shows the written day. */
function writtenDate(journal: { createdAt: string }): string {
  return formatJournalDay(journal.createdAt, locale.value)
}

function monthKey(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'unknown'
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  if (key === 'unknown') return t('time.unknown')
  const [year, month] = key.split('-')
  return new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'long' })
    .format(new Date(Number(year), Number(month) - 1, 1))
}

const currentWords = computed(() => countDocumentCharacters(currentJournal.value?.content))

function handleGlobalPointerDown(event: PointerEvent): void {
  if (!templateMenuOpen.value) return
  const target = event.target as Element | null
  if (target?.closest('.template-menu, .template-anchor')) return
  templateMenuOpen.value = false
}

onMounted(() => window.addEventListener('pointerdown', handleGlobalPointerDown))

onBeforeUnmount(() => {
  if (toastTimer) clearTimeout(toastTimer)
  window.removeEventListener('pointerdown', handleGlobalPointerDown)
})
</script>

<template>
  <section class="journal-page" :class="{ 'is-editing': currentJournal }" aria-labelledby="journal-heading">
    <template v-if="!currentJournal">
      <header class="journal-header">
        <div>
          <span class="journal-eyebrow">{{ t('journal.eyebrow') }}</span>
          <h1 id="journal-heading">{{ t('journal.heading') }}</h1>
          <p>{{ t('journal.subtitle') }}</p>
        </div>
        <div class="journal-header-actions">
          <button type="button" class="journal-today" :title="t('journal.importHistory')" @click="emit('importHistory')">
            <AppIcon name="attachment" :size="14" /> {{ t('journal.importHistory') }}
          </button>
          <button type="button" class="journal-today" @click="openToday">
            <AppIcon name="journal" :size="15" /> {{ t('journal.today') }}
          </button>
          <div class="template-anchor">
            <button
              type="button"
              class="journal-create"
              :disabled="creating"
              :aria-expanded="templateMenuOpen"
              @click="templateMenuOpen = !templateMenuOpen"
            >
              {{ creating ? t('journal.creating') : t('journal.newEntry') }}
              <AppIcon name="chevronDown" :size="13" />
            </button>
            <div v-if="templateMenuOpen" class="template-menu" role="menu" :aria-label="t('journal.template.aria')">
              <button type="button" role="menuitem" @click="templateMenuOpen = false; createJournal()">
                <AppIcon name="filePlus" :size="14" />
                <span>{{ t('journal.blankEntry') }}</span>
              </button>
              <div
                v-for="template in templates"
                :key="template.id"
                class="template-row"
              >
                <button type="button" role="menuitem" @click="createFromTemplate(template)">
                  <AppIcon :name="template.icon" :size="14" />
                  <span>{{ templateName(template) }}</span>
                </button>
                <button
                  v-if="template.nameKey === null"
                  type="button"
                  class="template-remove"
                  :aria-label="t('journal.template.remove')"
                  :title="t('journal.template.remove')"
                  @click.stop="templateStore.removeTemplate(template.id)"
                >
                  <AppIcon name="x" :size="12" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <ActivityHeatmap
        v-if="activityLoaded"
        class="journal-heatmap"
        :days="activity.days"
        :journal-days="journalDays"
        @select-day="emit('openDay', $event)"
      />

      <p class="journal-difference">{{ t('journal.description') }}</p>
      <p v-if="actionError" class="journal-error" role="alert">{{ actionError }}</p>

      <div v-if="journals.length" class="journal-groups">
        <section v-for="group in groupedJournals" :key="group.key" class="journal-group">
          <h2 class="journal-month">{{ group.label }}</h2>
          <article v-for="journal in group.entries" :key="journal.id" class="journal-card">
            <button type="button" class="journal-open" :disabled="openingId === journal.id" @click="openJournal(journal.id)">
              <strong>{{ journal.title }}</strong>
              <span>{{ writtenDate(journal) }}</span>
            </button>
            <span v-if="journal.documentId" class="journal-synced-chip" :title="t('journal.synced', { title: journal.title })">
              <AppIcon name="check" :size="12" />
            </span>
            <button
              type="button"
              class="journal-delete"
              :disabled="deletingId === journal.id"
              :aria-label="t('journal.deleteAria', { title: journal.title })"
              @click="deleteJournal(journal.id)"
            >
              {{ deletingId === journal.id ? t('journal.deleting') : t('common.delete') }}
            </button>
          </article>
        </section>
      </div>

      <div v-else class="journal-empty">
        <span class="loading-mark">{{ t('document.brandLetter') }}</span>
        <strong>{{ t('journal.empty.title') }}</strong>
        <span>{{ t('journal.empty.body') }}</span>
      </div>
    </template>

    <template v-else>
      <header class="journal-editor-header">
        <button type="button" class="journal-back" @click="closeEditor">
          <AppIcon name="chevronLeft" :size="15" /> {{ t('journal.backToList') }}
        </button>
        <span class="journal-date">{{ formatJournalDay(currentJournal.createdAt, locale) }}</span>
        <div class="journal-editor-actions">
          <button
            v-if="syncedDocument"
            type="button"
            class="journal-sync-state"
            :title="t('journal.openSynced')"
            @click="openSyncedDocument"
          >
            <AppIcon name="check" :size="13" />
            <span>{{ t('journal.synced', { title: syncedDocument.title }) }}</span>
          </button>
          <button type="button" class="journal-promote" @click="promoteOpen = true">
            <AppIcon name="library" :size="14" /> {{ t('journal.promote') }}
          </button>
          <button type="button" class="journal-back" @click="saveAsTemplate">
            {{ t('journal.template.saveAs') }}
          </button>
        </div>
        <span class="journal-save" :class="`phase-${documentStore.journalSaveState.phase}`">{{ saveLabel }}</span>
      </header>

      <p v-if="actionError" class="journal-error" role="alert">{{ actionError }}</p>

      <div class="journal-title-row">
        <input
          v-model="titleDraft"
          class="journal-title"
          :aria-label="t('journal.titleAria')"
          maxlength="120"
          @blur="commitTitle"
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        />
        <span class="journal-word-count">{{ t('time.words') }} {{ currentWords }}</span>
      </div>

      <EditorPane
        :key="currentJournal.id"
        :content="currentJournal.content"
        :document-id="currentJournal.id"
        @change="handleContent"
        @notify="showToast"
      />

      <PromoteJournalDialog
        :open="promoteOpen"
        :default-title="promoteTitleFromJournal(currentJournal.title) || currentJournal.title"
        :categories="documentStore.categories"
        :default-category-id="currentJournal.categoryId"
        :updating="Boolean(currentJournal.documentId)"
        :busy="promoting"
        @submit="promote"
        @close="promoteOpen = false"
      />
    </template>

    <Transition name="toast">
      <div v-if="toast" class="journal-toast" role="status">{{ toast }}</div>
    </Transition>
  </section>
</template>

<style scoped>
.journal-page {
  position: relative;
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 14px;
  overflow: auto;
  padding: 32px clamp(20px, 4vw, 56px) 32px;
  background: var(--panel-bg);
}

/* The editor view is full-bleed: the toolbar and canvas own their padding. */
.journal-page.is-editing {
  gap: 0;
  padding: 0;
  overflow: hidden;
  background: var(--panel-strong);
}

.journal-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-soft);
}

.journal-eyebrow {
  color: var(--accent);
  font-size: 9px;
  font-weight: 750;
  letter-spacing: 0.2em;
}

.journal-header h1 {
  margin: 5px 0 7px;
  color: var(--text-primary);
  font-size: 27px;
}

.journal-header p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 11px;
}

.journal-header-actions {
  display: flex;
  gap: 8px;
}

.journal-create,
.journal-today {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  gap: 6px;
  padding: 0 15px;
  border-radius: 9px;
  cursor: pointer;
  font: inherit;
  font-weight: 650;
}

.journal-create {
  border: 1px solid var(--accent);
  background: var(--accent);
  color: white;
}

.journal-today {
  border: 1px solid var(--border-strong);
  background: var(--panel-strong);
  color: var(--text-secondary);
}

.journal-today:hover {
  border-color: var(--accent);
  color: var(--accent-strong);
}

.journal-create:disabled,
.journal-delete:disabled,
.journal-open:disabled {
  cursor: wait;
  opacity: 0.6;
}

.journal-difference {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--accent-soft-border);
  border-radius: 9px;
  background: var(--accent-faint);
  color: var(--text-secondary);
  font-size: 10.5px;
  line-height: 1.6;
}

.journal-error {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--state-danger-border);
  border-radius: 9px;
  background: var(--state-danger-bg);
  color: var(--state-danger-fg);
  font-size: 11px;
}

.journal-groups {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 900px;
}

.journal-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.journal-month {
  margin: 0 0 2px 2px;
  color: var(--text-tertiary);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.journal-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px 12px 16px;
  border: 1px solid var(--border-soft);
  border-radius: 12px;
  background: var(--panel-strong);
  transition: border-color var(--motion-fast) var(--ease-out), transform var(--motion-fast) var(--ease-out);
}

.journal-card:hover {
  border-color: var(--accent-soft-border);
  transform: translateY(-1px);
}

.journal-open {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  padding: 4px 6px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.journal-open:hover {
  background: var(--panel-muted);
}

.journal-open strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.journal-open span {
  color: var(--text-tertiary);
  font-size: 10px;
}

.journal-delete {
  padding: 6px 10px;
  border: 1px solid var(--state-danger-border);
  border-radius: 7px;
  background: var(--state-danger-bg);
  color: var(--state-danger-fg);
  cursor: pointer;
  font: inherit;
  font-size: 10px;
}

.journal-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: var(--text-secondary);
  font-size: 11px;
}

.journal-empty strong {
  color: var(--text-primary);
  font-size: 14px;
}

.loading-mark {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 12px;
  background: var(--accent-faint);
  color: var(--accent);
  font-size: 17px;
  font-weight: 700;
}

.journal-editor-header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--divider-soft);
}

.journal-back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: var(--panel-strong);
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
}

.journal-back:hover {
  background: var(--panel-muted);
  color: var(--text-primary);
}

.journal-date {
  color: var(--text-tertiary);
  font-size: 10px;
  white-space: nowrap;
}

.journal-save {
  color: var(--text-tertiary);
  font-size: 10px;
}

.journal-save.phase-error {
  color: var(--danger);
}

.journal-save.phase-saving,
.journal-save.phase-dirty {
  color: var(--state-warning-fg);
}

.journal-title-row {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
  padding: 12px 24px 4px;
}

.journal-title {
  width: min(760px, 100%);
  padding: 4px 6px;
  border: 0;
  border-radius: 6px;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 24px;
  font-weight: 720;
  letter-spacing: -0.02em;
}

.journal-title:hover,
.journal-title:focus {
  background: var(--panel-muted);
}

.journal-heatmap {
  max-width: 960px;
}

.template-anchor {
  position: relative;
}

.template-menu {
  position: absolute;
  z-index: 40;
  top: 40px;
  right: 0;
  display: flex;
  width: 236px;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  max-height: min(420px, calc(100vh - 160px));
  overflow-y: auto;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: var(--panel-strong);
  box-shadow: var(--shadow-float);
}

.template-row {
  display: flex;
  align-items: center;
  gap: 2px;
}

.template-row > button:first-child {
  flex: 1;
  min-width: 0;
}

.template-row button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 9px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font: inherit;
  font-size: 11.5px;
  text-align: left;
}

.template-row button:hover {
  background: var(--panel-muted);
}

.template-row .template-remove {
  flex: 0 0 auto;
  padding: 6px;
  color: var(--text-tertiary);
}

.journal-synced-chip {
  display: grid;
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
  background: var(--state-success-bg);
  color: var(--state-success-fg);
}

.journal-sync-state {
  display: inline-flex;
  max-width: 260px;
  min-width: 0;
  align-items: center;
  gap: 5px;
  padding: 5px 9px;
  border: 1px solid var(--state-success-border, var(--border-soft));
  border-radius: 7px;
  background: var(--state-success-bg);
  color: var(--state-success-fg);
  cursor: pointer;
  font: inherit;
  font-size: 10px;
  white-space: nowrap;
}

.journal-sync-state span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.journal-editor-actions {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.journal-promote {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border: 1px solid var(--accent-soft-border);
  border-radius: 7px;
  background: var(--accent-faint);
  color: var(--accent-strong);
  cursor: pointer;
  font: inherit;
  font-size: 10.5px;
  font-weight: 600;
}

.journal-promote:hover {
  border-color: var(--accent);
}

.journal-word-count {
  margin-left: auto;
  color: var(--text-tertiary);
  font-size: 10px;
  white-space: nowrap;
}

.journal-toast {
  position: fixed;
  right: 28px;
  bottom: 58px;
  z-index: 80;
  padding: 9px 14px;
  border: 1px solid var(--border-soft);
  border-radius: 9px;
  background: var(--panel-strong);
  box-shadow: var(--shadow-float);
  color: var(--text-primary);
  font-size: 11px;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity var(--motion-fast) var(--ease-out), transform var(--motion-fast) var(--ease-out);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(5px);
}
</style>
