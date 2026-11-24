<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Editor } from '@tiptap/core'
import AppIcon from '../../components/AppIcon.vue'
import {
  applyEditorLink,
  applyFormatSnapshot,
  canRunEditorCommand,
  captureFormatSnapshot,
  currentEditorFontSize,
  getActiveBlockLabel,
  getActiveLinkRange,
  isEditorCommandActive,
  runEditorCommand,
  setEditorFontSize,
  setEditorHighlight,
  setEditorTextColor,
  type EditorCommand,
  type FormatSnapshot,
} from '../core/editorCommands'
import {
  ALIGN_ITEMS,
  INDENT_ITEMS,
  INSERT_GROUP,
  INSERT_MENU_ITEMS,
  LIST_ITEMS,
  MORE_TOOLBAR_ITEMS,
  TEXT_GROUP,
  TEXT_STYLE_MENU,
  VIEW_GROUP,
  type ToolbarItem,
} from '../core/toolbarConfig'
import {
  DEFAULT_FONT_SIZE,
  FONT_SIZES,
} from '../core/palettes'
import ColorPanel from './ColorPanel.vue'
import { useUiStore } from '../../stores/ui'
import { useI18n } from '../../i18n/useI18n'
import LinkForm from './LinkForm.vue'

const props = defineProps<{ editor: Editor | null }>()
const { t } = useI18n()
const ui = useUiStore()
const emit = defineEmits<{
  notify: [message: string]
  requestImage: []
  requestAttachment: []
  insertTable: []
  foldAll: []
  unfoldAll: []
}>()

type Panel =
  | '' | 'block' | 'size' | 'color' | 'highlight' | 'link' | 'more'
  | 'textStyles' | 'align' | 'ordered' | 'task' | 'indent' | 'insert'

const toolbarRoot = ref<HTMLElement | null>(null)
const revision = ref(0)
const openPanel = ref<Panel>('')
const linkText = ref('')
const linkValue = ref('')
/** Captured while the format painter is armed; cleared after it is applied. */
const painter = ref<FormatSnapshot | null>(null)
let boundEditor: Editor | null = null

const blockOptions: ReadonlyArray<{ command: EditorCommand; labelKey: string }> = [
  { command: 'paragraph', labelKey: 'editor.block.paragraph' },
  { command: 'heading1', labelKey: 'editor.block.heading1' },
  { command: 'heading2', labelKey: 'editor.block.heading2' },
  { command: 'heading3', labelKey: 'editor.block.heading3' },
  { command: 'heading4', labelKey: 'editor.block.heading4' },
  { command: 'heading5', labelKey: 'editor.block.heading5' },
  { command: 'heading6', labelKey: 'editor.block.heading6' },
]

const activeBlockLabel = computed(() => {
  revision.value
  return props.editor ? getActiveBlockLabel(props.editor) : t('editor.block.paragraph')
})
const activeFontSize = computed(() => {
  revision.value
  const size = props.editor ? currentEditorFontSize(props.editor) : null
  return size ?? DEFAULT_FONT_SIZE
})
/** Current colours, shown as the underline under the A / highlighter icons. */
const activeTextColor = computed(() => {
  revision.value
  const value = props.editor?.getAttributes('textStyle').color
  return typeof value === 'string' && value ? value : null
})
const activeHighlight = computed(() => {
  revision.value
  const value = props.editor?.getAttributes('highlight').color
  return typeof value === 'string' && value ? value : null
})
const colorButton = ref<HTMLElement | null>(null)
const highlightButton = ref<HTMLElement | null>(null)
const canUndo = computed(() => {
  revision.value
  return props.editor?.can().undo() ?? false
})
const canRedo = computed(() => {
  revision.value
  return props.editor?.can().redo() ?? false
})
const currentAlign = computed(() => {
  revision.value
  const editor = props.editor
  if (!editor) return ALIGN_ITEMS[0]!
  return ALIGN_ITEMS.find((item) => editor.isActive({ textAlign: item.key.slice(5).toLowerCase() })) ?? ALIGN_ITEMS[0]!
})
const currentList = computed(() => {
  revision.value
  const editor = props.editor
  if (!editor) return LIST_ITEMS[0]!
  return LIST_ITEMS.find((item) => editor.isActive(item.key)) ?? LIST_ITEMS[0]!
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

onMounted(() => document.addEventListener('pointerdown', handleDocumentPointerDown))
onBeforeUnmount(() => {
  bindEditor(null)
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
})

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!toolbarRoot.value?.contains(event.target as Node)) openPanel.value = ''
}

