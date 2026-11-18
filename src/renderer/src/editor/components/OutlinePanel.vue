<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import type { Editor } from '@tiptap/core'
import AppIcon from '../../components/AppIcon.vue'
import { useI18n } from '../../i18n/useI18n'
import { activeHeadingIndex, collectOutline, outlineLabel, type OutlineItem } from '../../app/outline'

const props = defineProps<{ editor: Editor | null }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const outline = shallowRef<OutlineItem[]>([])
const activeIndex = ref(-1)
let boundEditor: Editor | null = null
let pending = 0
let timer: ReturnType<typeof setTimeout> | null = null

const hasOutline = computed(() => outline.value.length > 0)

function scheduleRefresh(): void {
  pending += 1
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    refresh()
  }, 120)
}

function refresh(): void {
  const editor = props.editor
  if (!editor) {
    outline.value = []
    return
  }
  outline.value = collectOutline(editor.getJSON())
  activeIndex.value = activeHeadingIndex(outline.value, editor.state.selection.from)
}

function bindEditor(editor: Editor | null): void {
  if (boundEditor) {
    boundEditor.off('transaction', scheduleRefresh)
    boundEditor.off('selectionUpdate', handleSelection)
  }
  boundEditor = editor
  if (boundEditor) {
    boundEditor.on('transaction', scheduleRefresh)
    boundEditor.on('selectionUpdate', handleSelection)
  }
  refresh()
}

function handleSelection(): void {
  if (!props.editor) return
  activeIndex.value = activeHeadingIndex(outline.value, props.editor.state.selection.from)
}

watch(() => props.editor, bindEditor, { immediate: true })

onBeforeUnmount(() => {
  bindEditor(null)
  if (timer) clearTimeout(timer)
})

/**
 * Jumps to a heading. `scrollIntoView` is used rather than computing a scroll
 * offset from caret coordinates because the paper is CSS-zoomed, which makes
 * viewport maths unreliable.
 */
async function jumpTo(item: OutlineItem): Promise<void> {
  const editor = props.editor
  if (!editor) return
  const docSize = editor.state.doc.content.size
  const target = Math.min(item.pos + 1, docSize)
  editor.chain().focus().setTextSelection(target).run()
  await nextTick()
  const dom = editor.view.nodeDOM(item.pos)
  if (dom instanceof HTMLElement) dom.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

defineExpose({ refresh })
</script>

<template>
  <aside class="outline-panel" :aria-label="t('editor.outline.title')">
    <header class="outline-header">
      <h2>{{ t('editor.outline.title') }}</h2>
      <button type="button" class="outline-close" :title="t('editor.outline.hide')" @click="emit('close')">
        <AppIcon name="x" :size="13" />
      </button>
    </header>

    <nav v-if="hasOutline" class="outline-list" role="navigation">
      <button
        v-for="(item, index) in outline"
        :key="`${item.pos}-${item.text}`"
        type="button"
        class="outline-item"
        :class="[`level-${item.level}`, { active: index === activeIndex }]"
        :title="outlineLabel(item, t('common.unnamed'))"
        @click="jumpTo(item)"
      >
        <span class="outline-dot" />
        <span class="outline-text">{{ outlineLabel(item, t('common.unnamed')) }}</span>
      </button>
    </nav>
    <p v-else class="outline-empty">{{ t('editor.outline.empty') }}</p>
  </aside>
</template>

<style scoped>
.outline-panel {
  display: flex;
  width: 208px;
  flex: 0 0 208px;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid var(--divider-soft);
  background: var(--panel-strong);
}

.outline-header {
  display: flex;
  height: 38px;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 0 14px;
}

.outline-header h2 {
  margin: 0;
  color: var(--text-secondary);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.outline-close {
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
}

.outline-close:hover {
  background: var(--panel-muted);
  color: var(--text-primary);
}

.outline-list {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  overflow-y: auto;
  padding: 4px 8px 16px;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
}

.outline-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-row);
  cursor: pointer;
  font-size: 11.5px;
  text-align: left;
  transition: background var(--motion-fast) var(--ease-out), color var(--motion-fast) var(--ease-out);
}

.outline-item:hover {
  background: var(--panel-muted);
  color: var(--text-primary);
}

.outline-item.active {
  background: var(--accent-faint);
  color: var(--accent-strong);
  font-weight: 620;
}

.outline-item.level-2 {
  padding-left: 18px;
  font-size: 11px;
}

.outline-item.level-3 {
  padding-left: 28px;
  font-size: 10.5px;
  color: var(--text-secondary);
}

.outline-dot {
  width: 4px;
  height: 4px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.45;
}

.outline-item.level-1 .outline-dot {
  opacity: 0.85;
}

.outline-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.outline-empty {
  margin: 8px 14px;
  color: var(--text-tertiary);
  font-size: 10.5px;
  line-height: 1.6;
}

@media (max-width: 1180px) {
  .outline-panel {
    display: none;
  }
}
</style>
