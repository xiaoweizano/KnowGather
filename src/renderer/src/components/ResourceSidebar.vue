<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { useDocumentStore } from '../stores/document'
import { useUiStore } from '../stores/ui'
import { getShizhiApi } from '../services/api'
import ContextMenu from './ContextMenu.vue'
import PromptDialog from './PromptDialog.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { useI18n } from '../i18n/useI18n'
import {
  buildCategoryMenu,
  buildEntryMenu,
  categoryMoveTarget,
  type ContextMenuItem,
} from '../app/knowledgeContextMenu'
import { formatShortcut } from '../../../shared/platform'
import { shouldFocusKnowledgeSearch, shouldYieldShortcutToEditor } from '../app/knowledgeNavigation'
import {
  buildKnowledgeCategoryTree,
  limitKnowledgeEntries,
  validateCategoryDraft,
} from '../app/knowledgeSidebar'
import {
  filterKnowledgeEntries,
  formatKnowledgeUpdatedAt,
  type KnowledgeEntry,
} from '../app/knowledgeView'
import { shouldDismissLayer } from '../composables/dismissibleLayer'

const props = defineProps<{
  initializing?: boolean
  loadError?: string | null
}>()

const emit = defineEmits<{
  retryLoad: []
  importDocuments: [categoryId?: string | null]
  notify: [message: string]
}>()

const documentStore = useDocumentStore()
const ui = useUiStore()
const { t } = useI18n()
const shortcut = formatShortcut(getShizhiApi().platform, 'K')
const query = ref('')
const selectedCategoryId = ref<string | null>('all')
const expanded = ref(false)
const creatingDocument = ref(false)
const creatingCategory = ref(false)
const categoryMenuOpen = ref(false)
const categoryDraft = ref('')
const categoryError = ref<string | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const categoryMenu = ref<HTMLElement | null>(null)
const categoryInput = ref<HTMLInputElement | null>(null)
const recentLimit = 5
const contextMenu = ref<{ open: boolean; x: number; y: number; items: ContextMenuItem[] }>({
  open: false, x: 0, y: 0, items: [],
})
const pendingAction = ref<{ kind: 'rename-document' | 'rename-journal' | 'rename-category' | 'delete-document' | 'delete-journal' | 'delete-category'; id: string; name: string } | null>(null)
const promptError = ref<string | null>(null)

const categoryTree = computed(() => buildKnowledgeCategoryTree(
  documentStore.categories,
  documentStore.documents,
  documentStore.journals,
))

const filteredEntries = computed(() => filterKnowledgeEntries(
  documentStore.documents,
  documentStore.journals,
  { categoryId: selectedCategoryId.value, query: query.value },
))

const recentEntries = computed(() => limitKnowledgeEntries(
  filteredEntries.value,
  expanded.value || Boolean(query.value.trim()),
  recentLimit,
))

const canExpand = computed(() => !query.value.trim() && filteredEntries.value.length > recentLimit)

const saveStatus = computed(() => {
  const state = documentStore.saveState
  if (state.phase === 'saving') return { label: t('library.status.saving'), detail: t('library.status.savingDetail'), tone: 'saving' }
  if (state.phase === 'dirty') return { label: t('library.status.dirty'), detail: t('library.status.dirtyDetail'), tone: 'dirty' }
  if (state.phase === 'error') return { label: t('library.status.error'), detail: state.error ?? t('common.pleaseRetry'), tone: 'error' }
  if (state.phase === 'saved' && state.lastSavedAt) {
    return { label: t('library.status.saved'), detail: formatKnowledgeUpdatedAt(state.lastSavedAt), tone: 'saved' }
  }
  if (props.loadError) return { label: t('library.readFailed'), detail: t('common.pleaseRetry'), tone: 'error' }
  if (documentStore.categories.length === 0 && documentStore.documents.length === 0 && documentStore.journals.length === 0) {
    return { label: t('library.status.empty'), detail: t('library.status.emptyDetail'), tone: 'idle' }
  }
  return { label: t('library.status.loaded'), detail: t('library.status.loadedDetail'), tone: 'saved' }
})