function tooltip(item: ToolbarItem): string {
  const label = t(item.labelKey)
  return item.shortcut ? `${label}  ${item.shortcut}` : label
}

function isItemActive(item: ToolbarItem): boolean {
  revision.value
  return Boolean(props.editor && item.command && isEditorCommandActive(props.editor, item.command))
}

function isItemDisabled(item: ToolbarItem): boolean {
  revision.value
  if (!props.editor) return true
  if (!item.command) return false
  return !canRunEditorCommand(props.editor, item.command)
}

function togglePanel(panel: Panel): void {
  openPanel.value = openPanel.value === panel ? '' : panel
  if (panel === 'link' && props.editor) {
    const range = getActiveLinkRange(props.editor) ?? props.editor.state.selection
    linkText.value = range.from === range.to ? '' : props.editor.state.doc.textBetween(range.from, range.to, ' ')
    linkValue.value = String(props.editor.getAttributes('link').href ?? '')
  }
}

/** Runs one toolbar button: marks, block commands, or the picker panels. */
function runItem(item: ToolbarItem): void {
  const editor = props.editor
  if (!editor) return
  switch (item.key) {
    case 'color':
    case 'highlight':
    case 'link':
      togglePanel(item.key)
      return
    case 'image':
      emit('requestImage')
      break
    case 'attachment':
      emit('requestAttachment')
      break
    case 'table':
      emit('insertTable')
      break
    case 'align':
      togglePanel('align')
      return
    case 'outline':
      ui.toggleOutline()
      return
    case 'ordered':
      togglePanel('ordered')
      return
    case 'task':
      togglePanel('task')
      return
    case 'indent':
      togglePanel('indent')
      return
    default:
      if (item.command) runEditorCommand(editor, item.command)
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

function selectFontSize(size: string): void {
  if (!props.editor) return
  setEditorFontSize(props.editor, size === DEFAULT_FONT_SIZE ? null : size)
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

function applyLink(text: string, href: string): void {
  const editor = props.editor
  if (!editor) return
  applyEditorLink(editor, text, href)
  openPanel.value = ''
  revision.value += 1
}

function runFold(key: string): void {
  if (key === 'foldAll') emit('foldAll')
  else emit('unfoldAll')
  openPanel.value = ''
}

/** Format painter: first press copies, the next selection pastes the style. */
function togglePainter(): void {
  const editor = props.editor
  if (!editor) return
  if (painter.value) {
    applyFormatSnapshot(editor, painter.value)
    painter.value = null
    openPanel.value = ''
    return
  }
  painter.value = captureFormatSnapshot(editor)
}

const foldItems = computed(() => [
  { key: 'foldAll', label: t('editor.toolbar.foldAll'), icon: 'chevronDown', shortcut: 'Ctrl+Alt+[' },
  { key: 'unfoldAll', label: t('editor.toolbar.unfoldAll'), icon: 'chevronRight', shortcut: 'Ctrl+Alt+]' },
])
</script>

<template>
  <div ref="toolbarRoot" class="editor-toolbar" role="toolbar" :aria-label="t('editor.toolbar.aria')">
    <!-- 1 · insert -->
    <div class="toolbar-group insert-group">
      <button type="button" class="toolbar-button insert-button" data-testid="editor-insert" :class="{ active: openPanel === 'insert' }" :title="t('editor.insert')" :aria-label="t('editor.insert')" :aria-expanded="openPanel === 'insert'" @mousedown.prevent @click="togglePanel('insert')">
        <span class="insert-mark"><AppIcon name="plus" :size="13" /></span>
      </button>
      <div v-if="openPanel === 'insert'" class="toolbar-popover insert-menu" role="menu" :aria-label="t('editor.insert')">
        <button v-for="item in INSERT_MENU_ITEMS" :key="`insert-${item.key}`" type="button" role="menuitem" @mousedown.prevent @click="runItem(item)">
          <AppIcon :name="item.icon" :size="15" />
          <span>{{ t(item.labelKey) }}</span>
        </button>
      </div>
    </div>

    <!-- 2 · history and format tools -->
    <div class="toolbar-group">
      <button type="button" class="toolbar-button" :title="t('editor.toolbar.undo') + '  Ctrl+Z'" :aria-label="t('editor.toolbar.undo')" :disabled="!canUndo" @mousedown.prevent @click="props.editor && runEditorCommand(props.editor, 'undo')">
        <AppIcon name="undo" :size="17" />
      </button>
      <button type="button" class="toolbar-button" :title="t('editor.toolbar.redo') + '  Ctrl+Shift+Z'" :aria-label="t('editor.toolbar.redo')" :disabled="!canRedo" @mousedown.prevent @click="props.editor && runEditorCommand(props.editor, 'redo')">
        <AppIcon name="redo" :size="17" />
      </button>
      <button type="button" class="toolbar-button" :class="{ active: painter }" data-testid="editor-painter" :title="t('editor.toolbar.formatPainter')" :aria-label="t('editor.toolbar.formatPainter')" :aria-pressed="Boolean(painter)" @mousedown.prevent @click="togglePainter">
        <AppIcon name="painter" :size="17" />
      </button>
      <button type="button" class="toolbar-button" :title="t('editor.clearFormatting')" :aria-label="t('editor.clearFormatting')" @mousedown.prevent @click="props.editor && runEditorCommand(props.editor, 'clearFormatting')">
        <AppIcon name="eraser" :size="17" />
      </button>
    </div>

    <!-- 3 · block style, size, text marks -->
    <div class="toolbar-group toolbar-group-wide">
      <div class="block-picker">
        <button class="block-label" type="button" :aria-expanded="openPanel === 'block'" :title="t('editor.toolbar.paragraphStyle')" @mousedown.prevent @click="togglePanel('block')">
          {{ activeBlockLabel }} <AppIcon name="chevronDown" :size="13" />
        </button>
        <div v-if="openPanel === 'block'" class="toolbar-popover block-menu" role="menu">
          <button v-for="option in blockOptions" :key="option.command" type="button" role="menuitem" :class="{ active: activeBlockLabel === t(option.labelKey) }" @mousedown.prevent @click="selectBlock(option.command)">
            <span>{{ t(option.labelKey) }}</span>
            <AppIcon v-if="activeBlockLabel === t(option.labelKey)" name="check" :size="14" />
          </button>
        </div>
      </div>

      <div class="size-picker">
        <button class="size-label" type="button" :aria-expanded="openPanel === 'size'" :title="t('editor.fontSize')" @mousedown.prevent @click="togglePanel('size')">
          {{ parseInt(activeFontSize, 10) }}px <AppIcon name="chevronDown" :size="12" />
        </button>
        <div v-if="openPanel === 'size'" class="toolbar-popover size-menu" role="menu" :aria-label="t('editor.fontSize')">
          <button
            v-for="size in FONT_SIZES"
            :key="size"
            type="button"
            role="menuitem"
            :class="{ active: activeFontSize === size }"
            @mousedown.prevent
            @click="selectFontSize(size)"
          >
            <span :style="{ fontSize: `min(${size}, 20px)` }">{{ parseInt(size, 10) }}</span>
            <span class="size-hint">{{ size === DEFAULT_FONT_SIZE ? t('editor.fontSize.default') : size }}</span>
          </button>
        </div>
      </div>

      <button v-for="item in TEXT_GROUP" :key="item.key" type="button" class="toolbar-button" :class="{ active: isItemActive(item) }" :disabled="isItemDisabled(item)" :title="tooltip(item)" :aria-label="t(item.labelKey)" @mousedown.prevent @click="runItem(item)">
        <AppIcon :name="item.icon" :size="17" />
      </button>

      <div class="more-picker">
        <button type="button" class="toolbar-button" data-testid="editor-text-styles" :class="{ active: openPanel === 'textStyles' }" :title="t('editor.moreText')" :aria-label="t('editor.moreText')" :aria-expanded="openPanel === 'textStyles'" @mousedown.prevent @click="togglePanel('textStyles')">
          <span class="text-style-mark">T<AppIcon name="chevronDown" :size="10" /></span>
        </button>
        <div v-if="openPanel === 'textStyles'" class="toolbar-popover more-menu" role="menu">
          <button v-for="item in TEXT_STYLE_MENU" :key="item.key" type="button" role="menuitem" :class="{ active: isItemActive(item) }" @mousedown.prevent @click="runItem(item)">
            <AppIcon :name="item.icon" :size="16" />
            <span>{{ t(item.labelKey) }}</span>
            <kbd v-if="item.shortcut">{{ item.shortcut }}</kbd>
          </button>
        </div>
      </div>
    </div>

    <!-- 4 · colour and highlight -->
    <div class="toolbar-group">
      <button ref="colorButton" type="button" class="toolbar-button color-button" :class="{ active: openPanel === 'color' }" :title="t('editor.toolbar.color')" :aria-label="t('editor.toolbar.color')" :aria-expanded="openPanel === 'color'" @mousedown.prevent @click="togglePanel('color')">
        <span class="color-mark" :style="activeTextColor ? { borderBottomColor: activeTextColor } : undefined">A</span><AppIcon name="chevronDown" :size="10" />
      </button>
      <button ref="highlightButton" type="button" class="toolbar-button color-button" :class="{ active: openPanel === 'highlight' }" :title="t('editor.toolbar.highlight')" :aria-label="t('editor.toolbar.highlight')" :aria-expanded="openPanel === 'highlight'" @mousedown.prevent @click="togglePanel('highlight')">
        <span class="highlight-mark" :style="activeHighlight ? { borderBottomColor: activeHighlight } : undefined"><AppIcon name="paint" :size="15" /></span><AppIcon name="chevronDown" :size="10" />
      </button>
      <ColorPanel
        v-if="openPanel === 'color' || openPanel === 'highlight'"
        :mode="openPanel === 'highlight' ? 'highlight' : 'color'"
        :anchor="openPanel === 'highlight' ? highlightButton : colorButton"
        :current="openPanel === 'highlight' ? activeHighlight : activeTextColor"
        @pick="openPanel === 'highlight' ? applyHighlight($event) : applyTextColor($event)"
        @close="openPanel = ''"
      />
    </div>

    <!-- 5 · alignment and lists -->
    <div class="toolbar-group">
      <div class="split-button">
        <button type="button" class="toolbar-button split-face" :title="t('editor.toolbar.alignMore')" :aria-label="t('editor.toolbar.alignMore')" @mousedown.prevent @click="togglePanel('align')">
          <AppIcon :name="currentAlign.icon" :size="17" />
        </button>
        <button type="button" class="split-caret" :aria-expanded="openPanel === 'align'" :aria-label="t('editor.toolbar.alignMore')" @mousedown.prevent @click="togglePanel('align')">
          <AppIcon name="chevronDown" :size="11" />
        </button>
        <div v-if="openPanel === 'align'" class="toolbar-popover split-menu" role="menu" :aria-label="t('editor.toolbar.alignMore')">
          <button v-for="item in ALIGN_ITEMS" :key="item.key" type="button" role="menuitem" :class="{ active: currentAlign.key === item.key }" @mousedown.prevent @click="runItem(item)">
            <AppIcon :name="item.icon" :size="15" />
            <span>{{ t(item.labelKey) }}</span>
          </button>
        </div>
      </div>

      <button type="button" class="toolbar-button" :class="{ active: isItemActive(LIST_ITEMS[0]!) }" :title="t('editor.bulletList')" :aria-label="t('editor.bulletList')" @mousedown.prevent @click="runItem(LIST_ITEMS[0]!)">
        <AppIcon name="list" :size="17" />
      </button>

      <div class="split-button">
        <button type="button" class="toolbar-button split-face" :class="{ active: isItemActive(LIST_ITEMS[1]!) }" :title="t('editor.orderedList')" :aria-label="t('editor.orderedList')" @mousedown.prevent @click="runItem(LIST_ITEMS[1]!)">
          <AppIcon name="orderedList" :size="17" />
        </button>
        <button type="button" class="split-caret" :aria-expanded="openPanel === 'ordered'" :aria-label="t('editor.orderedList')" @mousedown.prevent @click="togglePanel('ordered')">
          <AppIcon name="chevronDown" :size="11" />
        </button>
        <div v-if="openPanel === 'ordered'" class="toolbar-popover split-menu" role="menu" :aria-label="t('editor.orderedList')">
          <button v-for="item in LIST_ITEMS" :key="item.key" type="button" role="menuitem" :class="{ active: currentList.key === item.key }" @mousedown.prevent @click="runItem(item)">
            <AppIcon :name="item.icon" :size="15" />
            <span>{{ t(item.labelKey) }}</span>
          </button>
        </div>
      </div>

      <div class="split-button">
        <button type="button" class="toolbar-button split-face" :class="{ active: isItemActive(LIST_ITEMS[2]!) }" :title="t('editor.taskList')" :aria-label="t('editor.taskList')" @mousedown.prevent @click="runItem(LIST_ITEMS[2]!)">
          <AppIcon name="check" :size="17" />
        </button>
        <button type="button" class="split-caret" :aria-expanded="openPanel === 'task'" :aria-label="t('editor.taskList')" @mousedown.prevent @click="togglePanel('task')">
          <AppIcon name="chevronDown" :size="11" />
        </button>
        <div v-if="openPanel === 'task'" class="toolbar-popover split-menu split-menu-right" role="menu" :aria-label="t('editor.taskList')">
          <button v-for="item in LIST_ITEMS" :key="item.key" type="button" role="menuitem" :class="{ active: currentList.key === item.key }" @mousedown.prevent @click="runItem(item)">
            <AppIcon :name="item.icon" :size="15" />
            <span>{{ t(item.labelKey) }}</span>
          </button>
        </div>
      </div>

      <div class="split-button">
        <button type="button" class="toolbar-button split-face" :title="t('editor.indent')" :aria-label="t('editor.indent')" @mousedown.prevent @click="runItem(INDENT_ITEMS[0]!)">
          <AppIcon name="indentIncrease" :size="17" />
        </button>
        <button type="button" class="split-caret" :aria-expanded="openPanel === 'indent'" :aria-label="t('editor.indent')" @mousedown.prevent @click="togglePanel('indent')">
          <AppIcon name="chevronDown" :size="11" />
        </button>
        <div v-if="openPanel === 'indent'" class="toolbar-popover split-menu split-menu-right" role="menu" :aria-label="t('editor.indent')">
          <button v-for="item in INDENT_ITEMS" :key="item.key" type="button" role="menuitem" @mousedown.prevent @click="runItem(item)">
            <AppIcon :name="item.icon" :size="15" />
            <span>{{ t(item.labelKey) }}</span>
            <kbd v-if="item.shortcut">{{ item.shortcut }}</kbd>
          </button>
        </div>
      </div>
    </div>

    <!-- 6 · block inserts -->
    <div class="toolbar-group">
      <button v-for="item in INSERT_GROUP" :key="item.key" type="button" class="toolbar-button" :class="{ active: isItemActive(item) }" :title="t(item.labelKey)" :aria-label="t(item.labelKey)" @mousedown.prevent @click="runItem(item)">
        <AppIcon :name="item.icon" :size="17" />
      </button>
    </div>

    <span class="toolbar-spacer" />

    <!-- 7 · media, outline, overflow -->
    <div class="toolbar-group">
      <button v-for="item in VIEW_GROUP" :key="item.key" type="button" class="toolbar-button" :class="{ active: isItemActive(item) }" :title="t(item.labelKey)" :aria-label="t(item.labelKey)" @mousedown.prevent @click="runItem(item)">
        <AppIcon :name="item.icon" :size="17" />
      </button>
      <button type="button" class="toolbar-button" :class="{ active: ui.contentWidth === 'wide' }" :title="ui.contentWidth === 'wide' ? t('status.widthComfortable') : t('status.widthWide')" :aria-label="t('status.widthWide')" @mousedown.prevent @click="ui.toggleContentWidth()">
        <AppIcon name="widthFull" :size="17" />
      </button>
      <button type="button" class="toolbar-button" :title="t('editor.toolbar.moreFormat')" :aria-label="t('editor.toolbar.moreFormat')" :aria-expanded="openPanel === 'more'" @mousedown.prevent @click="togglePanel('more')">
        <AppIcon name="more" :size="17" />
      </button>
      <div v-if="openPanel === 'more'" class="toolbar-popover more-menu more-menu-right" role="menu">
        <button v-for="item in MORE_TOOLBAR_ITEMS" :key="item.key" type="button" role="menuitem" :class="{ active: isItemActive(item) }" :disabled="isItemDisabled(item)" @mousedown.prevent @click="runItem(item)">
          <AppIcon :name="item.icon" :size="16" />
          <span>{{ t(item.labelKey) }}</span>
          <kbd v-if="item.shortcut">{{ item.shortcut }}</kbd>
        </button>
        <div class="more-separator" />
        <button v-for="item in foldItems" :key="item.key" type="button" role="menuitem" @mousedown.prevent @click="runFold(item.key)">
          <AppIcon :name="item.icon" :size="16" />
          <span>{{ item.label }}</span>
          <kbd>{{ item.shortcut }}</kbd>
        </button>
      </div>
    </div>

    <div v-if="openPanel === 'link'" class="toolbar-popover link-popover" role="dialog" :aria-label="t('editor.link')">
      <LinkForm :text="linkText" :href="linkValue" @submit="applyLink" @cancel="openPanel = ''" />
    </div>
  </div>
</template>

<style scoped>
/* The bar is a row of boxed groups, the way Yuque lays it out: no width-based
   folding, so every common action keeps its own always-visible slot. */
.editor-toolbar { position: relative; z-index: 12; display: flex; width: 100%; height: var(--toolbar-height); flex: 0 0 auto; align-items: center; gap: 5px; padding: 0 10px; border-bottom: 1px solid var(--divider-soft); background: var(--panel-strong); overflow-x: auto; overflow-y: visible; scrollbar-width: none; }
.editor-toolbar::-webkit-scrollbar { display: none; }
.toolbar-group { display: flex; flex: 0 0 auto; align-items: center; gap: 1px; padding: 3px 3px; border: 1px solid var(--border-soft); border-radius: 9px; background: var(--panel-strong); }
.toolbar-group-wide { gap: 3px; }
.toolbar-spacer { min-width: 4px; flex: 1; }
.insert-group { position: relative; }
.insert-menu { left: 0; width: 180px; padding: 5px; }
.insert-menu button { display: flex; width: 100%; height: 32px; align-items: center; gap: 8px; padding: 0 9px; border: 0; border-radius: 6px; background: transparent; color: var(--text-primary); cursor: pointer; font: inherit; font-size: 11px; text-align: left; }
.insert-menu button:hover { background: var(--accent-faint); color: var(--accent-strong); }
.block-picker, .size-picker, .more-picker { position: relative; flex: 0 0 auto; }
.block-label, .size-label, .toolbar-button { display: inline-flex; height: 28px; align-items: center; justify-content: center; border: 0; border-radius: 6px; background: transparent; color: var(--text-secondary); cursor: pointer; }
.block-label { min-width: 58px; gap: 3px; padding: 0 5px; font-size: 11.5px; font-weight: 650; }
.size-label { min-width: 46px; gap: 2px; padding: 0 4px; font-size: 11.5px; font-variant-numeric: tabular-nums; }
.toolbar-button { width: 26px; flex: 0 0 26px; }
.insert-button { width: 27px; }
.insert-mark { display: grid; width: 18px; height: 18px; place-items: center; border-radius: 50%; background: var(--state-success-fg); color: #fff; }
.block-label:hover, .size-label:hover, .toolbar-button:hover:not(:disabled), .toolbar-button.active { background: var(--panel-muted); color: var(--accent-strong); }
.toolbar-button.active { background: var(--accent-soft); }
.toolbar-button:disabled, .more-menu button:disabled { color: var(--text-tertiary); cursor: default; opacity: 0.55; }
.toolbar-popover { position: absolute; top: calc(100% + 8px); z-index: 40; border: 1px solid var(--border-soft); border-radius: 10px; background: var(--panel-strong); box-shadow: var(--shadow-float); }
.block-menu { left: 0; width: 150px; padding: 5px; }
.block-menu button, .more-menu button { display: flex; width: 100%; height: 32px; align-items: center; gap: 8px; padding: 0 9px; border: 0; border-radius: 6px; background: transparent; color: var(--text-primary); cursor: pointer; font-size: 11px; text-align: left; }
.block-menu button:hover, .more-menu button:hover:not(:disabled), .block-menu button.active, .more-menu button.active { background: var(--accent-faint); color: var(--accent-strong); }
.block-menu button span:first-child { flex: 1; }
.size-menu { left: 0; display: flex; width: 150px; flex-direction: column; gap: 1px; padding: 5px; }
.size-menu button { display: flex; height: 30px; align-items: center; justify-content: space-between; padding: 0 9px; border: 0; border-radius: 6px; background: transparent; color: var(--text-primary); cursor: pointer; }
.size-menu button:hover, .size-menu button.active { background: var(--accent-faint); color: var(--accent-strong); }
.size-hint { color: var(--text-tertiary); font-size: 9.5px; }
.more-menu { left: 0; width: 210px; max-height: min(420px, calc(100vh - 180px)); padding: 5px; overflow-y: auto; }
.more-menu-right { left: auto; right: 0; }
.more-menu button span { flex: 1; }
.more-menu kbd { color: var(--text-tertiary); font: inherit; font-size: 9px; }
.more-separator { height: 1px; margin: 4px 6px; background: var(--divider-soft); }
.text-style-mark { display: inline-flex; align-items: center; gap: 1px; font-size: 14px; font-weight: 700; }
.color-button { gap: 1px; }
.color-mark { font-size: 14px; font-weight: 700; border-bottom: 2px solid var(--state-danger-fg); line-height: 1.05; }
.highlight-mark { display: inline-flex; padding-bottom: 1px; border-bottom: 2px solid var(--state-warning-fg); }
.link-popover { left: 0; width: auto; padding: 0; border: 0; background: transparent; box-shadow: none; }

/* --- palettes: a hue-per-column grid, the way Yuque lays its swatches out --- */
/* --- split buttons: face + caret, the shape the mock uses for lists --- */
.split-button { position: relative; display: flex; align-items: center; border-radius: 6px; }
.split-button:hover { background: var(--panel-muted); }
.split-face { border-radius: 6px 0 0 6px; }
.split-caret { display: inline-flex; width: 13px; height: 28px; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 0 6px 6px 0; background: transparent; color: var(--text-tertiary); cursor: pointer; }
.split-caret:hover { color: var(--accent-strong); }
.split-menu { left: 0; width: 160px; padding: 5px; }
.split-menu-right { left: auto; right: 0; }
.split-menu button { display: flex; width: 100%; height: 32px; align-items: center; gap: 9px; padding: 0 9px; border: 0; border-radius: 6px; background: transparent; color: var(--text-primary); cursor: pointer; font: inherit; font-size: 11px; text-align: left; }
.split-menu button span { flex: 1; }
.split-menu button kbd { color: var(--text-tertiary); font: inherit; font-size: 9px; }
.split-menu button:hover, .split-menu button.active { background: var(--accent-faint); color: var(--accent-strong); }

@media (max-width: 900px) { .editor-toolbar { gap: 6px; padding: 0 8px; } .block-label { min-width: 58px; } }
</style>
