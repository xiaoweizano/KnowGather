<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import type { Editor } from '@tiptap/core'
import type { DocumentRecord, TiptapDocument } from '../../../shared/document'
import type { AttachmentReference } from '../../../shared/document'
import AppIcon from './AppIcon.vue'
import DocumentHeader from './DocumentHeader.vue'
import EditorToolbar from '../editor/components/EditorToolbar.vue'
import EditorCanvas from '../editor/components/EditorCanvas.vue'
import EditorStatusBar from './EditorStatusBar.vue'
import ShortcutsHelp from './ShortcutsHelp.vue'
import { useDocumentStore } from '../stores/document'
import { useUiStore } from '../stores/ui'
import { getShizhiApi } from '../services/api'

const props = defineProps<{ document: DocumentRecord }>()
const documentStore = useDocumentStore()
const ui = useUiStore()
const api = getShizhiApi()
const editor = shallowRef<Editor | null>(null)
const selectionActive = ref(false)
const toast = ref('')
const settingsOpen = ref(false)
const fontMenuOpen = ref(false)
const shortcutsOpen = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null

const isError = computed(() => documentStore.saveState.phase === 'error')
const errorMessage = computed(() => documentStore.saveState.error ?? '保存失败，请检查本地存储后重试')

function handleEditorReady(instance: Editor | null): void {
  editor.value = instance
  if (instance) documentStore.registerEditor(instance.instanceId)
}

function handleChange(content: TiptapDocument): void {
  documentStore.updateContent(content)
}

function handleTitle(title: string): void {
  documentStore.updateTitle(title)
}

async function shareDocument(): Promise<void> {
  const title = documentStore.current?.title ?? '未命名文档'
  try {
    await navigator.clipboard.writeText(`拾知文档：${title}`)
    showToast('文档信息已复制')
  } catch {
    showToast('分享信息已准备好')
  }
}

function showToast(message: string): void {
  toast.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 2200)
}

async function retrySave(): Promise<void> {
  const ok = await documentStore.retrySave()
  showToast(ok ? '已重新保存' : '仍然无法保存，请稍后重试')
}

async function pickImages(): Promise<void> {
  try {
    const references = await api.attachments.pickImages()
    insertImages(references)
  } catch {
    showToast('无法读取所选图片')
  }
}

function insertImages(references: AttachmentReference[]): void {
  if (!editor.value || references.length === 0) return
  for (const reference of references) {
    editor.value.chain().focus().insertContent({
      type: 'image',
      attrs: {
        src: reference.url,
        alt: reference.name,
        title: reference.name,
        width: '100',
        align: 'center',
      },
    }).run()
  }
  showToast(references.length === 1 ? '图片已插入' : `已插入 ${references.length} 张图片`)
}

async function pickAttachments(): Promise<void> {
  try {
    const references = await api.attachments.pickFiles()
    insertAttachments(references)
  } catch {
    showToast('无法读取所选附件')
  }
}

function insertAttachments(references: AttachmentReference[]): void {
  if (!editor.value || references.length === 0) return
  for (const reference of references) {
    editor.value.chain().focus().insertContent({
      type: 'attachment',
      attrs: { ...reference },
    }).run()
  }
  showToast(references.length === 1 ? '附件已添加' : `已添加 ${references.length} 个附件`)
}

function insertTable(): void {
  const currentEditor = editor.value
  if (!currentEditor) return
  currentEditor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  showToast('已插入 3 × 3 表格')
}

onBeforeUnmount(() => {
  if (toastTimer) clearTimeout(toastTimer)
  if (editor.value) documentStore.unregisterEditor(editor.value.instanceId)
})

function handleWorkspaceShortcuts(event: KeyboardEvent): void {
  if (event.isComposing || !event.ctrlKey || !event.shiftKey || event.key.toLowerCase() !== 'f') return
  event.preventDefault()
  ui.toggleFocusMode()
}

onMounted(() => document.addEventListener('keydown', handleWorkspaceShortcuts))
onBeforeUnmount(() => document.removeEventListener('keydown', handleWorkspaceShortcuts))
</script>