function categoryKey(categoryId: string | null): string {
  return categoryId ?? '__uncategorized__'
}

function selectCategory(categoryId: string | null): void {
  selectedCategoryId.value = categoryId
  expanded.value = false
}

function selectEntry(entry: KnowledgeEntry): void {
  if (entry.kind === 'journal') {
    void documentStore.selectJournal(entry.id)
    return
  }
  void documentStore.selectDocument(entry.id)
}

function entryTone(entry: KnowledgeEntry): string {
  return entry.kind === 'journal' ? 'blue' : 'violet'
}

function entryIcon(entry: KnowledgeEntry): string {
  return entry.kind === 'journal' ? 'journal' : 'file'
}

/* ------------------------------------------------------------ context menu */

function openCategoryMenuAt(event: MouseEvent, categoryId: string | null): void {
  event.preventDefault()
  const menu = buildCategoryMenu({
    categoryId,
    isVirtual: categoryId === 'all',
    categoryName: categoryTree.value.find((node) => node.categoryId === categoryId)?.label,
  })
  showContextMenu(event, menu)
}

function openEntryMenuAt(event: MouseEvent, entry: KnowledgeEntry): void {
  event.preventDefault()
  const menu = buildEntryMenu({
    kind: entry.kind,
    favorite: entry.kind === 'document' ? entry.record.favorite : false,
    categories: documentStore.categories.map((category) => ({ id: category.id, name: category.name })),
    categoryId: entry.categoryId,
  })
  contextEntry.value = entry
  showContextMenu(event, menu)
}

const contextEntry = ref<KnowledgeEntry | null>(null)

function showContextMenu(event: MouseEvent, items: ContextMenuItem[]): void {
  contextMenu.value = { open: true, x: event.clientX, y: event.clientY, items }
}

function openMenuForButton(event: MouseEvent, entry: KnowledgeEntry): void {
  // Anchor the same menu to the "⋯" button so the actions are discoverable
  // without knowing about right-click.
  const target = event.currentTarget as HTMLElement | null
  const rect = target?.getBoundingClientRect()
  openEntryMenuAt(
    { preventDefault: () => undefined, clientX: rect?.left ?? 0, clientY: rect?.bottom ?? 0 } as MouseEvent,
    entry,
  )
}

async function handleContextSelect(item: ContextMenuItem): Promise<void> {
  const entry = contextEntry.value
  const moveTarget = categoryMoveTarget(item.id)
  if (moveTarget !== undefined && entry) {
    const ok = entry.kind === 'document'
      ? await documentStore.moveDocument(entry.id, moveTarget)
      : await documentStore.moveJournal(entry.id, moveTarget)
    if (!ok) emit('notify', documentStore.error ?? t('library.context.moveFailed'))
    return
  }

  switch (item.id) {
    case 'new-document':
      await createDocument()
      return
    case 'import':
      emit('importDocuments', selectedCategoryId.value === 'all' ? null : selectedCategoryId.value)
      return
    case 'open':
      if (entry) selectEntry(entry)
      return
    case 'rename':
      if (entry) {
        promptError.value = null
        pendingAction.value = {
          kind: entry.kind === 'document' ? 'rename-document' : 'rename-journal',
          id: entry.id,
          name: entry.title,
        }
      }
      return
    case 'favorite':
      if (entry?.kind === 'document') {
        const ok = await documentStore.setDocumentFavorite(entry.id, !entry.record.favorite)
        emit('notify', ok
          ? (entry.record.favorite ? t('library.favoriteRemoved') : t('library.favoriteAdded'))
          : (documentStore.error ?? t('common.saveFailed')))
      }
      return
    case 'copy-title':
      if (entry) {
        try {
          await navigator.clipboard.writeText(entry.title)
          emit('notify', t('library.copiedTitle'))
        } catch {
          emit('notify', t('document.toast.shareFailed'))
        }
      }
      return
    case 'delete':
      if (entry) {
        pendingAction.value = {
          kind: entry.kind === 'document' ? 'delete-document' : 'delete-journal',
          id: entry.id,
          name: entry.title,
        }
      }
      return
    case 'rename-category':
      if (selectedCategoryId.value && selectedCategoryId.value !== 'all') {
        const category = documentStore.categories.find((item) => item.id === selectedCategoryId.value)
        if (category) {
          promptError.value = null
          pendingAction.value = { kind: 'rename-category', id: category.id, name: category.name }
        }
      }
      return
    case 'delete-category':
      if (selectedCategoryId.value && selectedCategoryId.value !== 'all') {
        const category = documentStore.categories.find((item) => item.id === selectedCategoryId.value)
        if (category) pendingAction.value = { kind: 'delete-category', id: category.id, name: category.name }
      }
      return
  }
}

