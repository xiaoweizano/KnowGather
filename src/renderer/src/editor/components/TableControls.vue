<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Editor } from '@tiptap/core'
import { computePosition, flip, offset, shift } from '@floating-ui/dom'
import AppIcon from '../../components/AppIcon.vue'
import { useI18n } from '../../i18n/useI18n'

const props = defineProps<{ editor: Editor }>()
const { t } = useI18n()
const controls = ref<HTMLElement | null>(null)
const revision = ref(0)
let boundEditor: Editor | null = null

const visible = computed(() => {
  revision.value
  return props.editor.isEditable && props.editor.isActive('table')
})

function update(): void {
  revision.value += 1
  void nextTick(positionControls)
}

function bindEditor(editor: Editor | null): void {
  if (boundEditor) {
    boundEditor.off('transaction', update)
    boundEditor.off('selectionUpdate', update)
  }
  boundEditor = editor
  if (boundEditor) {
    boundEditor.on('transaction', update)
    boundEditor.on('selectionUpdate', update)
  }
}

watch(() => props.editor, bindEditor, { immediate: true })
onMounted(() => {
  window.addEventListener('resize', positionControls)
  document.addEventListener('scroll', positionControls, true)
  if (visible.value) void nextTick(positionControls)
})
onBeforeUnmount(() => {
  bindEditor(null)
  window.removeEventListener('resize', positionControls)
  document.removeEventListener('scroll', positionControls, true)
})

async function positionControls(): Promise<void> {
  if (!visible.value || !controls.value) return
  const selection = props.editor.state.selection
  const start = props.editor.view.coordsAtPos(selection.from)
  const end = props.editor.view.coordsAtPos(selection.to)
  const virtualElement = {
    getBoundingClientRect: () => ({
      x: start.left,
      y: start.top,
      left: start.left,
      right: end.right,
      top: start.top,
      bottom: end.bottom,
      width: Math.max(1, end.right - start.left),
      height: Math.max(1, end.bottom - start.top),
    }),
  }
  const { x, y, strategy } = await computePosition(virtualElement, controls.value, {
    placement: 'bottom-start',
    strategy: 'fixed',
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
  })
  controls.value.style.position = strategy
  controls.value.style.left = `${x}px`
  controls.value.style.top = `${y}px`
}

function run(action: (chain: ReturnType<Editor['chain']>) => { run(): boolean }): void {
  action(props.editor.chain().focus())
  revision.value += 1
}

function addRow(): void { run((chain) => chain.addRowAfter()) }
function deleteRow(): void { run((chain) => chain.deleteRow()) }
function addColumn(): void { run((chain) => chain.addColumnAfter()) }
function deleteColumn(): void { run((chain) => chain.deleteColumn()) }
function toggleHeader(): void { run((chain) => chain.toggleHeaderRow()) }
function deleteTable(): void { run((chain) => chain.deleteTable()) }
</script>

<template>
  <div v-if="visible" ref="controls" class="table-controls" role="toolbar" :aria-label="t('editor.table.aria')">
    <button type="button" :title="t('editor.table.addRowBelow')" @mousedown.prevent @click="addRow">+</button>
    <button type="button" :title="t('editor.table.deleteRow')" @mousedown.prevent @click="deleteRow">−</button>
    <span class="control-divider" />
    <button type="button" :title="t('editor.table.addColumnRight')" @mousedown.prevent @click="addColumn">+</button>
    <button type="button" :title="t('editor.table.deleteColumn')" @mousedown.prevent @click="deleteColumn">−</button>
    <span class="control-divider" />
    <button type="button" :title="t('editor.table.toggleHeader')" @mousedown.prevent @click="toggleHeader"><AppIcon name="table" :size="14" /></button>
    <button type="button" class="danger" :title="t('editor.table.deleteTable')" :aria-label="t('editor.table.deleteTable')" @mousedown.prevent @click="deleteTable">
      <AppIcon name="trash" :size="14" />
    </button>
  </div>
</template>

<style scoped>
.table-controls {
  position: fixed;
  z-index: 86;
  display: flex;
  height: 34px;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: var(--panel-strong);
  box-shadow: var(--shadow-float);
}

button {
  height: 27px;
  padding: 0 7px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 9px;
}

button:hover {
  background: var(--accent-faint);
  color: var(--accent-strong);
}

button.danger {
  display: grid;
  width: 27px;
  padding: 0;
  place-items: center;
  color: var(--danger);
}

.control-divider {
  width: 1px;
  height: 18px;
  background: var(--border-soft);
}
</style>