<template>
  <section class="editor-workspace">
    <div class="utility-bar">
      <button class="workspace-brand" type="button" title="拾知">
        <span class="mini-logo">拾</span>
      </button>
      <div class="utility-spacer" />
      <button type="button" class="utility-button" title="搜索"><AppIcon name="search" :size="20" /></button>
      <button type="button" class="utility-button notification-button" title="通知">
        <AppIcon name="bell" :size="20" />
        <span class="notification-dot" />
      </button>
      <button type="button" class="avatar-button" title="个人账户">知</button>
    </div>

    <DocumentHeader
      :document="props.document"
      @update-title="handleTitle"
      @share="shareDocument"
    />

    <div class="toolbar-wrap">
      <EditorToolbar
        :editor="editor"
        @request-image="pickImages"
        @request-attachment="pickAttachments"
        @insert-table="insertTable"
      />
      <div class="toolbar-scrim" />
    </div>

    <div v-if="isError" class="save-error-banner" role="alert">
      <span class="error-icon"><AppIcon name="info" :size="17" /></span>
      <span class="error-copy"><strong>自动保存失败</strong><small>{{ errorMessage }}</small></span>
      <button type="button" @click="retrySave"><AppIcon name="retry" :size="14" /> 重试</button>
    </div>

    <EditorCanvas
      :content="props.document.content"
      :document-id="props.document.id"
      @ready="handleEditorReady"
      @change="handleChange"
      @selection-change="selectionActive = $event"
      @request-image="pickImages"
      @request-attachment="pickAttachments"
      @insert-table="insertTable"
    />

    <EditorStatusBar />

    <Transition name="toast">
      <div v-if="toast" class="workspace-toast" role="status">{{ toast }}</div>
    </Transition>

    <div class="workspace-utility-actions">
      <button type="button" :title="ui.theme === 'light' ? '切换深色主题' : '切换浅色主题'" @click="ui.toggleTheme()">
        <AppIcon :name="ui.theme === 'light' ? 'moon' : 'sun'" :size="16" />
      </button>
      <button type="button" title="键盘快捷键" @click="shortcutsOpen = true">
        <AppIcon name="keyboard" :size="16" />
      </button>
    </div>

    <ShortcutsHelp :open="shortcutsOpen" @close="shortcutsOpen = false" />
  </section>
</template>

<style scoped>
.editor-workspace {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  background: var(--panel-strong);
}

.utility-bar {
  display: flex;
  height: 48px;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  padding: 0 21px;
  border-bottom: 1px solid #f2eff6;
  background: var(--panel-strong);
}

.workspace-brand {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.mini-logo {
  display: grid;
  width: 27px;
  height: 27px;
  place-items: center;
  border: 1px solid #e8e2ff;
  border-radius: 8px;
  background: #f3efff;
  color: #7561df;
  font-size: 13px;
  font-weight: 750;
}

.utility-spacer {
  flex: 1;
}

.utility-button,
.avatar-button {
  position: relative;
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #625d6d;
  cursor: pointer;
}

.utility-button:hover {
  background: var(--panel-muted);
}

.notification-dot {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 5px;
  height: 5px;
  border: 1px solid white;
  border-radius: 50%;
  background: #f27b76;
}

.avatar-button {
  margin-left: 2px;
  border-radius: 50%;
  background: linear-gradient(145deg, #dfd6ef, #b7a8d0);
  color: #4c405e;
  font-size: 12px;
  font-weight: 700;
}

.toolbar-wrap {
  position: relative;
  flex: 0 0 auto;
  min-width: 0;
}

.toolbar-scrim {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 24px;
  background: linear-gradient(90deg, transparent, var(--panel-strong));
  pointer-events: none;
}

.save-error-banner {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 9px;
  margin: 8px 24px 0;
  padding: 8px 10px;
  border: 1px solid #f3dadd;
  border-radius: 9px;
  background: #fff5f6;
  color: #9e4754;
  font-size: 10px;
}

.error-icon {
  display: grid;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 7px;
  background: #ffe7ea;
}

.error-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.error-copy strong {
  font-size: 10.5px;
}

.error-copy small {
  color: #b4747d;
  font-size: 9.5px;
}

.save-error-banner button {
  display: inline-flex;
  height: 26px;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding: 0 9px;
  border: 1px solid #e8bcc2;
  border-radius: 6px;
  background: white;
  color: #a14956;
  cursor: pointer;
  font-size: 9.5px;
}

.workspace-toast {
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

.workspace-utility-actions {
  position: absolute;
  right: 18px;
  bottom: 52px;
  z-index: 4;
  display: flex;
  gap: 5px;
}

.workspace-utility-actions button {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: color-mix(in srgb, var(--panel-strong) 92%, transparent);
  color: var(--text-secondary);
  cursor: pointer;
  backdrop-filter: blur(8px);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(5px);
}

@media (max-width: 1150px) {
  .utility-bar {
    padding-right: 14px;
    padding-left: 14px;
  }
}
</style>
