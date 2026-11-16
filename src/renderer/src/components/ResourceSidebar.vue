<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { useDocumentStore } from '../stores/document'
import { useUiStore } from '../stores/ui'
import { getShizhiApi } from '../services/api'
import { formatShortcut } from '../../../shared/platform'
import { shouldFocusKnowledgeSearch } from '../app/knowledgeNavigation'
import {
  buildKnowledgeCategoryTree,
  limitKnowledgeEntries,
  resolveKnowledgeEntryAction,
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
}>()

const documentStore = useDocumentStore()
const ui = useUiStore()
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
  if (state.phase === 'saving') return { label: '正在保存', detail: '正在写入本机', tone: 'saving' }
  if (state.phase === 'dirty') return { label: '有未保存更改', detail: '稍后自动保存', tone: 'dirty' }
  if (state.phase === 'error') return { label: '保存失败', detail: state.error ?? '请重试', tone: 'error' }
  if (state.phase === 'saved' && state.lastSavedAt) {
    return { label: '已保存到本机', detail: formatKnowledgeUpdatedAt(state.lastSavedAt), tone: 'saved' }
  }
  if (props.loadError) return { label: '读取失败', detail: '请重试', tone: 'error' }
  if (documentStore.categories.length === 0 && documentStore.documents.length === 0 && documentStore.journals.length === 0) {
    return { label: '本地知识库为空', detail: '新建内容后会写入本机', tone: 'idle' }
  }
  return { label: '已从本机读取', detail: '更改将自动保存', tone: 'saved' }
})

function categoryKey(categoryId: string | null): string {
  return categoryId ?? '__uncategorized__'
}

function selectCategory(categoryId: string | null): void {
  selectedCategoryId.value = categoryId
  expanded.value = false
}

function selectEntry(entry: KnowledgeEntry): void {
  const action = resolveKnowledgeEntryAction(entry)
  if (!action.enabled) return
  if (entry.kind === 'document') void documentStore.selectDocument(entry.id)
}

function entryTone(entry: KnowledgeEntry): string {
  return entry.kind === 'journal' ? 'blue' : 'violet'
}

