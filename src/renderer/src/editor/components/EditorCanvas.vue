<script setup lang="ts">
import { nextTick, ref } from 'vue'
import type { Editor } from '@tiptap/core'
import type { TiptapDocument } from '../../../../shared/document'
import DocumentEditor from './DocumentEditor.vue'
import { useUiStore } from '../../stores/ui'

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
  settingsChange: [settings: { foldHeadings: boolean; lineNumbers: boolean }]
}>()

const ui = useUiStore()
const editorComponent = ref<{ getEditor: () => Editor | null } | null>(null)
const scrollContainer = ref<HTMLElement | null>(null)

async function handleReady(): Promise<void> {
  await nextTick()
  emit('ready', editorComponent.value?.getEditor() ?? null)
}

function focusEditor(event: MouseEvent): void {
  const target = event.target as HTMLElement
  if (target !== scrollContainer.value) return
  editorComponent.value?.getEditor()?.commands.focus('end')
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
    <div class="editor-paper" :class="{ 'has-line-numbers': ui.showLineNumbers }">
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
  width: min(960px, calc(100% - 48px));
  min-height: 100%;
  margin: 0 auto;
  padding: 26px 0 160px;
  zoom: var(--editor-zoom);
}

.editor-paper.has-line-numbers {
  padding-left: 44px;
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

