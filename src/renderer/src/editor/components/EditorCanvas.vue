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
    <div class="editor-paper">
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
  background:
    radial-gradient(circle at 50% -15%, rgba(222, 216, 255, 0.22), transparent 38%),
    var(--panel-strong);
  scrollbar-width: thin;
  scrollbar-color: #ddd8ea transparent;
  overscroll-behavior: contain;
}

.editor-paper {
  width: min(820px, calc(100% - 96px));
  min-height: 100%;
  margin: 0 auto;
  padding: 30px 0 180px;
  zoom: var(--editor-zoom);
}

.content-wide .editor-paper {
  width: min(1040px, calc(100% - 96px));
}

.is-zoomed .editor-paper {
  width: min(calc(820px / var(--editor-zoom)), calc(100% - calc(96px / var(--editor-zoom))));
}

.content-wide.is-zoomed .editor-paper {
  width: min(calc(1040px / var(--editor-zoom)), calc(100% - calc(96px / var(--editor-zoom))));
}

@media (max-width: 1100px) {
  .editor-paper {
    width: calc(100% - 72px);
  }
}

@media (max-width: 760px) {
  .editor-paper {
    width: calc(100% - 36px);
    padding-top: 22px;
  }
}
</style>

