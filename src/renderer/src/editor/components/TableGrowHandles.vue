<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import AppIcon from '../../components/AppIcon.vue'
import { appendTableColumn, appendTableRow, findTableAtSelection } from '../core/tableCommands'
import { useI18n } from '../../i18n/useI18n'

/**
 * `+` handles beside the last row and the last column of a table: one click
 * appends a row or a column, the way Yuque grows a table.
 *
 * They show while the pointer is over the table (or its immediate
 * surroundings) and while the caret sits in the table, so typing in a cell
 * does not make them vanish mid-interaction.
 *
 * The table is tracked by its *index* among the page's tables, never by the
 * element: editing the table replaces its DOM node, and holding on to the old
 * one is what made the handles disappear — and then refuse to come back until
 * the pointer left and re-entered. They live in a teleport because the editor
 * paper is CSS-zoomed, which would scale their fixed coordinates twice.
 */
const props = defineProps<{ editor: Editor }>()
const { t } = useI18n()

let hideTimer: ReturnType<typeof setTimeout> | null = null
let frame = 0
let resizeObserver: ResizeObserver | null = null
let observedTable: HTMLTableElement | null = null
/** Last known cursor position, so a hide decision can check the real pointer. */
let lastPointer = { x: 0, y: 0 }

/** Table under the pointer, if any. */
const pointerIndex = ref<number | null>(null)
/** Table around the caret; keeps the handles up while typing inside one. */
const selectionIndex = ref<number | null>(null)

const targets = ref<{ row: { x: number; y: number } | null; column: { x: number; y: number } | null }>({
  row: null,
  column: null,
})

function pageTables(): HTMLTableElement[] {
  return [...props.editor.view.dom.querySelectorAll<HTMLTableElement>('table')]
}

/** The tracked table for this frame; re-resolved so a replaced node is fine. */
function currentTable(): HTMLTableElement | null {
  const tables = pageTables()
  for (const index of [pointerIndex.value, selectionIndex.value]) {
    if (index === null) continue
    const table = tables[index]
    if (table) return table
  }
  return null
}

const active = computed(() => currentTable() !== null)

/* ------------------------------------------------------------ visibility */

function scheduleHide(): void {
  cancelHide()
  hideTimer = setTimeout(() => {
    hideTimer = null
    // A scheduled hide must not fire after the table grew: the pointer is
    // wherever it was, and the handles are still the right thing to show.
    const current = currentTable()
    if (current && isNearTable(current, lastPointer.x, lastPointer.y)) return
    pointerIndex.value = null
    if (selectionIndex.value === null) targets.value = { row: null, column: null }
  }, 260)
}

function cancelHide(): void {
  if (!hideTimer) return
  clearTimeout(hideTimer)
  hideTimer = null
}

/** Forgiving hover: the handles sit outside the table, so the gap between the
 *  table edge and the button must not count as "left the table". */
function isNearTable(table: HTMLTableElement, x: number, y: number): boolean {
  const rect = table.getBoundingClientRect()
  const pad = 48
  return x >= rect.left - pad && x <= rect.right + pad && y >= rect.top - pad && y <= rect.bottom + pad
}

function handlePointerMove(event: PointerEvent): void {
  lastPointer = { x: event.clientX, y: event.clientY }
  const target = event.target as HTMLElement | null
  const overTable = target?.closest('.shizhi-editor table')
  if (overTable instanceof HTMLTableElement) {
    cancelHide()
    const index = pageTables().indexOf(overTable)
    if (index >= 0) pointerIndex.value = index
    return
  }
  if (target?.closest('.table-grow-handle')) {
    cancelHide()
    return
  }
  const current = currentTable()
  if (current && isNearTable(current, event.clientX, event.clientY)) {
    cancelHide()
    return
  }
  scheduleHide()
}

/**
 * After a click on a handle the pointer is still next to the table, but the
 * table's geometry changed under it, so the next movement would otherwise be
 * judged against stale boxes. Re-anchor on the table under the cursor.
 */
function reanchorAfterEdit(): void {
  if (hideTimer) {
    cancelHide()
    return
  }
  const current = currentTable()
  if (current && isNearTable(current, lastPointer.x, lastPointer.y)) cancelHide()
}

function syncSelectionTable(): void {
  const editor = props.editor
  if (!editor.isActive('table')) {
    selectionIndex.value = null
    return
  }
  const found = findTableAtSelection(editor)
  const dom = found ? editor.view.nodeDOM(found.pos) : null
  if (!(dom instanceof HTMLTableElement)) {
    selectionIndex.value = null
    return
  }
  const index = pageTables().indexOf(dom)
  selectionIndex.value = index >= 0 ? index : null
}

/* ------------------------------------------------------------- placement */

function track(): void {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(step)
}

function step(): void {
  place()
  if (active.value) frame = requestAnimationFrame(step)
  else frame = 0
}

function stopTracking(): void {
  cancelAnimationFrame(frame)
  frame = 0
}