async function submitPrompt(value: string): Promise<void> {
  const action = pendingAction.value
  if (!action) return
  let ok = false
  if (action.kind === 'rename-document') ok = await documentStore.renameDocument(action.id, value)
  else if (action.kind === 'rename-journal') ok = await documentStore.renameJournal(action.id, value)
  else if (action.kind === 'rename-category') ok = (await documentStore.renameCategory(action.id, value)) !== null

  if (!ok) {
    promptError.value = documentStore.error ?? t('library.context.renameFailed')
    return
  }
  emit('notify', t('library.renamed'))
  pendingAction.value = null
}

async function confirmDelete(): Promise<void> {
  const action = pendingAction.value
  if (!action) return
  let ok = false
  if (action.kind === 'delete-document') ok = await documentStore.deleteDocument(action.id)
  else if (action.kind === 'delete-journal') ok = await documentStore.deleteJournal(action.id)
  else if (action.kind === 'delete-category') {
    ok = await documentStore.deleteCategory(action.id)
    if (ok) selectedCategoryId.value = 'all'
  }
  emit('notify', ok ? t('common.saved') : (documentStore.error ?? t('common.saveFailed')))
  if (ok) pendingAction.value = null
}

function promptTitle(): string {
  const action = pendingAction.value
  if (!action) return ''
  if (action.kind === 'rename-category') return t('library.context.renameCategory')
  return t('library.context.rename')
}

function confirmConfig(): { title: string; description: string } {
  const action = pendingAction.value
  if (!action) return { title: '', description: '' }
  if (action.kind === 'delete-category') {
    return { title: t('library.context.deleteCategory'), description: t('library.confirmDeleteCategory', { name: action.name }) }
  }
  if (action.kind === 'delete-journal') {
    return { title: t('library.context.delete'), description: t('library.confirmDeleteJournal', { name: action.name }) }
  }
  return { title: t('library.context.delete'), description: t('library.confirmDeleteDocument', { name: action.name }) }
}

async function createDocument(): Promise<void> {
  if (creatingDocument.value) return
  creatingDocument.value = true
  try {
    const categoryId = selectedCategoryId.value === 'all' ? null : selectedCategoryId.value
    const created = await documentStore.createDocument({ categoryId })
    if (created) selectedCategoryId.value = 'all'
  } finally {
    creatingDocument.value = false
  }
}

async function openCategoryMenu(): Promise<void> {
  categoryError.value = null
  categoryDraft.value = ''
  categoryMenuOpen.value = true
  await nextTick()
  categoryInput.value?.focus()
}

function closeCategoryMenu(): void {
  categoryMenuOpen.value = false
  categoryDraft.value = ''
  categoryError.value = null
}

async function submitCategory(): Promise<void> {
  if (creatingCategory.value) return
  const validation = validateCategoryDraft(categoryDraft.value, documentStore.categories)
  if (!validation.valid) {
    categoryError.value = validation.error
    return
  }
  creatingCategory.value = true
  categoryError.value = null
  try {
    const category = await documentStore.createCategory(validation.name)
    if (category) {
      selectedCategoryId.value = category.id
      closeCategoryMenu()
    } else {
      categoryError.value = documentStore.error ?? '新建分类失败'
    }
  } finally {
    creatingCategory.value = false
  }
}

function handleCategoryInvalid(event: Event): void {
  event.preventDefault()
}

function focusSearch(): void {
  searchInput.value?.focus()
  searchInput.value?.select()
}

