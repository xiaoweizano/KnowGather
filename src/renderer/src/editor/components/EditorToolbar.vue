<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Editor } from '@tiptap/core'
import AppIcon from '../../components/AppIcon.vue'
import {
  canRunEditorCommand,
  getActiveBlockLabel,
  isEditorCommandActive,
  runEditorCommand,
  setEditorHighlight,
  setEditorTextColor,
  type EditorCommand,
} from '../core/editorCommands'
import {
  HIGHLIGHT_COLORS,
  MORE_TOOLBAR_ITEMS,
  PRIMARY_TOOLBAR_ITEMS,
  TEXT_COLORS,
  type ToolbarActionItem,
} from '../core/toolbarConfig'
import { computeToolbarLayout } from '../core/toolbarLayout'

const props = defineProps<{ editor: Editor | null }>()
const emit = defineEmits<{
  notify: [message: string]
  requestImage: []
  requestAttachment: []
  insertTable: []
}>()

const toolbarRoot = ref<HTMLElement | null>(null)
const toolbarWidth = ref(900)
const revision = ref(0)
const openPanel = ref<'' | 'block' | 'color' | 'highlight' | 'link' | 'more'>('')
const linkValue = ref('')
let resizeObserver: ResizeObserver | null = null
let boundEditor: Editor | null = null

const blockOptions: ReadonlyArray<{ command: EditorCommand; label: string }> = [
  { command: 'paragraph', label: '正文' },
  { command: 'heading1', label: '标题 1' },
  { command: 'heading2', label: '标题 2' },
  { command: 'heading3', label: '标题 3' },
]

const layout = computed(() => computeToolbarLayout(toolbarWidth.value, PRIMARY_TOOLBAR_ITEMS, {
  fixedWidth: 272,
  gap: 4,
}))
const visibleItems = computed(() => {
  const visible = new Set(layout.value.visible)
  return PRIMARY_TOOLBAR_ITEMS.filter((item) => visible.has(item.key))
})
const overflowItems = computed(() => {
  const overflow = new Set(layout.value.overflow)
  return PRIMARY_TOOLBAR_ITEMS.filter((item) => overflow.has(item.key))
})
const moreItems = computed(() => [...overflowItems.value, ...MORE_TOOLBAR_ITEMS])
const activeBlockLabel = computed(() => {
  revision.value
  return props.editor ? getActiveBlockLabel(props.editor) : '正文'
})
const canUndo = computed(() => {
  revision.value
  return props.editor?.can().undo() ?? false
})
const canRedo = computed(() => {
  revision.value
  return props.editor?.can().redo() ?? false
})

function handleEditorEvent(): void {
  revision.value += 1
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
  revision.value += 1
}

watch(() => props.editor, bindEditor, { immediate: true })

onMounted(() => {
  if (toolbarRoot.value) {
    toolbarWidth.value = toolbarRoot.value.clientWidth
    resizeObserver = new ResizeObserver((entries) => {
      toolbarWidth.value = entries[0]?.contentRect.width ?? toolbarRoot.value?.clientWidth ?? 0
    })
    resizeObserver.observe(toolbarRoot.value)
  }
  document.addEventListener('pointerdown', handleDocumentPointerDown)
})

onBeforeUnmount(() => {
  bindEditor(null)
  resizeObserver?.disconnect()
  resizeObserver = null
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
})

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!toolbarRoot.value?.contains(event.target as Node)) openPanel.value = ''
}

function tooltip(item: ToolbarActionItem): string {
  return item.shortcut ? `${item.label}  ${item.shortcut}` : item.label
}

function isItemActive(item: ToolbarActionItem): boolean {
  revision.value
  return Boolean(props.editor && item.command && isEditorCommandActive(props.editor, item.command))
}

function isItemDisabled(item: ToolbarActionItem): boolean {
  revision.value
  if (!props.editor) return true
  if (!item.command) return false
  return !canRunEditorCommand(props.editor, item.command)
}

function togglePanel(panel: typeof openPanel.value): void {
  openPanel.value = openPanel.value === panel ? '' : panel
  if (panel === 'link' && props.editor) {
    linkValue.value = String(props.editor.getAttributes('link').href ?? '')
    void nextTick(() => document.querySelector<HTMLInputElement>('.link-popover input')?.focus())
  }
}

function runItem(item: ToolbarActionItem): void {
  const editor = props.editor
  if (!editor) return
  if (item.key === 'color' || item.key === 'highlight') {
    togglePanel(item.key)
    return
  }
  if (item.key === 'link') {
    togglePanel('link')
    return
  }
  if (item.key === 'image') {
    emit('requestImage')
  } else if (item.key === 'attachment') {
    emit('requestAttachment')
  } else if (item.key === 'table') {
    emit('insertTable')
  } else if (item.command) {
    runEditorCommand(editor, item.command)
  }
  openPanel.value = ''
  revision.value += 1
}

