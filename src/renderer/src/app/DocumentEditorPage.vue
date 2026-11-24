<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import NavigationRail from '../components/NavigationRail.vue'
import ResourceSidebar from '../components/ResourceSidebar.vue'
import EditorWorkspace from '../components/EditorWorkspace.vue'
import JournalPage from '../components/JournalPage.vue'
import HomePage from '../components/HomePage.vue'
import SettingsPage from '../components/SettingsPage.vue'
import ColumnResizer from '../components/ColumnResizer.vue'
import ImportDialog from '../components/ImportDialog.vue'
import AppIcon from '../components/AppIcon.vue'
import { useDocumentStore } from '../stores/document'
import { useUiStore } from '../stores/ui'
import { useSettingsStore } from '../stores/settings'
import { getShizhiApi } from '../services/api'
import { resolveDocumentViewState } from './documentPageState'
import { resolveNavigationTarget, todayDayKey, type NavigationKey } from './knowledgeNavigation'
import type { ImportOutcome } from '../stores/document'
import { useI18n } from '../i18n/useI18n'
import {
  bindingFromEvent,
  normalizeBinding,
  readShortcuts,
  type ShortcutMap,
} from './shortcuts'
import {
  clampNavigationWidth,
  clampSidebarWidth,
  DEFAULT_NAVIGATION_WIDTH,
  DEFAULT_SIDEBAR_WIDTH,
  MAX_NAVIGATION_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_NAVIGATION_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from '../stores/ui'

const documentStore = useDocumentStore()
const ui = useUiStore()
const { t } = useI18n()
const api = getShizhiApi()
const initializing = ref(false)
const creating = ref(false)
const activeNavigation = ref<NavigationKey>('journal')
const importOpen = ref(false)
const importing = ref(false)
const importDefaultCategory = ref<string | null>(null)
const importAllowMerge = ref(false)
const importDialog = ref<{ showResult: (outcome: ImportOutcome) => void } | null>(null)
let disposeCloseRequest: (() => void) | null = null

const viewState = computed(() => resolveDocumentViewState({
  loading: initializing.value,
  error: documentStore.error,
  current: documentStore.current,
}))

const pageToast = ref('')
const loadError = computed(() => documentStore.error ?? t('library.loadErrorTitle'))
const activePage = computed(() => resolveNavigationTarget(activeNavigation.value))

function showPageToast(message: string): void {
  pageToast.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { pageToast.value = '' }, 2200)
}

let toastTimer: ReturnType<typeof setTimeout> | null = null

async function handleNavigation(key: NavigationKey): Promise<void> {
  // Leaving the journal editor commits any pending journal changes first; the
  // autosave controller is disposed on close, so an unflushed edit would vanish.
  if (activeNavigation.value === 'journal' && key !== 'journal') {
    await documentStore.saveJournalNow()
    documentStore.closeJournal()
  }
  activeNavigation.value = key
}

/* ------------------------------------------------------------- shortcuts */

const settingsStore = useSettingsStore()
let shortcuts: ShortcutMap = readShortcuts()
let disposeNavigate: (() => void) | null = null

/**
 * Runs the user's application-level shortcut. Only fires when no dialog owns
 * the keystroke and the editor does not, so typing `Ctrl+N` inside a document
 * still reaches the browser's own handling rather than creating a document.
 */
function handleAppShortcut(event: KeyboardEvent): void {
  if (event.isComposing || event.defaultPrevented) return
  const target = event.target as Element | null
  if (target?.closest('input, textarea, select, [contenteditable="true"], .shizhi-editor')) return
  const binding = normalizeBinding(bindingFromEvent(event))
  if (!binding) return
  const command = (Object.entries(shortcuts) as Array<[string, string]>)
    .find(([, value]) => normalizeBinding(value) === binding)?.[0]
  if (!command) return

  switch (command) {
    case 'new-document':
      event.preventDefault()
      void documentStore.createDocument().then((created) => {
        if (created) activeNavigation.value = 'library'
      })
      break
    case 'search':
      event.preventDefault()
      activeNavigation.value = 'library'
      focusLibrarySearch()
      break
    case 'focus-mode':
      event.preventDefault()
      ui.toggleFocusMode()
      break
    case 'toggle-theme':
      event.preventDefault()
      ui.toggleTheme()
      break
    case 'open-settings':
      event.preventDefault()
      activeNavigation.value = 'settings'
      break
    case 'save-now':
      event.preventDefault()
      void documentStore.saveNow()
      void documentStore.saveJournalNow()
      showPageToast(t('common.saved'))
      break
    default:
      break
  }
}

function focusLibrarySearch(): void {
  // The sidebar may not be rendered yet on this tick; retry after it mounts.
  const attempt = (tries: number): void => {
    const input = document.querySelector<HTMLInputElement>('.search-box input')
    if (input) {
      input.focus()
      input.select()
      return
    }
    if (tries > 0) window.setTimeout(() => attempt(tries - 1), 30)
  }
  window.setTimeout(() => attempt(5), 0)
}

