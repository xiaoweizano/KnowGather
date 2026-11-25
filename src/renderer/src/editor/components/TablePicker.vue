<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { computePosition, flip, offset, shift } from '@floating-ui/dom'
import type { Editor } from '@tiptap/core'
import {
  DEFAULT_TABLE_COLUMNS,
  DEFAULT_TABLE_ROWS,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  tableSizeFromCell,
} from '../core/tableSizing'
import { useI18n } from '../../i18n/useI18n'

/**
 * The cell grid the "+" menu opens for "table": pointing at a cell picks the
 * size, clicking inserts. Layout follows Yuque — a square grid, the live size
 * under it, and a fixed ceiling so the panel keeps one size.
 */
const props = defineProps<{
  /** Toolbar button the grid hangs from. */
  anchor: HTMLElement | null
  editor: Editor | null
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()
const root = ref<HTMLElement | null>(null)
const hovered = ref({ rows: DEFAULT_TABLE_ROWS, columns: DEFAULT_TABLE_COLUMNS })

const rows = Array.from({ length: MAX_TABLE_ROWS }, (_, row) => row)
const columns = Array.from({ length: MAX_TABLE_COLUMNS }, (_, column) => column)
const sizeLabel = computed(() => `${hovered.value.rows} × ${hovered.value.columns}`)

function hover(row: number, column: number): void {
  hovered.value = tableSizeFromCell(row, column)
}

function isFilled(row: number, column: number): boolean {
  return row < hovered.value.rows && column < hovered.value.columns
}

function insert(): void {
  const editor = props.editor
  if (editor) {
    editor.chain().focus().insertTable({
      rows: hovered.value.rows,
      cols: hovered.value.columns,
      withHeaderRow: true,
    }).run()
  }
  emit('close')
}

/* --------------------------------------------------------------- placement */

async function position(): Promise<void> {
  if (!root.value || !props.anchor) return
  const { x, y, strategy } = await computePosition(props.anchor, root.value, {
    placement: 'bottom-start',
    strategy: 'fixed',
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
  })
  root.value.style.position = strategy
  root.value.style.left = `${x}px`
  root.value.style.top = `${y}px`
}

onMounted(() => {
  document.addEventListener('pointerdown', handleOutside, true)
  window.addEventListener('resize', position)
  document.addEventListener('scroll', position, true)
  void nextTick(position)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutside, true)
  window.removeEventListener('resize', position)
  document.removeEventListener('scroll', position, true)
})

watch(() => props.anchor, () => void nextTick(position))

function handleOutside(event: PointerEvent): void {
  const target = event.target as Node | null
  if (!target) return
  if (root.value?.contains(target) || props.anchor?.contains(target)) return
  emit('close')
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  event.preventDefault()
  emit('close')
}
</script>

<template>
  <div ref="root" class="table-picker" role="dialog" :aria-label="t('editor.table.picker')" @keydown="handleKeydown">
    <p class="table-picker-title">{{ t('editor.table.picker') }}</p>
    <div class="table-picker-grid" @mouseleave="hovered = { rows: DEFAULT_TABLE_ROWS, columns: DEFAULT_TABLE_COLUMNS }">
      <template v-for="row in rows" :key="row">
        <button
          v-for="column in columns"
          :key="`${row}-${column}`"
          type="button"
          class="table-picker-cell"
          :class="{ filled: isFilled(row, column) }"
          :aria-label="`${row + 1} × ${column + 1}`"
          @mousedown.prevent
          @mouseenter="hover(row, column)"
          @click="hover(row, column); insert()"
        />
      </template>
    </div>
    <p class="table-picker-size">{{ sizeLabel }}</p>
  </div>
</template>

<style scoped>
.table-picker {
  position: fixed;
  z-index: 96;
  display: flex;
  width: 222px;
  flex-direction: column;
  gap: 8px;
  padding: 11px;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: var(--panel-strong);
  box-shadow: var(--shadow-float);
  font-family: var(--ui-font);
}

.table-picker-title {
  margin: 0;
  color: var(--text-secondary);
  font-size: 11.5px;
  font-weight: 600;
}

.table-picker-grid {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 3px;
}

.table-picker-cell {
  aspect-ratio: 1;
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: 3px;
  background: var(--panel-strong);
  cursor: pointer;
}

.table-picker-cell.filled {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.table-picker-size {
  margin: 0;
  color: var(--text-secondary);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}
</style>