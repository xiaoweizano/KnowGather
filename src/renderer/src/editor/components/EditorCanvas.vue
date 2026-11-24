<script setup lang="ts">
import { nextTick, ref, shallowRef } from 'vue'
import type { Editor } from '@tiptap/core'
import type { TiptapDocument } from '../../../../shared/document'
import DocumentEditor from './DocumentEditor.vue'
import TemplateStart from './TemplateStart.vue'
import { insertTemplateContent } from '../core/templateInsert'
import { useUiStore } from '../../stores/ui'
import { useI18n } from '../../i18n/useI18n'
import { journalTemplateLabel, type JournalTemplate } from '../../app/journalTemplates'

const props = defineProps<{
  content: TiptapDocument
  documentId: string
}>()

const emit = defineEmits<{
  change: [content: TiptapDocument]
  ready: [editor: Editor | null]
  selectionChange: [hasSelection: boolean]
  requestImage: []
  requestAttachment: []
  insertTable: []
  notify: [message: string]
  settingsChange: [settings: { foldHeadings: boolean; lineNumbers: boolean }]
}>()

const ui = useUiStore()
const { t } = useI18n()
const editorComponent = ref<{ getEditor: () => Editor | null } | null>(null)
const scrollContainer = ref<HTMLElement | null>(null)
// Wrapped in a proxy the editor's commands break; keep the instance raw.
const editor = shallowRef<Editor | null>(null)
// While the template block is shown it sits below a tall blank writing area;
// the area must belong to the editor so a click there puts the caret in the body.
const templateShown = ref(false)

async function handleReady(): Promise<void> {
  await nextTick()
  editor.value = editorComponent.value?.getEditor() ?? null
  emit('ready', editor.value)
}

function focusEditor(event: MouseEvent): void {
  const target = event.target as HTMLElement
  if (target !== scrollContainer.value) return
  editorComponent.value?.getEditor()?.commands.focus('end')
}

/** Copies a template into the page; the editor's update event saves it. */
function insertTemplate(template: JournalTemplate): void {
  const currentEditor = editor.value
  if (!currentEditor) return
  insertTemplateContent(currentEditor, template.content)
  emit('notify', t('editor.template.inserted', { name: journalTemplateLabel(template, t) }))
  void nextTick(() => currentEditor.commands.focus('start'))
}

defineExpose({
  getEditor: () => editorComponent.value?.getEditor() ?? null,
  scrollContainer,
})
</script>

<template>
  <main
    ref="scrollContainer"
    class="editor-scroll"
    :class="[`content-${ui.contentWidth}`, { 'is-zoomed': ui.zoom !== 100 }]"
    :style="{ '--editor-zoom': String(ui.zoom / 100) }"
    @click="focusEditor"
  >
    <div
      class="editor-paper"
      :class="{ 'has-line-numbers': ui.showLineNumbers, 'has-template-start': templateShown }"
    >
      <DocumentEditor
        ref="editorComponent"
        :content="props.content"
        :document-id="props.documentId"
        @change="emit('change', $event)"
        @ready="handleReady"
        @selection-change="emit('selectionChange', $event)"
        @request-image="emit('requestImage')"
        @request-attachment="emit('requestAttachment')"
        @insert-table="emit('insertTable')"
        @settings-change="emit('settingsChange', $event)"
      />
      <TemplateStart
        v-if="editor"
        class="canvas-template-start"
        :editor="editor"
        @insert="insertTemplate"
        @visibility="templateShown = $event"
      />
    </div>
  </main>
</template>

<style scoped>
.editor-scroll {
  position: relative;
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  /* A flat surface: the old radial tint read as a faint frame around the page. */
  background: var(--panel-strong);
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
  overscroll-behavior: contain;
}

.editor-paper {
  position: relative;
  width: min(960px, calc(100% - 48px));
  min-height: 100%;
  margin: 0 auto;
  padding: 26px 0 160px;
  zoom: var(--editor-zoom);
}

.editor-paper.has-line-numbers {
  padding-left: 44px;
}

/* A blank page keeps a full writing area above the template suggestions, so the
   top of the page is somewhere to click and type rather than dead space. */
.editor-paper.has-template-start :deep(.shizhi-editor) {
  min-height: var(--template-offset, 200px);
}

.content-wide .editor-paper {
  width: min(1200px, calc(100% - 48px));
}

.is-zoomed .editor-paper {
  width: min(calc(960px / var(--editor-zoom)), calc(100% - calc(48px / var(--editor-zoom))));
}

.content-wide.is-zoomed .editor-paper {
  width: min(calc(1200px / var(--editor-zoom)), calc(100% - calc(48px / var(--editor-zoom))));
}

@media (max-width: 1100px) {
  .editor-paper {
    width: calc(100% - 32px);
  }
}

@media (max-width: 760px) {
  .editor-paper {
    width: calc(100% - 24px);
    padding-top: 20px;
  }
}
</style>

