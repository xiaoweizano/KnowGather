<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import type { Editor } from '@tiptap/core'
import type { DocumentRecord, TiptapDocument } from '../../../shared/document'
import type { AttachmentReference } from '../../../shared/document'
import AppIcon from './AppIcon.vue'
import DocumentHeader from './DocumentHeader.vue'
import EditorPane from './EditorPane.vue'
import ShortcutsHelp from './ShortcutsHelp.vue'
import { useDocumentStore } from '../stores/document'
import { useUiStore } from '../stores/ui'
import { getShizhiApi } from '../services/api'
import { plainTextPreview } from '../editor/core/markdown'
import { formatKnowledgeUpdatedAt } from '../app/knowledgeView'
import { useI18n } from '../i18n/useI18n'

const props = defineProps<{ document: DocumentRecord }>()
const documentStore = useDocumentStore()
const ui = useUiStore()
const { t, locale } = useI18n()
const api = getShizhiApi()
const editor = shallowRef<Editor | null>(null)
const selectionActive = ref(false)
const toast = ref('')
const shortcutsOpen = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null

const isError = computed(() => documentStore.saveState.phase === 'error')
const errorMessage = computed(() => documentStore.saveState.error ?? t('document.saveError.fallback'))
const saveStatusMessage = computed(() => {
  const state = documentStore.saveState
  if (state.phase === 'saving') return t('document.save.saving')
  if (state.phase === 'dirty') return t('document.save.dirty')
  if (state.phase === 'error') return t('document.save.error', { message: state.error ?? t('common.pleaseRetry') })
  if (state.lastSavedAt) return t('document.save.saved', { time: formatKnowledgeUpdatedAt(state.lastSavedAt, new Date(), locale.value) })
  return t('document.save.idle')
})

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

function handleToggleFavorite(): void {
  const favorite = documentStore.toggleFavorite()
  showToast(favorite ? t('document.toast.favorited') : t('document.toast.unfavorited'))
}

function handleAddTag(tag: string): void {
  showToast(documentStore.addTag(tag) ? t('document.toast.tagAdded', { tag }) : t('document.toast.tagExists'))
}

function handleRemoveTag(tag: string): void {
  documentStore.removeTag(tag)
  showToast(t('document.toast.tagRemoved', { tag }))
}

async function handleCreateDocument(): Promise<void> {
  const created = await documentStore.createDocument({ categoryId: props.document.categoryId })
  showToast(created ? t('document.toast.created') : (documentStore.error ?? t('common.loading')))
}

async function handleDeleteDocument(): Promise<void> {
  const ok = await documentStore.deleteDocument(props.document.id)
  showToast(ok ? t('document.toast.deleted') : (documentStore.error ?? t('common.saveFailed')))
}

async function shareDocument(): Promise<void> {
  const document = documentStore.current
  if (!document) return
  const preview = plainTextPreview(document.content)
  const payload = [
    t('document.shareTitle', { title: document.title }),
    preview ? `\n${preview}` : '',
    `\n${t('document.shareEditedAt', { time: formatKnowledgeUpdatedAt(document.updatedAt, new Date(), locale.value) })}`,
  ].join('')
  try {
    await navigator.clipboard.writeText(payload)
    showToast(t('document.toast.shared'))
  } catch {
    showToast(t('document.toast.shareFailed'))
  }
}

function showToast(message: string): void {
  toast.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 2200)
}

function focusKnowledgeSearch(): void {
  const input = document.querySelector<HTMLInputElement>('.search-box input')
  if (!input) {
    showToast(t('document.toast.searchMissing'))
    return
  }
  input.focus()
  input.select()
}

async function retrySave(): Promise<void> {
  const ok = await documentStore.retrySave()
  showToast(ok ? t('document.toast.retried') : t('document.toast.retryFailed'))
}

async function pickImages(): Promise<void> {
  try {
    const references = await api.attachments.pickImages()
    insertImages(references)
  } catch {
    showToast(t('document.toast.imageFailed'))
  }
}

/** Drop-in insertion used by the editor's own slash menu and drop handler. */
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
  showToast(references.length === 1 ? t('document.toast.imageInserted') : t('document.toast.imagesInserted', { count: references.length }))
}

