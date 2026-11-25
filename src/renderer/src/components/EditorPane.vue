<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import type { Editor } from '@tiptap/core'
import type { TiptapDocument } from '../../../shared/document'
import EditorToolbar from '../editor/components/EditorToolbar.vue'
import EditorCanvas from '../editor/components/EditorCanvas.vue'
import OutlinePanel from '../editor/components/OutlinePanel.vue'
import EditorStatusBar from './EditorStatusBar.vue'
import { getShizhiApi } from '../services/api'
import { useUiStore } from '../stores/ui'
import { useI18n } from '../i18n/useI18n'
import type { AttachmentReference } from '../../../shared/document'

const props = withDefaults(defineProps<{
  content: TiptapDocument
  documentId: string
  showStatusBar?: boolean
  showToolbar?: boolean
}>(), {
  showStatusBar: true,
  showToolbar: true,
})

const emit = defineEmits<{
  change: [content: TiptapDocument]
  ready: [editor: Editor | null]
  selectionChange: [hasSelection: boolean]
  notify: [message: string]
  settingsChange: [settings: { foldHeadings: boolean; lineNumbers: boolean }]
}>()

const ui = useUiStore()
const { t } = useI18n()
const api = getShizhiApi()
const canvas = ref<{ getEditor: () => Editor | null } | null>(null)
// The editor instance must stay raw: Vue's reactive proxy breaks ProseMirror
// transactions ("Applying a mismatched transaction"), which silently killed
// every toolbar command that ran through the proxied instance.
const editor = shallowRef<Editor | null>(null)
const outline = ref<{ refresh: () => void } | null>(null)

const outlineVisible = computed(() => ui.outlineVisible && Boolean(editor.value))

function handleReady(instance: Editor | null): void {
  editor.value = instance
  emit('ready', instance)
}

function handleSettingsChange(settings: { foldHeadings: boolean; lineNumbers: boolean }): void {
  emit('settingsChange', settings)
}

function getEditor(): Editor | null {
  return editor.value
}

function focus(): void {
  editor.value?.commands.focus()
}

function refreshOutline(): void {
  outline.value?.refresh()
}

/* ---------------------------------------------------------- insert actions */
/*
 * The pane owns image / attachment / table insertion itself. It used to
 * forward them to each caller, and the journal page never listened, so those
 * toolbar buttons and slash items silently did nothing there.
 */

function notify(message: string): void {
  emit('notify', message)
}

async function pickImages(): Promise<void> {
  try {
    insertImages(await api.attachments.pickImages())
  } catch {
    notify(t('document.toast.imageFailed'))
  }
}

function insertImages(references: readonly AttachmentReference[]): void {
  const instance = editor.value
  if (!instance || references.length === 0) return
  for (const reference of references) {
    instance.chain().focus().insertContent({
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
  notify(references.length === 1 ? t('document.toast.imageInserted') : t('document.toast.imagesInserted', { count: references.length }))
}

async function pickAttachments(): Promise<void> {
  try {
    insertAttachments(await api.attachments.pickFiles())
  } catch {
    notify(t('document.toast.attachmentFailed'))
  }
}

function insertAttachments(references: readonly AttachmentReference[]): void {
  const instance = editor.value
  if (!instance || references.length === 0) return
  for (const reference of references) {
    instance.chain().focus().insertContent({
      type: 'attachment',
      attrs: { ...reference },
    }).run()
  }
  notify(references.length === 1 ? t('document.toast.attachmentInserted') : t('document.toast.attachmentsInserted', { count: references.length }))
}

function insertTable(rows = 3, cols = 3): void {
  const instance = editor.value
  if (!instance) return
  instance.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
  notify(t('document.toast.tableInserted'))
}

defineExpose({ getEditor, focus, refreshOutline })
</script>

<template>
  <div class="editor-pane">
    <div v-if="props.showToolbar" class="toolbar-wrap">
      <EditorToolbar
        :editor="editor"
        @notify="emit('notify', $event)"
        @request-image="pickImages"
        @request-attachment="pickAttachments"
        @insert-table="insertTable"
        @fold-all="editor?.commands.foldAllHeadings()"
        @unfold-all="editor?.commands.unfoldAllHeadings()"
      />
      <div class="toolbar-scrim" />
    </div>

    <div class="editor-body">
      <EditorCanvas
        ref="canvas"
        :content="props.content"
        :document-id="props.documentId"
        @ready="handleReady"
        @change="emit('change', $event)"
        @selection-change="emit('selectionChange', $event)"
        @request-image="pickImages"
        @request-attachment="pickAttachments"
        @insert-table="insertTable"
        @notify="emit('notify', $event)"
        @settings-change="handleSettingsChange"
      />
      <OutlinePanel
        v-if="outlineVisible"
        ref="outline"
        :editor="editor"
        @close="ui.setOutlineVisible(false)"
      />
    </div>

    <EditorStatusBar v-if="props.showStatusBar" />
  </div>
</template>

<style scoped>
.editor-pane {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
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

.editor-body {
  display: flex;
  min-height: 0;
  flex: 1;
}
</style>