async function handleHomeOpenDocument(id: string): Promise<void> {
  activeNavigation.value = 'library'
  await documentStore.selectDocument(id)
}

async function handleHomeOpenJournal(id: string): Promise<void> {
  activeNavigation.value = 'journal'
  await documentStore.selectJournal(id)
}

/**
 * Heatmap cells name a local day. The day's entry is opened, or created
 * backdated when the day is empty — including days that already have imported
 * activity but no entry yet.
 */
async function handleOpenJournalDay(dayKey: string): Promise<void> {
  activeNavigation.value = 'journal'
  const opened = await documentStore.openJournalForDay(dayKey)
  if (!opened) showPageToast(documentStore.error ?? t('journal.dayCreateFailed'))
}

async function handleOpenDocumentFromJournal(id: string): Promise<void> {
  // Leaving the journal editor for a document must close it; the library view
  // renders the journal editor whenever one is open.
  if (documentStore.currentJournal) {
    await documentStore.saveJournalNow()
    documentStore.closeJournal()
  }
  activeNavigation.value = 'library'
  await documentStore.selectDocument(id)
}

function openImportDialog(categoryId: string | null = null, options: { allowMerge?: boolean } = {}): void {
  importDefaultCategory.value = categoryId
  importAllowMerge.value = options.allowMerge === true
  importOpen.value = true
}

async function runImport(options: { mode: 'files' | 'folder' | 'archive'; categoryId: string | null; merge: boolean }): Promise<void> {
  if (importing.value) return
  importing.value = true
  try {
    // Merging writes into whichever document is open, so land on its editor first.
    if (options.merge) activeNavigation.value = 'library'
    const outcome = await documentStore.importDocuments(options)
    if (outcome.canceled) return
    // Imports become journal entries, so the journal list is where they land.
    if (!options.merge && outcome.created > 0) activeNavigation.value = 'journal'
    importDialog.value?.showResult(outcome)
  } finally {
    importing.value = false
  }
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (!documentStore.isDirty && documentStore.journalSaveState.phase === 'idle') return
  if (!documentStore.isDirty && documentStore.journalSaveState.phase === 'saved') return
  event.preventDefault()
  event.returnValue = ''
}

async function loadKnowledgeBase(): Promise<void> {
  if (initializing.value) return
  initializing.value = true
  try {
    await documentStore.initialize()
  } catch {
    // The store exposes the real IPC error through its error state.
  } finally {
    initializing.value = false
  }
}

async function createFirstDocument(): Promise<void> {
  if (creating.value) return
  creating.value = true
  try {
    await documentStore.createDocument()
  } finally {
    creating.value = false
  }
}

onMounted(async () => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  window.addEventListener('keydown', handleAppShortcut)
  disposeCloseRequest = api.window.onCloseRequested(() => {
    void documentStore.saveNow()
    void documentStore.saveJournalNow()
  })
  disposeNavigate = api.app.onNavigate(() => {
    activeNavigation.value = 'settings'
  })
  // The tray can be shown before the settings page is ever opened, so load the
  // app-level settings once at startup to apply locale and window behaviour.
  void settingsStore.load()
  await loadKnowledgeBase()
  // The journal is the daily surface: land on today's entry when one exists.
  // A missing day is not created here — opening the page should not write data.
  if (activeNavigation.value === 'journal' && !documentStore.error) {
    await documentStore.openJournalForDay(todayDayKey(), { create: false })
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('keydown', handleAppShortcut)
  disposeCloseRequest?.()
  disposeCloseRequest = null
  disposeNavigate?.()
  disposeNavigate = null
  void documentStore.saveNow()
  void documentStore.saveJournalNow()
  documentStore.dispose()
})
</script>