async function pickAttachments(): Promise<void> {
  try {
    const references = await api.attachments.pickFiles()
    insertAttachments(references)
  } catch {
    showToast(t('document.toast.attachmentFailed'))
  }
}

/** Drop-in insertion used by the editor's own slash menu and drop handler. */
function insertAttachments(references: AttachmentReference[]): void {
  if (!editor.value || references.length === 0) return
  for (const reference of references) {
    editor.value.chain().focus().insertContent({
      type: 'attachment',
      attrs: { ...reference },
    }).run()
  }
  showToast(references.length === 1 ? t('document.toast.attachmentInserted') : t('document.toast.attachmentsInserted', { count: references.length }))
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
      <button class="workspace-brand" type="button" :title="t('document.workspaceHome')" @click="focusKnowledgeSearch">
        <span class="mini-logo">{{ t('document.brandLetter') }}</span>
      </button>
      <div class="utility-spacer" />
      <button type="button" class="utility-button" :title="t('document.searchTitle')" :aria-label="t('document.searchAria')" @click="focusKnowledgeSearch">
        <AppIcon name="search" :size="20" />
      </button>
      <button
        type="button"
        class="utility-button notification-button"
        :title="t('common.saved')"
        :aria-label="t('document.toast.saveStatus')"
        @click="showToast(saveStatusMessage)"
      >
        <AppIcon :name="isError ? 'info' : documentStore.saveState.phase === 'saved' ? 'check' : 'clock'" :size="20" />
        <span v-if="isError" class="notification-dot" />
      </button>
      <button type="button" class="avatar-button" :title="t('document.toast.currentDocAria')" :aria-label="t('document.toast.currentDocAria')" @click="showToast(t('document.toast.currentDocument', { title: props.document.title }))">{{ t('document.avatarLetter') }}</button>
    </div>

    <DocumentHeader
      :document="props.document"
      @update-title="handleTitle"
      @toggle-favorite="handleToggleFavorite"
      @share="shareDocument"
      @add-tag="handleAddTag"
      @remove-tag="handleRemoveTag"
      @create-document="handleCreateDocument"
      @delete-document="handleDeleteDocument"
    />

    <div v-if="isError" class="save-error-banner" role="alert">
      <span class="error-icon"><AppIcon name="info" :size="17" /></span>
      <span class="error-copy"><strong>{{ t('document.saveError.title') }}</strong><small>{{ errorMessage }}</small></span>
      <button type="button" @click="retrySave"><AppIcon name="retry" :size="14" /> {{ t('common.retry') }}</button>
    </div>

    <EditorPane
      :content="props.document.content"
      :document-id="props.document.id"
      @ready="handleEditorReady"
      @change="handleChange"
      @selection-change="selectionActive = $event"
      @notify="showToast"
    />

    <Transition name="toast">
      <div v-if="toast" class="workspace-toast" role="status">{{ toast }}</div>
    </Transition>

    <div class="workspace-utility-actions">
      <button type="button" :title="ui.theme === 'light' ? t('settings.theme.dark') : t('settings.theme.light')" @click="ui.toggleTheme()">
        <AppIcon :name="ui.theme === 'light' ? 'moon' : 'sun'" :size="16" />
      </button>
      <button type="button" :title="t('shortcuts.title')" @click="shortcutsOpen = true">
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
  border-bottom: 1px solid var(--divider-soft);
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
  border: 1px solid var(--accent-soft-border);
  border-radius: 8px;
  background: var(--accent-faint);
  color: var(--accent);
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
  color: var(--text-secondary);
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
  background: var(--danger);
}

.avatar-button {
  margin-left: 2px;
  border-radius: 50%;
  background: linear-gradient(145deg, var(--accent-soft), var(--accent));
  color: var(--text-row);
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
  border: 1px solid var(--state-danger-border);
  border-radius: 9px;
  background: var(--state-danger-bg);
  color: var(--state-danger-fg);
  font-size: 10px;
}

.error-icon {
  display: grid;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 7px;
  background: var(--state-danger-bg);
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
  color: var(--state-danger-fg);
  font-size: 9.5px;
}

.save-error-banner button {
  display: inline-flex;
  height: 26px;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding: 0 9px;
  border: 1px solid var(--state-danger-border);
  border-radius: 6px;
  background: var(--panel-strong);
  color: var(--state-danger-fg);
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