function entryIcon(entry: KnowledgeEntry): string {
  return entry.kind === 'journal' ? 'journal' : 'file'
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
  if (shouldFocusKnowledgeSearch(event)) {
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
  <aside v-if="ui.sidebarVisible" class="resource-sidebar" aria-label="知识库资源树">
    <header class="resource-heading">
      <h1>我的知识库</h1>
      <div class="resource-actions">
        <div class="category-menu-anchor">
          <button
            type="button"
            class="subtle-round new-category-button"
            :class="{ active: categoryMenuOpen }"
            title="新建分类"
            aria-label="新建分类"
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
            <label for="new-category-name">新建分类</label>
            <input
              id="new-category-name"
              ref="categoryInput"
              v-model="categoryDraft"
              maxlength="80"
              autocomplete="off"
              placeholder="输入分类名称"
              :disabled="creatingCategory"
            />
            <p v-if="categoryError" class="popover-error" role="alert">{{ categoryError }}</p>
            <div class="popover-actions">
              <button type="button" :disabled="creatingCategory" @click="closeCategoryMenu">取消</button>
              <button type="submit" class="popover-primary" :disabled="creatingCategory">
                {{ creatingCategory ? '正在创建…' : '创建分类' }}
              </button>
            </div>
          </form>
        </div>
        <button
          type="button"
          class="add-round"
          title="新建文档"
          aria-label="新建文档"
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
        placeholder="搜索文档、标签、日志..."
        aria-label="搜索文档、标签、日志"
        @keydown.esc.prevent="handleSearchEscape"
      />
      <kbd>{{ shortcut }}</kbd>
    </label>

    <nav class="tree" aria-label="知识库目录">
      <template v-for="item in categoryTree" :key="categoryKey(item.categoryId)">
        <button
          class="tree-row"
          :class="{ active: selectedCategoryId === item.categoryId, 'tree-root': item.categoryId === 'all' }"
          type="button"
          :aria-current="selectedCategoryId === item.categoryId ? 'page' : undefined"
          @click="selectCategory(item.categoryId)"
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
      <strong>知识库无法读取</strong>
      <span>{{ props.loadError }}</span>
      <button type="button" :disabled="props.initializing" @click="emit('retryLoad')">
        {{ props.initializing ? '正在读取…' : '重新读取' }}
      </button>
    </section>

    <section v-else class="recent-section">
      <header class="recent-heading">
        <h2>{{ query.trim() ? '搜索结果' : '最近编辑' }}</h2>
        <button
          v-if="canExpand"
          type="button"
          class="text-button"
          :aria-expanded="expanded"
          @click="expanded = !expanded"
        >
          {{ expanded ? '收起' : '查看更多' }}
          <AppIcon :name="expanded ? 'chevronDown' : 'chevronRight'" :size="13" />
        </button>
      </header>

      <div class="recent-list">
        <button
          v-for="entry in recentEntries"
          :key="entry.kind + entry.id"
          class="recent-item"
          :class="{ active: entry.kind === 'document' && documentStore.current?.id === entry.id }"
          type="button"
          :disabled="!resolveKnowledgeEntryAction(entry).enabled"
          :title="resolveKnowledgeEntryAction(entry).reason"
          :data-entry-kind="entry.kind"
          @click="selectEntry(entry)"
        >
          <span class="recent-icon" :class="`tone-${entryTone(entry)}`"><AppIcon :name="entryIcon(entry)" :size="17" /></span>
          <span class="recent-copy">
            <strong>{{ entry.title }}</strong>
            <small>{{ entry.kind === 'journal' ? '日志 · ' : '' }}{{ formatKnowledgeUpdatedAt(entry.updatedAt) }}</small>
          </span>
          <span class="recent-more" aria-hidden="true"><AppIcon :name="entry.kind === 'journal' ? 'info' : 'more'" :size="16" /></span>
        </button>

        <div v-if="props.initializing" class="empty-search">
          <span>正在读取知识库…</span>
        </div>
        <div v-else-if="recentEntries.length === 0" class="empty-search">
          <AppIcon name="search" :size="22" />
          <span>{{ query.trim() ? '没有找到相关内容' : '当前分类还没有内容' }}</span>
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
      >重试</button>
    </footer>
  </aside>
</template>

<style scoped>
.resource-sidebar {
  display: flex;
  width: 302px;
  flex: 0 0 auto;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--border-soft);
  background: var(--panel-bg);
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
  background: #f5f3fb;
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
  background: #f4f2f8;
  color: #8f8a9d;
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
  color: #9a96a7;
}

.search-box kbd {
  flex: 0 0 auto;
  color: #a6a1b2;
  font-family: inherit;
  font-size: 10px;
}

.tree {
  flex: 0 0 auto;
  padding: 0 12px 9px;
  border-bottom: 1px solid #efedf4;
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
  color: #464154;
  font-size: 13px;
}

.tree-row:hover,
.tree-child:hover {
  background: var(--panel-muted);
}

.tree-row.tree-root:first-child {
  background: #f3f1f8;
  margin-bottom: 3px;
}

.tree-caret {
  flex: 0 0 15px;
  color: #777184;
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
  color: #9893a4;
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
  color: #625d6e;
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
  color: #877de0;
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
  scrollbar-color: #ddd8eb transparent;
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
  border-color: #ece8fb;
  background: linear-gradient(90deg, #f4f1ff, #f7f5ff);
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
  color: #464150;
  font-size: 11.5px;
  font-weight: 620;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-copy small {
  color: #9b96a8;
  font-size: 9.5px;
}

.recent-more {
  opacity: 0;
  color: #8f8a9c;
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
  border-top: 1px solid #efedf4;
  color: var(--text-secondary);
}

.sync-check {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 50%;
  background: #e9f7f0;
  color: #4ca580;
}

.sync-footer > span:last-child {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sync-footer strong {
  color: #615c6d;
  font-size: 10px;
  font-weight: 600;
}

.sync-footer small {
  color: #a5a0ae;
  font-size: 9px;
}

@media (max-width: 1120px) {
  .resource-sidebar {
    width: 260px;
  }
}
.category-menu-anchor { position: relative; }
.subtle-round.active { border-color: #dcd4fb; background: #f0ecff; color: #6957d4; }
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
.category-popover input:focus { border-color: #9f90e9; box-shadow: 0 0 0 2px #f0ecff; }
.popover-error { margin: 0; color: #a14956; line-height: 1.45; }
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
.popover-actions .popover-primary { border-color: #7561df; background: #7561df; color: #fff; }
.tree-row.active { background: #f1edff; color: #5745c1; }
.tree-row.active .tree-count { color: #7561df; }
.tree-row.tree-root:first-child { background: transparent; margin-bottom: 0; }
.tree-row.tree-root:first-child.active { background: #f1edff; }
.recent-item:disabled { cursor: not-allowed; opacity: .7; }
.recent-item:disabled:hover { background: transparent; }
.recent-item:disabled .recent-copy small { color: #b1a8bd; }
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
  border: 1px solid #7561df;
  border-radius: 7px;
  background: #7561df;
  color: #fff;
  cursor: pointer;
  font: inherit;
}
.save-error .sync-check { background: #fff1f3; color: #a14956; }
.save-dirty .sync-check, .save-saving .sync-check { background: #fff6e4; color: #b78620; }
.save-idle .sync-check { background: #f3f1f7; color: #817b8e; }
.footer-retry {
  margin-left: auto;
  border: 1px solid #efd5d8;
  border-radius: 6px;
  padding: 4px 7px;
  background: #fff7f8;
  color: #a14956;
  cursor: pointer;
  font: inherit;
  font-size: 9px;
}
</style>