function handleSearchEscape(): void {
  if (query.value) {
    query.value = ''
    return
  }
  searchInput.value?.blur()
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (shouldFocusKnowledgeSearch(event) && !shouldYieldShortcutToEditor(event.target)) {
    event.preventDefault()
    focusSearch()
    return
  }
  if (categoryMenuOpen.value && shouldDismissLayer({ type: event.type, key: event.key }, event.target, '.category-popover, .new-category-button')) {
    closeCategoryMenu()
  }
}

function handlePointerDown(event: PointerEvent): void {
  if (!categoryMenuOpen.value) return
  if (shouldDismissLayer(event, event.target, '.category-popover, .new-category-button')) {
    closeCategoryMenu()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('pointerdown', handlePointerDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('pointerdown', handlePointerDown)
})
</script>

<template>
  <aside v-if="ui.sidebarVisible && !ui.focusMode" class="resource-sidebar" :aria-label="t('library.aria')">
    <header class="resource-heading">
      <h1>{{ t('library.title') }}</h1>
      <div class="resource-actions">
        <button
          type="button"
          class="subtle-round"
          :title="t('library.importTitle')"
          :aria-label="t('library.importTitle')"
          data-testid="sidebar-import"
          :disabled="Boolean(props.loadError) || props.initializing"
          @click="emit('importDocuments')"
        >
          <AppIcon name="filePlus" :size="15" />
        </button>
        <div class="category-menu-anchor">
          <button
            type="button"
            class="subtle-round new-category-button"
            :class="{ active: categoryMenuOpen }"
            :title="t('library.newCategoryTitle')"
            :aria-label="t('library.newCategoryTitle')"
            :aria-expanded="categoryMenuOpen"
            @click="categoryMenuOpen ? closeCategoryMenu() : openCategoryMenu()"
          >
            <AppIcon name="folder" :size="15" />
          </button>
          <form
            v-if="categoryMenuOpen"
            ref="categoryMenu"
            class="category-popover"
            novalidate
            @submit.prevent="submitCategory"
            @invalid.capture="handleCategoryInvalid"
          >
            <label for="new-category-name">{{ t('library.newCategoryLabel') }}</label>
            <input
              id="new-category-name"
              ref="categoryInput"
              v-model="categoryDraft"
              maxlength="80"
              autocomplete="off"
              :placeholder="t('library.newCategoryPlaceholder')"
              :disabled="creatingCategory"
            />
            <p v-if="categoryError" class="popover-error" role="alert">{{ categoryError }}</p>
            <div class="popover-actions">
              <button type="button" :disabled="creatingCategory" @click="closeCategoryMenu">{{ t('common.cancel') }}</button>
              <button type="submit" class="popover-primary" :disabled="creatingCategory">
                {{ creatingCategory ? t('library.creatingCategory') : t('library.createCategory') }}
              </button>
            </div>
          </form>
        </div>
        <button
          type="button"
          class="add-round"
          :title="t('library.newDocumentTitle')"
          :aria-label="t('library.newDocumentTitle')"
          data-testid="sidebar-new-document"
          :disabled="creatingDocument || Boolean(props.loadError) || props.initializing"
          @click="createDocument"
        >
          <AppIcon name="plus" :size="18" />
        </button>
      </div>
    </header>

    <label class="search-box">
      <AppIcon name="search" :size="17" />
      <input
        ref="searchInput"
        v-model="query"
        type="search"
        :placeholder="t('library.searchPlaceholder')"
        :aria-label="t('library.searchAria')"
        @keydown.esc.prevent="handleSearchEscape"
      />
      <kbd>{{ shortcut }}</kbd>
    </label>

    <nav class="tree" :aria-label="t('library.treeAria')">
      <template v-for="item in categoryTree" :key="categoryKey(item.categoryId)">
        <button
          class="tree-row"
          :class="{ active: selectedCategoryId === item.categoryId, 'tree-root': item.categoryId === 'all' }"
          type="button"
          :aria-current="selectedCategoryId === item.categoryId ? 'page' : undefined"
          @click="selectCategory(item.categoryId)"
          @contextmenu="openCategoryMenuAt($event, item.categoryId)"
        >
          <AppIcon :name="item.categoryId === 'all' ? 'library' : 'folder'" :size="15" class="tree-caret" />
          <span class="folder-icon"><AppIcon :name="item.categoryId === 'all' ? 'library' : 'folder'" :size="17" /></span>
          <span class="tree-label">{{ item.label }}</span>
          <span class="tree-count">{{ item.count }}</span>
        </button>
      </template>
    </nav>

    <section v-if="props.loadError" class="sidebar-state" role="alert">
      <AppIcon name="info" :size="21" />
      <strong>{{ t('library.loadErrorTitle') }}</strong>
      <span>{{ props.loadError }}</span>
      <button type="button" :disabled="props.initializing" @click="emit('retryLoad')">
        {{ props.initializing ? t('library.readingNow') : t('library.retryLoad') }}
      </button>
    </section>

    <section v-else class="recent-section">
      <header class="recent-heading">
        <h2>{{ query.trim() ? t('library.searchResults') : t('library.recentHeading') }}</h2>
        <button
          v-if="canExpand"
          type="button"
          class="text-button"
          :aria-expanded="expanded"
          @click="expanded = !expanded"
        >
          {{ expanded ? t('library.collapse') : t('library.viewMore') }}
          <AppIcon :name="expanded ? 'chevronDown' : 'chevronRight'" :size="13" />
        </button>
      </header>

      <div class="recent-list">
        <div
          v-for="entry in recentEntries"
          :key="entry.kind + entry.id"
          class="recent-item"
          :class="{ active: entry.kind === 'document' && documentStore.current?.id === entry.id }"
          :data-entry-kind="entry.kind"
          role="button"
          tabindex="0"
          @click="selectEntry(entry)"
          @keydown.enter="selectEntry(entry)"
          @contextmenu="openEntryMenuAt($event, entry)"
        >
          <span class="recent-icon" :class="`tone-${entryTone(entry)}`"><AppIcon :name="entryIcon(entry)" :size="17" /></span>
          <span class="recent-copy">
            <strong>{{ entry.title }}</strong>
            <small>{{ entry.kind === 'journal' ? t('library.journalPrefix') : '' }}{{ formatKnowledgeUpdatedAt(entry.updatedAt) }}</small>
          </span>
          <span v-if="entry.kind === 'document' && entry.record.favorite" class="recent-star" :aria-label="t('library.favoriteBadge')">★</span>
          <button
            type="button"
            class="recent-more"
            :aria-label="t('common.more')"
            data-testid="sidebar-entry-menu"
            @click.stop="openMenuForButton($event, entry)"
          ><AppIcon name="more" :size="16" /></button>
        </div>

        <div v-if="props.initializing" class="empty-search">
          <span>{{ t('library.loading') }}</span>
        </div>
        <div v-else-if="recentEntries.length === 0" class="empty-search">
          <AppIcon name="search" :size="22" />
          <span>{{ query.trim() ? t('library.emptyNoResults') : t('library.emptyCategory') }}</span>
        </div>
      </div>
    </section>

    <footer class="sync-footer" :class="`save-${saveStatus.tone}`" aria-live="polite">
      <span class="sync-check">
        <AppIcon :name="saveStatus.tone === 'error' ? 'info' : saveStatus.tone === 'saving' || saveStatus.tone === 'dirty' ? 'clock' : 'check'" :size="14" />
      </span>
      <span><strong>{{ saveStatus.label }}</strong><small>{{ saveStatus.detail }}</small></span>
      <button
        v-if="documentStore.saveState.phase === 'error'"
        type="button"
        class="footer-retry"
        @click="documentStore.retrySave()"
      >{{ t('common.retry') }}</button>
    </footer>

    <ContextMenu
      :open="contextMenu.open"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :items="contextMenu.items"
      @select="handleContextSelect"
      @close="contextMenu.open = false"
    />

    <PromptDialog
      :open="pendingAction?.kind.startsWith('rename') === true"
      :title="promptTitle()"
      :initial-value="pendingAction?.name ?? ''"
      :error="promptError"
      maxlength="120"
      @submit="submitPrompt"
      @close="pendingAction = null; promptError = null"
    />

    <ConfirmDialog
      :open="pendingAction?.kind.startsWith('delete') === true"
      :title="confirmConfig().title"
      :description="confirmConfig().description"
      :danger="true"
      :confirm-label="t('common.delete')"
      @confirm="confirmDelete"
      @close="pendingAction = null"
    />
  </aside>
</template>

<style scoped>
.resource-sidebar {
  display: flex;
  width: var(--sidebar-width, 302px);
  flex: 0 0 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid var(--border-soft);
  background: var(--panel-bg);
  transition: width 180ms ease;
}

.resource-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22px 22px 14px;
}

