<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Editor } from '@tiptap/core'
import { computePosition, flip, offset, shift } from '@floating-ui/dom'
import AppIcon from '../../components/AppIcon.vue'
import { isEditorCommandActive, runEditorCommand, setEditorHighlight, setEditorTextColor, type EditorCommand } from '../core/editorCommands'
import { HIGHLIGHT_COLORS, TEXT_COLORS } from '../core/toolbarConfig'
import { shouldShowBubbleMenu } from '../core/overlayModel'

const props = defineProps<{
  editor: Editor
  composing?: boolean
}>()

const bubble = ref<HTMLElement | null>(null)
const revision = ref(0)
const panel = ref<'' | 'color' | 'highlight' | 'link'>('')
const linkValue = ref('')
let boundEditor: Editor | null = null

const selectionEmpty = computed(() => {
  revision.value
  return props.editor.state.selection.empty
})
const visible = computed(() => shouldShowBubbleMenu(
  selectionEmpty.value,
  Boolean(props.composing),
  props.editor.isEditable,
))
const linkActive = computed(() => {
  revision.value
  return props.editor.isActive('link')
})

const markActions: ReadonlyArray<{ command: EditorCommand; label: string; icon: string }> = [
  { command: 'bold', label: '粗体', icon: 'bold' },
  { command: 'italic', label: '斜体', icon: 'italic' },
  { command: 'underline', label: '下划线', icon: 'underline' },
  { command: 'strike', label: '删除线', icon: 'strike' },
  { command: 'code', label: '行内代码', icon: 'code' },
]

function handleEditorEvent(): void {
  revision.value += 1
  if (selectionEmpty.value) panel.value = ''
  void nextTick(positionBubble)
}

function bindEditor(editor: Editor | null): void {
  if (boundEditor) {
    boundEditor.off('transaction', handleEditorEvent)
    boundEditor.off('selectionUpdate', handleEditorEvent)
    boundEditor.off('focus', handleEditorEvent)
  }
  boundEditor = editor
  if (boundEditor) {
    boundEditor.on('transaction', handleEditorEvent)
    boundEditor.on('selectionUpdate', handleEditorEvent)
    boundEditor.on('focus', handleEditorEvent)
  }
}

watch(() => props.editor, bindEditor, { immediate: true })
watch(visible, (isVisible) => {
  if (isVisible) void nextTick(positionBubble)
  else panel.value = ''
})

onMounted(() => {
  document.addEventListener('scroll', positionBubble, true)
  window.addEventListener('resize', positionBubble)
  void nextTick(positionBubble)
})

onBeforeUnmount(() => {
  bindEditor(null)
  document.removeEventListener('scroll', positionBubble, true)
  window.removeEventListener('resize', positionBubble)
})

async function positionBubble(): Promise<void> {
  if (!visible.value || !bubble.value) return
  const { from, to } = props.editor.state.selection
  const start = props.editor.view.coordsAtPos(from)
  const end = props.editor.view.coordsAtPos(to)
  const left = Math.min(start.left, end.left)
  const right = Math.max(start.right, end.right)
  const top = Math.min(start.top, end.top)
  const bottom = Math.max(start.bottom, end.bottom)
  const virtualElement = {
    getBoundingClientRect: () => ({
      x: left,
      y: top,
      left,
      right,
      top,
      bottom,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    }),
  }
  const { x, y, strategy } = await computePosition(virtualElement, bubble.value, {
    placement: 'top-start',
    strategy: 'fixed',
    middleware: [offset(9), flip({ padding: 8 }), shift({ padding: 8 })],
  })
  bubble.value.style.position = strategy
  bubble.value.style.left = `${x}px`
  bubble.value.style.top = `${y}px`
}

function applyMark(command: EditorCommand): void {
  runEditorCommand(props.editor, command)
  revision.value += 1
}

function isActive(command: EditorCommand): boolean {
  revision.value
  return isEditorCommandActive(props.editor, command)
}

function togglePanel(next: typeof panel.value): void {
  panel.value = panel.value === next ? '' : next
  if (next === 'link') {
    linkValue.value = String(props.editor.getAttributes('link').href ?? '')
    void nextTick(() => document.querySelector<HTMLInputElement>('.bubble-link-input')?.focus())
  }
}

function applyColor(color: string | null): void {
  setEditorTextColor(props.editor, color)
  panel.value = ''
  revision.value += 1
}

function applyHighlight(color: string | null): void {
  setEditorHighlight(props.editor, color)
  panel.value = ''
  revision.value += 1
}

