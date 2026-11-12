<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { useDocumentStore } from '../stores/document'
import { useUiStore } from '../stores/ui'

const documentStore = useDocumentStore()
const ui = useUiStore()
const query = ref('')
const expanded = ref(new Set(['all', 'personal', 'independent', 'projects']))

const filteredDocuments = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase()
  if (!keyword) return documentStore.documents
  return documentStore.documents.filter((document) =>
    [document.title, ...document.tags].some((value) => value.toLocaleLowerCase().includes(keyword)),
  )
})

const treeItems = [
  { id: 'all', label: '全部文档', count: 248, icon: 'folder' },
  { id: 'personal', label: '个人知识库', count: 128, icon: 'folder', children: true },
  { id: 'independent', label: '独立日志', count: 87, icon: 'folder', children: false },
  { id: 'projects', label: '项目管理', count: 33, icon: 'folder', children: false },
  { id: 'other', label: '其他', count: 20, icon: 'folder', children: false },
]

function toggleTree(id: string): void {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

function isExpanded(id: string): boolean {
  return expanded.value.has(id)
}

function selectDocument(id: string): void {
  void documentStore.selectDocument(id)
}

function documentIcon(index: number): string {
  return ['file', 'journal', 'file', 'quoteCard', 'quoteCard'][index % 5] ?? 'file'
}

function documentTone(index: number): string {
  return ['violet', 'blue', 'violet', 'amber', 'coral'][index % 5] ?? 'violet'
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value)
  const now = new Date('2026-11-11T08:30:00.000Z')
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}
</script>

<template>
  <aside v-if="ui.sidebarVisible" class="resource-sidebar" aria-label="知识库资源树">
    <header class="resource-heading">
      <h1>我的知识库</h1>
      <div class="resource-actions">
        <button type="button" class="subtle-round" title="新建文件夹"><AppIcon name="chevronDown" :size="15" /></button>
        <button type="button" class="add-round" title="新建文档"><AppIcon name="plus" :size="18" /></button>
      </div>
    </header>

    <label class="search-box">
      <AppIcon name="search" :size="17" />
      <input v-model="query" type="search" placeholder="搜索文档、标签..." aria-label="搜索文档、标签" />
      <kbd>⌘ K</kbd>
    </label>

    <nav class="tree" aria-label="知识库目录">
      <div v-for="item in treeItems" :key="item.id" class="tree-group">
        <button class="tree-row" :class="{ 'tree-root': item.children }" type="button" @click="item.children ? toggleTree(item.id) : undefined">
          <AppIcon
            :name="item.children ? (isExpanded(item.id) ? 'chevronDown' : 'chevronRight') : 'folder'"
            :size="15"
            class="tree-caret"
          />
          <span class="folder-icon" :class="`folder-${item.id}`"><AppIcon :name="item.icon" :size="17" /></span>
          <span class="tree-label">{{ item.label }}</span>
          <span class="tree-count">{{ item.count }}</span>
        </button>

        <div v-if="item.id === 'personal' && item.children && isExpanded(item.id)" class="tree-children">
          <button v-for="child in [
            { label: '工作笔记', count: 32, tone: 'violet' },
            { label: '学习笔记', count: 28, tone: 'blue' },
            { label: '生活随笔', count: 24, tone: 'amber' },
            { label: '技术笔记', count: 44, tone: 'mint' },
          ]" :key="child.label" class="tree-child" type="button">
            <span class="child-icon" :class="`tone-${child.tone}`"><AppIcon name="file" :size="15" /></span>
            <span>{{ child.label }}</span>
            <span class="tree-count">{{ child.count }}</span>
          </button>
        </div>
      </div>
    </nav>

    <section class="recent-section">
      <header class="recent-heading">
        <h2>{{ query ? '搜索结果' : '最近编辑' }}</h2>
        <button v-if="!query" type="button" class="text-button">查看更多 <AppIcon name="chevronRight" :size="13" /></button>
      </header>

      <div class="recent-list">
        <button
          v-for="(document, index) in filteredDocuments"
          :key="document.id"
          class="recent-item"
          :class="{ active: documentStore.current?.id === document.id }"
          type="button"
          @click="selectDocument(document.id)"
        >
          <span class="recent-icon" :class="`tone-${documentTone(index)}`"><AppIcon :name="documentIcon(index)" :size="17" /></span>
          <span class="recent-copy">
            <strong>{{ document.title }}</strong>
            <small>{{ formatUpdatedAt(document.updatedAt) }}</small>
          </span>
          <span class="recent-more" aria-hidden="true"><AppIcon name="more" :size="16" /></span>
        </button>
        <div v-if="filteredDocuments.length === 0" class="empty-search">
          <AppIcon name="search" :size="22" />
          <span>没有找到相关文档</span>
        </div>
      </div>
    </section>

    <footer class="sync-footer">
      <span class="sync-check"><AppIcon name="check" :size="14" /></span>
      <span><strong>同步完成</strong><small>刚刚</small></span>
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
</style>
