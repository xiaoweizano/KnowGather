<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import NavigationRail from '../components/NavigationRail.vue'
import ResourceSidebar from '../components/ResourceSidebar.vue'
import EditorWorkspace from '../components/EditorWorkspace.vue'
import AppIcon from '../components/AppIcon.vue'
import { useDocumentStore } from '../stores/document'
import { useUiStore } from '../stores/ui'
import { getShizhiApi } from '../services/api'
import { resolveDocumentViewState } from './documentPageState'
import { resolveNavigationTarget, type NavigationKey } from './knowledgeNavigation'
import { formatKnowledgeUpdatedAt } from './knowledgeView'

const documentStore = useDocumentStore()
const ui = useUiStore()
const api = getShizhiApi()
const initializing = ref(false)
const creating = ref(false)
const activeNavigation = ref<NavigationKey>('library')
const creatingJournal = ref(false)
const deletingJournalId = ref<string | null>(null)
const journalActionError = ref<string | null>(null)
let disposeCloseRequest: (() => void) | null = null

const viewState = computed(() => resolveDocumentViewState({
  loading: initializing.value,
  error: documentStore.error,
  current: documentStore.current,
}))

const loadError = computed(() => documentStore.error ?? '无法读取知识库')
const activePage = computed(() => resolveNavigationTarget(activeNavigation.value))
const journalError = computed(() => journalActionError.value ?? documentStore.error)

function handleNavigation(key: NavigationKey): void {
  activeNavigation.value = key
  journalActionError.value = null
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (!documentStore.isDirty) return
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

async function createJournal(): Promise<void> {
  if (creatingJournal.value) return
  creatingJournal.value = true
  journalActionError.value = null
  try {
    const created = await documentStore.createJournal()
    if (!created) journalActionError.value = documentStore.error ?? '新建日志失败'
  } finally {
    creatingJournal.value = false
  }
}

async function deleteJournal(id: string): Promise<void> {
  if (deletingJournalId.value) return
  deletingJournalId.value = id
  journalActionError.value = null
  try {
    const deleted = await documentStore.deleteJournal(id)
    if (!deleted) journalActionError.value = documentStore.error ?? '删除日志失败'
  } finally {
    deletingJournalId.value = null
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
  disposeCloseRequest = api.window.onCloseRequested(() => {
    void documentStore.saveNow()
  })
  await loadKnowledgeBase()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  disposeCloseRequest?.()
  disposeCloseRequest = null
  void documentStore.saveNow()
  documentStore.dispose()
})
</script>

<template>
  <div class="document-shell" :class="ui.shellClasses">
    <NavigationRail
      :active-item="activeNavigation"
      @navigate="handleNavigation"
    />
    <template v-if="activePage.page === 'library'">
      <ResourceSidebar
        :initializing="initializing"
        :load-error="viewState === 'error' ? loadError : null"
        @retry-load="loadKnowledgeBase"
      />

      <EditorWorkspace
        v-if="viewState === 'editor' && documentStore.current"
        :key="documentStore.current.id"
        :document="documentStore.current"
      />

      <div v-else-if="viewState === 'loading'" class="app-loading" aria-live="polite">
        <span class="loading-mark">拾</span>
        <span>正在整理你的知识库…</span>
      </div>

      <section v-else-if="viewState === 'error'" class="app-loading app-error" role="alert">
        <AppIcon name="info" :size="25" />
        <strong>无法读取知识库</strong>
        <span>{{ loadError }}</span>
        <button type="button" :disabled="initializing" @click="loadKnowledgeBase">
          {{ initializing ? '正在读取…' : '重新读取' }}
        </button>
      </section>

      <section v-else class="app-loading app-empty">
        <span class="loading-mark">拾</span>
        <strong>从第一篇知识开始</strong>
        <span>创建的内容会真实保存到本机知识库。</span>
        <button type="button" :disabled="creating" @click="createFirstDocument">
          {{ creating ? '正在创建…' : '新建第一篇文档' }}
        </button>
      </section>
    </template>

    <section v-else-if="activePage.page === 'journal'" class="journal-page" aria-labelledby="journal-heading">
      <header class="journal-header">
        <div>
          <span class="journal-eyebrow">JOURNAL</span>
          <h1 id="journal-heading">日志</h1>
          <p>记录保存在本机，当前版本仅支持查看和删除。</p>
        </div>
        <button type="button" :disabled="creatingJournal" @click="createJournal">
          {{ creatingJournal ? '正在创建…' : '新建日志' }}
        </button>
      </header>

      <p v-if="journalError" class="journal-error" role="alert">{{ journalError }}</p>

      <div v-if="documentStore.journals.length" class="journal-list">
        <article v-for="journal in documentStore.journals" :key="journal.id" class="journal-card">
          <div class="journal-card-copy">
            <strong>{{ journal.title }}</strong>
            <span>{{ formatKnowledgeUpdatedAt(journal.updatedAt) }}</span>
            <small>日志编辑尚未接入，当前仅展示</small>
          </div>
          <button
            type="button"
            class="journal-delete"
            :disabled="deletingJournalId === journal.id"
            :aria-label="`删除日志：${journal.title}`"
            @click="deleteJournal(journal.id)"
          >
            {{ deletingJournalId === journal.id ? '正在删除…' : '删除' }}
          </button>
        </article>
      </div>

      <div v-else class="journal-empty">
        <span class="loading-mark">拾</span>
        <strong>还没有日志</strong>
        <span>新建的日志会真实写入本机数据库。</span>
      </div>
    </section>

    <section v-else class="app-loading app-unimplemented">
      <AppIcon name="info" :size="25" />
      <strong>该页面尚未实现</strong>
      <span>当前安装包暂未提供此页面，不会展示模拟内容。</span>
    </section>
  </div>
</template>

<style scoped>
.document-shell {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--panel-bg);
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

.app-error .loading-mark {
  animation: none;
}

@keyframes loading-float {
  50% { transform: translateY(-3px); }
}

.journal-page {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 18px;
  overflow: auto;
  padding: 44px clamp(24px, 6vw, 86px);
  background: linear-gradient(135deg, #fcfbff, #f7f4ff 55%, #fbfafc);
}

.journal-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 18px;
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

.journal-header > button {
  min-height: 36px;
  padding: 0 15px;
  border: 1px solid var(--accent);
  border-radius: 9px;
  background: var(--accent);
  color: white;
  cursor: pointer;
  font: inherit;
  font-weight: 650;
}

.journal-header > button:disabled,
.journal-delete:disabled {
  cursor: wait;
  opacity: 0.6;
}

.journal-error {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid #efd5d8;
  border-radius: 9px;
  background: #fff7f8;
  color: #a14956;
  font-size: 11px;
}

.journal-list {
  display: grid;
  gap: 10px;
  max-width: 900px;
}

.journal-card {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 16px 18px;
  border: 1px solid var(--border-soft);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.82);
}

.journal-card-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}

.journal-card-copy strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.journal-card-copy span,
.journal-card-copy small {
  color: var(--text-tertiary);
  font-size: 10px;
}

.journal-delete {
  padding: 6px 10px;
  border: 1px solid #efd5d8;
  border-radius: 7px;
  background: #fff7f8;
  color: #a14956;
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

.app-unimplemented .loading-mark {
  animation: none;
}
</style>