<template>
  <div class="document-shell" :class="ui.shellClasses" :style="ui.shellStyle">
    <NavigationRail
      :active-item="activeNavigation"
      @navigate="handleNavigation"
    />
    <ColumnResizer
      v-if="!ui.focusMode && !ui.navigationCollapsed"
      :value="ui.navigationWidth"
      :min="MIN_NAVIGATION_WIDTH"
      :max="MAX_NAVIGATION_WIDTH"
      :label="t('a11y.resizeNavigation')"
      @resize="ui.setNavigationWidth(clampNavigationWidth($event))"
      @reset="ui.resetNavigationWidth()"
    />

    <JournalPage
      v-if="activePage.page === 'journal'"
      @open-day="handleOpenJournalDay"
      @open-document="handleOpenDocumentFromJournal"
      @import-history="openImportDialog(null)"
    />

    <HomePage
      v-else-if="activePage.page === 'home'"
      class="page-pane"
      @open-document="handleHomeOpenDocument"
      @open-journal="handleHomeOpenJournal"
      @open-journal-day="handleOpenJournalDay"
      @import-documents="openImportDialog()"
      @go-to-library="activeNavigation = 'library'"
      @go-to-journal="activeNavigation = 'journal'"
    />

    <SettingsPage v-else-if="activePage.page === 'settings'" class="page-pane" />

    <template v-else-if="activePage.page === 'library'">
      <ResourceSidebar
        v-if="!documentStore.currentJournal"
        :initializing="initializing"
        :load-error="viewState === 'error' ? loadError : null"
        @retry-load="loadKnowledgeBase"
        @import-documents="openImportDialog($event ?? null, { allowMerge: true })"
        @notify="showPageToast"
      />
      <ColumnResizer
        v-if="!documentStore.currentJournal && !ui.focusMode"
        :value="ui.sidebarWidth"
        :min="MIN_SIDEBAR_WIDTH"
        :max="MAX_SIDEBAR_WIDTH"
        :label="t('a11y.resizeSidebar')"
        @resize="ui.setSidebarWidth(clampSidebarWidth($event))"
        @reset="ui.resetSidebarWidth()"
      />

      <EditorWorkspace
        v-if="!documentStore.currentJournal && viewState === 'editor' && documentStore.current"
        :key="documentStore.current.id"
        :document="documentStore.current"
      />

      <div v-else-if="!documentStore.currentJournal && viewState === 'loading'" class="app-loading" aria-live="polite">
        <span class="loading-mark">{{ t('document.brandLetter') }}</span>
        <span>{{ t('library.loading') }}</span>
      </div>

      <section v-else-if="!documentStore.currentJournal && viewState === 'error'" class="app-loading app-error" role="alert">
        <AppIcon name="info" :size="25" />
        <strong>{{ t('library.loadErrorTitle') }}</strong>
        <span>{{ loadError }}</span>
        <button type="button" :disabled="initializing" @click="loadKnowledgeBase">
          {{ initializing ? t('library.readingNow') : t('library.retryLoad') }}
        </button>
      </section>

      <section v-else-if="!documentStore.currentJournal" class="app-loading app-empty">
        <span class="loading-mark">{{ t('document.brandLetter') }}</span>
        <strong>{{ t('home.empty.title') }}</strong>
        <span>{{ t('home.empty.body') }}</span>
        <div class="app-empty-actions">
          <button type="button" :disabled="creating" @click="createFirstDocument">
            {{ creating ? t('journal.creating') : t('home.newDocument') }}
          </button>
          <button type="button" class="app-empty-secondary" @click="openImportDialog()">
            {{ t('home.importDocuments') }}
          </button>
        </div>
      </section>
    </template>

    <section v-else-if="activePage.page === 'assistant'" class="app-loading app-unimplemented" aria-labelledby="assistant-heading">
      <AppIcon name="sparkles" :size="25" />
      <strong id="assistant-heading">{{ t('settings.ai') }}</strong>
      <span>{{ t('settings.aiHint') }}</span>
    </section>

    <section v-else class="app-loading app-unimplemented">
      <AppIcon name="info" :size="25" />
      <strong>{{ t('library.pageUnavailable') }}</strong>
      <span>{{ t('library.pageUnavailableHint') }}</span>
    </section>

    <ImportDialog
      ref="importDialog"
      :open="importOpen"
      :categories="documentStore.categories"
      :default-category-id="importDefaultCategory"
      :busy="importing"
      :allow-merge="importAllowMerge"
      :allow-category="importAllowMerge"
      @close="importOpen = false"
      @submit="runImport"
    />

    <Transition name="toast">
      <div v-if="pageToast" class="page-toast" role="status">{{ pageToast }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.document-shell {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
  --navigation-width: 116px;
  --sidebar-width: 302px;
  background: var(--panel-bg);
}

.page-pane {
  flex: 1;
  min-width: 0;
}

.app-loading {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 32px;
  color: var(--text-secondary);
  font-size: 12px;
  text-align: center;
}

.app-loading > span:not(.loading-mark) {
  max-width: 440px;
  line-height: 1.6;
}

.app-loading strong {
  color: var(--text-primary);
  font-size: 15px;
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
  animation: loading-float 1.2s ease-in-out infinite;
}

.app-loading button {
  margin-top: 8px;
  padding: 8px 14px;
  border: 1px solid color-mix(in srgb, var(--accent) 26%, var(--border-soft));
  border-radius: 9px;
  background: var(--accent);
  color: white;
  cursor: pointer;
  font: inherit;
  font-weight: 650;
}

.app-loading button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.app-empty-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.app-empty-actions button {
  margin-top: 0;
}

.app-empty-secondary {
  background: var(--panel-strong) !important;
  border-color: var(--border-strong) !important;
  color: var(--text-secondary) !important;
}

.app-empty-secondary:hover {
  border-color: var(--accent) !important;
  color: var(--accent-strong) !important;
}

.app-error .loading-mark {
  animation: none;
}

@keyframes loading-float {
  50% { transform: translateY(-3px); }
}

.app-unimplemented .loading-mark {
  animation: none;
}

.page-toast {
  position: fixed;
  right: 28px;
  bottom: 58px;
  z-index: 260;
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
