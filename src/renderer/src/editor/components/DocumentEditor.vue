<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch, watchEffect } from 'vue'
import { Editor } from '@tiptap/core'
import type { TiptapDocument } from '../../../../shared/document'
import { createEditorExtensions } from '../core/extensions'
import { sanitizeClipboardHtml } from '../core/clipboardSanitizer'
import { detectSlashTrigger, type SlashMenuItem, type SlashTrigger } from '../core/overlayModel'
import { runEditorCommand } from '../core/editorCommands'
import { useUiStore } from '../../stores/ui'
import { useI18n } from '../../i18n/useI18n'
import BubbleMenu from './BubbleMenu.vue'
import ImageControls from './ImageControls.vue'
import SlashMenu from './SlashMenu.vue'
import TableControls from './TableControls.vue'
import '../styles/document.css'

const props = defineProps<{
  content: TiptapDocument
  documentId: string
}>()

const emit = defineEmits<{
  change: [content: TiptapDocument]
  ready: [instanceId: string]
  selectionChange: [hasSelection: boolean]
  focusChange: [focused: boolean]
  requestImage: []
  requestAttachment: []
  insertTable: []
  settingsChange: [settings: { foldHeadings: boolean; lineNumbers: boolean }]
}>()

const host = ref<HTMLDivElement | null>(null)
const editor = shallowRef<Editor | null>(null)
const composing = ref(false)
const slashTrigger = ref<SlashTrigger | null>(null)
const ui = useUiStore()
const { t, locale } = useI18n()
let lastSerializedContent = ''
let pendingCompositionUpdate = false

onMounted(async () => {
  if (!host.value) return
  lastSerializedContent = JSON.stringify(props.content)
  const instance = new Editor({
    element: host.value,
    extensions: createEditorExtensions({
      foldHeadings: ui.foldHeadings,
      initialFolds: readFolds(props.documentId),
      onFoldsChanged: (folds) => writeFolds(props.documentId, folds),
      lineNumbers: ui.showLineNumbers,
    }),
    content: props.content,
    autofocus: false,
    editorProps: {
      transformPastedHTML: (html) => sanitizeClipboardHtml(html),
      attributes: {
        class: composeEditorClasses(),
        role: 'textbox',
        'aria-label': t('editor.bodyAria'),
        'aria-multiline': 'true',
        spellcheck: 'true',
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      if (composing.value) {
        pendingCompositionUpdate = true
        return
      }
      publishContent(currentEditor)
      syncSlashTrigger(currentEditor)
    },
    onSelectionUpdate: ({ editor: currentEditor }) => {
      const { from, to } = currentEditor.state.selection
      emit('selectionChange', from !== to)
      syncSlashTrigger(currentEditor)
    },
    onFocus: () => emit('focusChange', true),
    onBlur: () => emit('focusChange', false),
  })
  editor.value = instance
  instance.view.dom.addEventListener('compositionstart', handleCompositionStart, true)
  instance.view.dom.addEventListener('compositionend', handleCompositionEnd, true)
  emit('ready', instance.instanceId)
})

onBeforeUnmount(() => {
  const instance = editor.value
  if (!instance) return
  instance.view.dom.removeEventListener('compositionstart', handleCompositionStart, true)
  instance.view.dom.removeEventListener('compositionend', handleCompositionEnd, true)
  instance.destroy()
  editor.value = null
})

function handleCompositionStart(): void {
  composing.value = true
  slashTrigger.value = null
}

function handleCompositionEnd(): void {
  composing.value = false
  if (!pendingCompositionUpdate || !editor.value) return
  pendingCompositionUpdate = false
  void nextTick(() => {
    if (editor.value) {
      publishContent(editor.value)
      syncSlashTrigger(editor.value)
    }
  })
}

function syncSlashTrigger(currentEditor: Editor): void {
  if (composing.value || !currentEditor.state.selection.empty) {
    slashTrigger.value = null
    return
  }
  const { from, $from } = currentEditor.state.selection
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, '\n', '\0')
  slashTrigger.value = detectSlashTrigger(textBefore, from, { composing: composing.value })
}

function closeSlashMenu(): void {
  slashTrigger.value = null
}

function selectSlashItem(item: SlashMenuItem): void {
  const currentEditor = editor.value
  const trigger = slashTrigger.value
  if (!currentEditor || !trigger) return
  const to = currentEditor.state.selection.from
  currentEditor.chain().focus().deleteRange({ from: trigger.start, to }).run()
  slashTrigger.value = null

  if (item.command) {
    runEditorCommand(currentEditor, item.command)
  } else if (item.action === 'image') {
    emit('requestImage')
  } else if (item.action === 'attachment') {
    emit('requestAttachment')
  } else if (item.action === 'table') {
    emit('insertTable')
  }
  publishContent(currentEditor)
}

function publishContent(currentEditor: Editor): void {
  const json = currentEditor.getJSON() as TiptapDocument
  const serialized = JSON.stringify(json)
  if (serialized === lastSerializedContent) return
  lastSerializedContent = serialized
  emit('change', json)
}

function focus(): void {
  editor.value?.commands.focus()
}

/**
 * Folding and typography are presentation only, so each switch maps to a class
 * on the editor element instead of rebuilding the editor (which would lose the
 * caret and the undo history).
 */
function composeEditorClasses(): string {
  return [
    'shizhi-editor',
    'shizhi-editor--document',
    ui.indentGuides ? 'has-indent-guides' : '',
    ui.hangingIndent ? 'has-hanging-indent' : '',
    ui.showLineNumbers ? 'has-line-numbers' : '',
    `lang-${locale.value}`,
  ].filter(Boolean).join(' ')
}

watchEffect(() => {
  const dom = editor.value?.view.dom
  if (!dom) return
  dom.className = composeEditorClasses()
})

// The editor itself is created with these settings on mount; toggling them at
// runtime needs a fresh instance because ProseMirror plugins are fixed at
// construction time.
watch(
  () => [ui.foldHeadings, ui.showLineNumbers] as const,
  () => emit('settingsChange', { foldHeadings: ui.foldHeadings, lineNumbers: ui.showLineNumbers }),
)

function readFolds(documentId: string): string[] {
  try {
    const raw = localStorage.getItem(foldsKey(documentId))
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

function writeFolds(documentId: string, folds: string[]): void {
  try {
    if (folds.length) localStorage.setItem(foldsKey(documentId), JSON.stringify(folds))
    else localStorage.removeItem(foldsKey(documentId))
  } catch {
    // Collapsing is a convenience; failing to remember it must not break editing.
  }
}

function foldsKey(documentId: string): string {
  return `shizhi.folds.${documentId}`
}

defineExpose({
  focus,
  getEditor: () => editor.value,
  isComposing: () => composing.value,
})
</script>

<template>
  <div ref="host" class="document-editor-host" />
  <SlashMenu
    v-if="editor && slashTrigger"
    :editor="editor"
    :trigger="slashTrigger"
    :suppressed="composing"
    @select="selectSlashItem"
    @close="closeSlashMenu"
  />
  <BubbleMenu v-if="editor" :editor="editor" :composing="composing" />
  <ImageControls v-if="editor" :editor="editor" />
  <TableControls v-if="editor" :editor="editor" />
</template>

<style scoped>
.document-editor-host {
  width: 100%;
  min-height: 100%;
}
</style>