function place(): void {
  const current = currentTable()
  if (!current) {
    targets.value = { row: null, column: null }
    return
  }
  const rows = current.rows
  const lastRow = rows[rows.length - 1]
  const firstRow = rows[0]
  const lastCell = firstRow?.cells[firstRow.cells.length - 1]
  if (!lastRow || !lastCell) {
    targets.value = { row: null, column: null }
    return
  }
  const rowRect = lastRow.getBoundingClientRect()
  const columnRect = lastCell.getBoundingClientRect()
  const box = current.getBoundingClientRect()
  // Row handle: left of the last row, centred on that row.
  // Column handle: right of the last column, centred on the whole table.
  targets.value = {
    row: { x: rowRect.left - 28, y: rowRect.top + rowRect.height / 2 },
    column: { x: columnRect.right + 8, y: box.top + box.height / 2 },
  }
}

function observe(): void {
  const current = currentTable()
  if (observedTable === current) return
  resizeObserver?.disconnect()
  observedTable = current
  if (!current) return
  resizeObserver = new ResizeObserver(() => place())
  resizeObserver.observe(current)
}

watch(active, (shown) => {
  if (shown) {
    observe()
    track()
  } else {
    stopTracking()
    targets.value = { row: null, column: null }
  }
})

/* ---------------------------------------------------------------- actions */

function addRow(): void {
  if (!appendTableRow(props.editor, currentTable())) return
  // The DOM node is replaced by the edit; the index keeps pointing at the
  // same table, so the handles stay up and follow the grown table at once.
  reanchorAfterEdit()
  observe()
  track()
}

function addColumn(): void {
  if (!appendTableColumn(props.editor, currentTable())) return
  reanchorAfterEdit()
  observe()
  track()
}

/** Removes the whole table from the handle row, no cell selection needed. */
function deleteTable(): void {
  const found = findTableAtSelection(props.editor)
  const target = found ?? (() => {
    const tables: Array<{ node: ProseMirrorNode; pos: number }> = []
    props.editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'table') tables.push({ node, pos })
      return true
    })
    const index = pointerIndex.value ?? selectionIndex.value
    return index === null ? null : tables[index] ?? null
  })()
  if (!target) return
  props.editor.chain()
    .setTextSelection(target.pos + 1)
    .deleteTable()
    .run()
  pointerIndex.value = null
  selectionIndex.value = null
  targets.value = { row: null, column: null }
  stopTracking()
}

/* ------------------------------------------------------------------ setup */

watch(() => props.editor, (editor, previous) => {
  previous?.off('transaction', syncSelectionTable)
  previous?.off('selectionUpdate', syncSelectionTable)
  editor.on('transaction', syncSelectionTable)
  editor.on('selectionUpdate', syncSelectionTable)
  syncSelectionTable()
}, { immediate: true })

onMounted(() => {
  document.addEventListener('pointermove', handlePointerMove, true)
  document.addEventListener('scroll', place, true)
  window.addEventListener('resize', place)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointermove', handlePointerMove, true)
  document.removeEventListener('scroll', place, true)
  window.removeEventListener('resize', place)
  props.editor.off('transaction', syncSelectionTable)
  props.editor.off('selectionUpdate', syncSelectionTable)
  cancelHide()
  stopTracking()
  resizeObserver?.disconnect()
})
</script>

<template>
  <Teleport to="body">
    <button
      v-if="targets.row"
      type="button"
      class="table-grow-handle is-row"
      :style="{ left: `${targets.row.x}px`, top: `${targets.row.y}px` }"
      :title="t('editor.table.addRowBelow')"
      :aria-label="t('editor.table.addRowBelow')"
      @mouseenter="cancelHide"
      @mouseleave="scheduleHide"
      @mousedown.prevent
      @click="addRow"
    >
      <AppIcon name="plus" :size="13" />
    </button>
    <button
      v-if="targets.column"
      type="button"
      class="table-grow-handle is-column"
      :style="{ left: `${targets.column.x}px`, top: `${targets.column.y}px` }"
      :title="t('editor.table.addColumnRight')"
      :aria-label="t('editor.table.addColumnRight')"
      @mouseenter="cancelHide"
      @mouseleave="scheduleHide"
      @mousedown.prevent
      @click="addColumn"
    >
      <AppIcon name="plus" :size="13" />
    </button>
    <!-- Deleting a table had no discoverable path: Backspace and Delete only
         work once every cell is selected, so the removal affordance lives with
         the other table handles. -->
    <button
      v-if="targets.column"
      type="button"
      class="table-grow-handle is-delete"
      :style="{ left: `${targets.column.x + 28}px`, top: `${targets.column.y}px` }"
      :title="t('editor.table.delete')"
      :aria-label="t('editor.table.delete')"
      @mouseenter="cancelHide"
      @mouseleave="scheduleHide"
      @mousedown.prevent
      @click="deleteTable"
    >
      <AppIcon name="trash" :size="12" />
    </button>
  </Teleport>
</template>

<style scoped>
.table-grow-handle {
  position: fixed;
  z-index: 86;
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  padding: 0;
  border: 1px solid var(--accent-soft-border);
  border-radius: 50%;
  background: var(--panel-strong);
  box-shadow: var(--shadow-soft);
  color: var(--accent-strong);
  cursor: pointer;
  transform: translateY(-50%);
}

.table-grow-handle:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
}

/* The delete handle sits one step further out and reads as destructive. */
.table-grow-handle.is-delete {
  border-color: var(--state-danger-border);
  color: var(--state-danger-fg);
}

.table-grow-handle.is-delete:hover {
  border-color: var(--state-danger-fg);
  background: var(--state-danger-bg);
}
</style>