function applyLink(): void {
  const href = linkValue.value.trim()
  if (!href) {
    props.editor.chain().extendMarkRange('link').unsetLink().run()
  } else {
    const normalized = /^(https?:|mailto:|#|\/)/i.test(href) ? href : `https://${href}`
    props.editor.chain().extendMarkRange('link').setLink({ href: normalized }).run()
  }
  panel.value = ''
  revision.value += 1
}
</script>

<template>
  <div v-if="visible" ref="bubble" class="bubble-menu" role="toolbar" aria-label="选区格式">
    <button
      v-for="action in markActions"
      :key="action.command"
      type="button"
      :class="{ active: isActive(action.command) }"
      :aria-label="action.label"
      :title="action.label"
      @mousedown.prevent
      @click="applyMark(action.command)"
    >
      <AppIcon :name="action.icon" :size="15" />
    </button>
    <span class="bubble-divider" />
    <button type="button" aria-label="文字颜色" title="文字颜色" :class="{ active: panel === 'color' }" @mousedown.prevent @click="togglePanel('color')">
      <AppIcon name="palette" :size="15" />
    </button>
    <button type="button" aria-label="背景高亮" title="背景高亮" :class="{ active: isActive('highlight') }" @mousedown.prevent @click="togglePanel('highlight')">
      <span class="highlight-dot" />
    </button>
    <button type="button" aria-label="链接" title="链接" :class="{ active: linkActive }" @mousedown.prevent @click="togglePanel('link')">
      <AppIcon name="link" :size="15" />
    </button>

    <div v-if="panel === 'color' || panel === 'highlight'" class="bubble-palette" @mousedown.prevent>
      <button
        v-for="option in panel === 'color' ? TEXT_COLORS : HIGHLIGHT_COLORS"
        :key="option.label"
        type="button"
        class="bubble-swatch"
        :class="{ 'swatch-default': !option.value }"
        :style="option.value ? { '--swatch': option.value } : undefined"
        :title="option.label"
        @click="panel === 'color' ? applyColor(option.value) : applyHighlight(option.value)"
      />
    </div>

    <div v-if="panel === 'link'" class="bubble-link" @mousedown.prevent>
      <input v-model="linkValue" class="bubble-link-input" type="url" placeholder="粘贴链接" @keydown.enter.prevent="applyLink" @keydown.esc.prevent="panel = ''" />
      <button type="button" @click="applyLink">应用</button>
    </div>
  </div>
</template>

<style scoped>
.bubble-menu {
  position: fixed;
  z-index: 85;
  display: flex;
  height: 36px;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--border-soft);
  border-radius: 9px;
  background: var(--panel-strong);
  box-shadow: var(--shadow-float);
}

.bubble-menu > button {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.bubble-menu > button:hover,
.bubble-menu > button.active {
  background: var(--accent-faint);
  color: var(--accent-strong);
}

.bubble-divider {
  width: 1px;
  height: 18px;
  margin: 0 2px;
  background: var(--border-soft);
}

.highlight-dot {
  width: 15px;
  height: 15px;
  border: 1px solid #dccb7d;
  border-radius: 3px;
  background: #fff0a8;
}

.bubble-palette {
  position: absolute;
  top: 42px;
  left: 0;
  display: flex;
  gap: 7px;
  padding: 9px;
  border: 1px solid var(--border-soft);
  border-radius: 9px;
  background: var(--panel-strong);
  box-shadow: var(--shadow-float);
}

.bubble-swatch {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--swatch, var(--border-strong)) 70%, #000 8%);
  border-radius: 50%;
  background: var(--swatch);
  cursor: pointer;
}

.swatch-default {
  background: linear-gradient(135deg, #fff 45%, #ece8f3 45% 55%, #8f899e 55%);
}

.bubble-link {
  position: absolute;
  top: 42px;
  left: 0;
  display: flex;
  gap: 5px;
  width: 270px;
  padding: 7px;
  border: 1px solid var(--border-soft);
  border-radius: 9px;
  background: var(--panel-strong);
  box-shadow: var(--shadow-float);
}

.bubble-link input {
  min-width: 0;
  height: 28px;
  flex: 1;
  padding: 0 8px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--panel-muted);
  color: var(--text-primary);
  font-size: 10px;
}

.bubble-link button {
  padding: 0 9px;
  border: 0;
  border-radius: 6px;
  background: var(--accent);
  color: white;
  cursor: pointer;
  font-size: 10px;
}
</style>