function selectBlock(command: EditorCommand): void {
  if (!props.editor) return
  runEditorCommand(props.editor, command)
  openPanel.value = ''
  revision.value += 1
}

function applyTextColor(color: string | null): void {
  if (!props.editor) return
  setEditorTextColor(props.editor, color)
  openPanel.value = ''
  revision.value += 1
}

function applyHighlight(color: string | null): void {
  if (!props.editor) return
  setEditorHighlight(props.editor, color)
  openPanel.value = ''
  revision.value += 1
}

function applyLink(): void {
  const editor = props.editor
  if (!editor) return
  const href = linkValue.value.trim()
  if (!href) {
    editor.chain().unsetLink().run()
  } else {
    const normalized = /^(https?:|mailto:|#|\/)/i.test(href) ? href : `https://${href}`
    editor.chain().extendMarkRange('link').setLink({ href: normalized }).run()
  }
  openPanel.value = ''
  revision.value += 1
}

function removeLink(): void {
  if (!props.editor) return
  props.editor.chain().extendMarkRange('link').unsetLink().run()
  openPanel.value = ''
  revision.value += 1
}
</script>

<template>
  <div ref="toolbarRoot" class="editor-toolbar" role="toolbar" aria-label="文档格式工具栏">
    <div class="block-picker">
      <button class="block-label" type="button" :aria-expanded="openPanel === 'block'" title="段落样式" @mousedown.prevent @click="togglePanel('block')">
        {{ activeBlockLabel }} <AppIcon name="chevronDown" :size="13" />
      </button>
      <div v-if="openPanel === 'block'" class="toolbar-popover block-menu" role="menu">
        <button v-for="option in blockOptions" :key="option.command" type="button" role="menuitem" :class="{ active: activeBlockLabel === option.label }" @mousedown.prevent @click="selectBlock(option.command)">
          <span>{{ option.label }}</span>
          <AppIcon v-if="activeBlockLabel === option.label" name="check" :size="14" />
        </button>
      </div>
    </div>

    <span class="toolbar-divider" />

    <button type="button" class="toolbar-button" title="撤销  Ctrl+Z" :disabled="!canUndo" @mousedown.prevent @click="props.editor && runEditorCommand(props.editor, 'undo')">
      <AppIcon name="undo" :size="17" />
    </button>
    <button type="button" class="toolbar-button" title="重做  Ctrl+Shift+Z" :disabled="!canRedo" @mousedown.prevent @click="props.editor && runEditorCommand(props.editor, 'redo')">
      <AppIcon name="redo" :size="17" />
    </button>

    <span class="toolbar-divider" />

    <div class="toolbar-tools">
      <button v-for="item in visibleItems" :key="item.key" type="button" class="toolbar-button" :class="{ active: isItemActive(item) }" :disabled="isItemDisabled(item)" :title="tooltip(item)" :aria-label="item.label" :aria-pressed="item.command ? isItemActive(item) : undefined" @mousedown.prevent @click="runItem(item)">
        <AppIcon :name="item.icon" :size="17" />
      </button>
    </div>

    <span class="toolbar-spacer" />

    <div class="more-picker">
      <button type="button" class="toolbar-button" :class="{ active: openPanel === 'more' }" title="更多格式" aria-label="更多格式" :aria-expanded="openPanel === 'more'" @mousedown.prevent @click="togglePanel('more')">
        <AppIcon name="more" :size="18" />
      </button>
      <div v-if="openPanel === 'more'" class="toolbar-popover more-menu" role="menu">
        <button v-for="item in moreItems" :key="item.key" type="button" role="menuitem" :class="{ active: isItemActive(item) }" :disabled="isItemDisabled(item)" @mousedown.prevent @click="runItem(item)">
          <AppIcon :name="item.icon" :size="16" />
          <span>{{ item.label }}</span>
          <kbd v-if="item.shortcut">{{ item.shortcut }}</kbd>
        </button>
      </div>
    </div>

    <div v-if="openPanel === 'color'" class="toolbar-popover color-menu" role="menu" aria-label="文字颜色">
      <span class="popover-title">文字颜色</span>
      <div class="swatch-grid">
        <button v-for="option in TEXT_COLORS" :key="option.label" type="button" class="swatch" :title="option.label" :class="{ 'swatch-default': !option.value }" :style="option.value ? { '--swatch': option.value } : undefined" @mousedown.prevent @click="applyTextColor(option.value)" />
      </div>
    </div>

    <div v-if="openPanel === 'highlight'" class="toolbar-popover color-menu" role="menu" aria-label="背景高亮">
      <span class="popover-title">背景高亮</span>
      <div class="swatch-grid">
        <button v-for="option in HIGHLIGHT_COLORS" :key="option.label" type="button" class="swatch" :title="option.label" :class="{ 'swatch-default': !option.value }" :style="option.value ? { '--swatch': option.value } : undefined" @mousedown.prevent @click="applyHighlight(option.value)" />
      </div>
    </div>

    <div v-if="openPanel === 'link'" class="toolbar-popover link-popover" role="dialog" aria-label="插入链接">
      <label for="editor-link-input">链接地址</label>
      <div class="link-row">
        <input id="editor-link-input" v-model="linkValue" type="url" placeholder="https://example.com" @keydown.enter.prevent="applyLink" @keydown.esc.prevent="openPanel = ''" />
        <button type="button" class="primary-action" @click="applyLink">应用</button>
      </div>
      <button v-if="props.editor?.isActive('link')" type="button" class="link-remove" @click="removeLink">移除链接</button>
    </div>
  </div>
</template>

<style scoped>
.editor-toolbar { position: relative; z-index: 12; display: flex; width: 100%; height: var(--toolbar-height); flex: 0 0 auto; align-items: center; gap: 4px; padding: 0 14px; border-top: 1px solid var(--border-soft); border-bottom: 1px solid var(--border-soft); background: var(--panel-strong); overflow: visible; }
.toolbar-tools { display: flex; min-width: 0; align-items: center; gap: 4px; }
.toolbar-spacer { min-width: 2px; flex: 1; }
.block-picker, .more-picker { position: relative; flex: 0 0 auto; }
.block-label, .toolbar-button { display: inline-flex; height: 30px; align-items: center; justify-content: center; border: 0; border-radius: 7px; background: transparent; color: var(--text-secondary); cursor: pointer; }
.block-label { min-width: 78px; gap: 5px; padding: 0 8px; color: var(--text-secondary); font-size: 12px; font-weight: 650; }
.toolbar-button { width: 30px; flex: 0 0 30px; }
.block-label:hover, .toolbar-button:hover:not(:disabled), .toolbar-button.active { background: var(--panel-muted); color: var(--accent-strong); }
.toolbar-button.active { background: var(--accent-soft); }
.toolbar-button:disabled, .more-menu button:disabled { color: var(--text-tertiary); cursor: default; opacity: 0.55; }
.toolbar-divider { width: 1px; height: 20px; margin: 0 3px; flex: 0 0 1px; background: var(--border-soft); }
.toolbar-popover { position: absolute; top: calc(100% + 7px); z-index: 40; border: 1px solid var(--border-soft); border-radius: 10px; background: var(--panel-strong); box-shadow: var(--shadow-float); }
.block-menu { left: 0; width: 150px; padding: 5px; }
.block-menu button, .more-menu button { display: flex; width: 100%; height: 32px; align-items: center; gap: 8px; padding: 0 9px; border: 0; border-radius: 6px; background: transparent; color: var(--text-primary); cursor: pointer; font-size: 11px; text-align: left; }
.block-menu button:hover, .more-menu button:hover:not(:disabled), .block-menu button.active, .more-menu button.active { background: var(--accent-faint); color: var(--accent-strong); }
.block-menu button span:first-child { flex: 1; }
.more-menu { right: 0; width: 220px; max-height: min(420px, calc(100vh - 180px)); padding: 5px; overflow-y: auto; }
.more-menu button span { flex: 1; }
.more-menu kbd { color: var(--text-tertiary); font: inherit; font-size: 9px; }
.color-menu { right: 54px; width: 190px; padding: 10px; }
.popover-title, .link-popover label { color: var(--text-secondary); font-size: 10px; font-weight: 650; }
.swatch-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 7px; margin-top: 9px; }
.swatch { width: 20px; height: 20px; padding: 0; border: 1px solid color-mix(in srgb, var(--swatch, var(--border-strong)) 70%, #000 8%); border-radius: 50%; background: var(--swatch); cursor: pointer; }
.swatch-default { background: linear-gradient(135deg, #fff 45%, #ece8f3 45% 55%, #8f899e 55%); }
.link-popover { right: 54px; width: 320px; padding: 11px; }
.link-row { display: flex; gap: 7px; margin-top: 7px; }
.link-row input { min-width: 0; height: 31px; flex: 1; padding: 0 9px; border: 1px solid var(--border-strong); border-radius: 7px; background: var(--panel-muted); color: var(--text-primary); font-size: 11px; }
.primary-action, .link-remove { border: 0; border-radius: 7px; cursor: pointer; font-size: 10px; }
.primary-action { padding: 0 11px; background: var(--accent); color: white; }
.link-remove { margin-top: 8px; padding: 5px 0; background: transparent; color: var(--danger); }
@media (max-width: 760px) { .editor-toolbar { padding: 0 8px; } .block-label { min-width: 58px; max-width: 58px; overflow: hidden; white-space: nowrap; } }
</style>