.resource-heading h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 680;
  letter-spacing: -0.01em;
}

.resource-actions {
  display: flex;
  align-items: center;
  gap: 7px;
}

.subtle-round,
.add-round {
  display: grid;
  width: 27px;
  height: 27px;
  place-items: center;
  border: 1px solid var(--border-soft);
  border-radius: 50%;
  background: var(--panel-strong);
  color: var(--text-secondary);
  cursor: pointer;
}

.add-round {
  border-color: var(--border-soft);
  background: var(--surface-chip);
}

.search-box {
  display: flex;
  height: 38px;
  align-items: center;
  gap: 8px;
  margin: 0 18px 16px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: var(--surface-input);
  color: var(--text-secondary);
  transition: border-color 150ms ease, background 150ms ease;
}

.search-box:focus-within {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border-soft));
  background: var(--panel-strong);
}

.search-box input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
  font-size: 12px;
}

.search-box input::placeholder {
  color: var(--text-placeholder);
}

.search-box kbd {
  flex: 0 0 auto;
  color: var(--text-hint);
  font-family: inherit;
  font-size: 10px;
}

.tree {
  flex: 0 0 auto;
  padding: 0 12px 9px;
  border-bottom: 1px solid var(--divider-soft);
}

.tree-row,
.tree-child {
  display: flex;
  width: 100%;
  align-items: center;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.tree-row {
  min-height: 35px;
  gap: 7px;
  padding: 0 7px;
  border-radius: 8px;
  color: var(--text-strong-muted);
  font-size: 13px;
}

.tree-row:hover,
.tree-child:hover {
  background: var(--panel-muted);
}

.tree-row.tree-root:first-child {
  background: var(--surface-hover);
  margin-bottom: 3px;
}

.tree-caret {
  flex: 0 0 15px;
  color: var(--text-secondary);
}

.folder-icon {
  display: grid;
  width: 21px;
  flex: 0 0 auto;
  place-items: center;
}

.folder-all { color: #6c5adf; background: transparent; }
.folder-personal { color: #6b58d9; }
.folder-independent { color: #3274ad; }
.folder-projects { color: #d5a62d; }
.folder-other { color: #888394; }

.tree-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-count {
  margin-left: auto;
  color: var(--text-meta);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.tree-children {
  padding: 2px 0 2px 23px;
}

.tree-child {
  min-height: 32px;
  gap: 9px;
  padding: 0 8px;
  border-radius: 8px;
  color: var(--text-row);
  font-size: 12px;
}

.child-icon {
  display: grid;
  width: 21px;
  height: 22px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 5px;
}

.tone-violet { background: #f0edff; color: #7968dd; }
.tone-blue { background: #eaf3fb; color: #5d91bd; }
.tone-amber { background: #fff5df; color: #d5a21f; }
.tone-mint { background: #eaf7f1; color: #55a682; }
.tone-coral { background: #fff0e8; color: #ed996e; }

.recent-section {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  padding: 17px 12px 8px;
}

.recent-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px 8px;
}

.recent-heading h2 {
  margin: 0;
  font-size: 13px;
  font-weight: 680;
}

.text-button {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 0;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font-size: 10px;
}

.recent-list {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 3px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
}

.recent-item {
  display: flex;
  min-height: 49px;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.recent-item:hover {
  background: var(--panel-muted);
}

.recent-item.active {
  border-color: var(--border-row-active);
  background: var(--surface-row-active);
  box-shadow: 0 4px 14px rgba(88, 74, 155, 0.05);
}

.recent-icon {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 8px;
}

.recent-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 3px;
}

.recent-copy strong {
  overflow: hidden;
  color: var(--text-strong-muted);
  font-size: 11.5px;
  font-weight: 620;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-copy small {
  color: var(--text-meta);
  font-size: 9.5px;
}

.recent-more {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--motion-fast) var(--ease-out), background var(--motion-fast) var(--ease-out);
}

.recent-more:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.recent-star {
  color: #f3bd35;
  font-size: 11px;
}

.recent-item:hover .recent-more,
.recent-item.active .recent-more {
  opacity: 1;
}

.empty-search {
  display: flex;
  min-height: 120px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-tertiary);
  font-size: 11px;
}

.sync-footer {
  display: flex;
  min-height: 58px;
  align-items: center;
  gap: 10px;
  margin: 0 17px;
  border-top: 1px solid var(--divider-soft);
  color: var(--text-secondary);
}

.sync-check {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 50%;
  background: var(--state-success-bg);
  color: var(--state-success-fg);
}

.sync-footer > span:last-child {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sync-footer strong {
  color: var(--text-row);
  font-size: 10px;
  font-weight: 600;
}

.sync-footer small {
  color: var(--text-meta);
  font-size: 9px;
}

@media (max-width: 1120px) {
  .resource-sidebar {
    width: var(--sidebar-width, 302px);
  }
}
.category-menu-anchor { position: relative; }
.subtle-round.active { border-color: var(--accent-soft-border); background: var(--accent-soft-bg); color: var(--accent-strong); }
.subtle-round:disabled, .add-round:disabled { cursor: wait; opacity: .5; }
.category-popover {
  position: absolute;
  z-index: 30;
  top: 34px;
  right: -31px;
  display: flex;
  width: 222px;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border-soft);
  border-radius: 11px;
  background: var(--panel-strong);
  box-shadow: 0 14px 38px rgba(46, 37, 82, .16);
  color: var(--text-primary);
  font-size: 11px;
}
.category-popover label { font-weight: 650; }
.category-popover input {
  height: 32px;
  padding: 0 9px;
  border: 1px solid var(--border-soft);
  border-radius: 7px;
  outline: none;
  background: var(--panel-bg);
  color: var(--text-primary);
  font: inherit;
}
.category-popover input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft-bg); }
.popover-error { margin: 0; color: var(--state-danger-fg); line-height: 1.45; }
.popover-actions { display: flex; justify-content: flex-end; gap: 6px; }
.popover-actions button {
  height: 27px;
  padding: 0 9px;
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  background: var(--panel-strong);
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
}
.popover-actions button:disabled { cursor: wait; opacity: .6; }
.popover-actions .popover-primary { border-color: var(--accent); background: var(--accent); color: #fff; }
.tree-row.active { background: var(--accent-faint); color: var(--accent-strong); }
.tree-row.active .tree-count { color: var(--accent); }
.tree-row.tree-root:first-child { background: transparent; margin-bottom: 0; }
.tree-row.tree-root:first-child.active { background: var(--accent-faint); }
.recent-item:disabled { cursor: not-allowed; opacity: .7; }
.recent-item:disabled:hover { background: transparent; }
.recent-item:disabled .recent-copy small { color: var(--text-tertiary); }
.sidebar-state {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 18px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 10px;
}
.sidebar-state strong { color: var(--text-primary); font-size: 12px; }
.sidebar-state button {
  margin-top: 4px;
  padding: 6px 10px;
  border: 1px solid var(--accent);
  border-radius: 7px;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  font: inherit;
}
.save-error .sync-check { background: var(--state-danger-bg); color: var(--state-danger-fg); }
.save-dirty .sync-check, .save-saving .sync-check { background: var(--state-warning-bg); color: var(--state-warning-fg); }
.save-idle .sync-check { background: var(--surface-hover); color: var(--text-secondary); }
.footer-retry {
  margin-left: auto;
  border: 1px solid var(--state-danger-border);
  border-radius: 6px;
  padding: 4px 7px;
  background: var(--state-danger-bg);
  color: var(--state-danger-fg);
  cursor: pointer;
  font: inherit;
  font-size: 9px;
}
</style>
