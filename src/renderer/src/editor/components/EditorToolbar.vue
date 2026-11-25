<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Editor } from '@tiptap/core'
import AppIcon from '../../components/AppIcon.vue'
import {
  applyEditorLink,
  applyFormatSnapshot,
  canRunEditorCommand,
  captureFormatSnapshot,
  currentEditorFontSize,
  currentBlockLineHeight,
  getActiveBlockLabel,
  getActiveLinkRange,
  isEditorCommandActive,
  runEditorCommand,
  setEditorFontSize,
  setEditorHighlight,
  setEditorLineHeight,
  setEditorTextColor,
  type EditorCommand,
  type FormatSnapshot,
} from '../core/editorCommands'
import {
  ALIGN_ITEMS,
  INDENT_ITEMS,
  INSERT_GROUP,
  INSERT_MENU_ITEMS,
  LINE_HEIGHT_OPTIONS,
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
import EmojiPanel from './EmojiPanel.vue'
import TablePicker from './TablePicker.vue'
import ToolbarPopover from './ToolbarPopover.vue'
import { insertRichContent, richSlashContent, type RichSlashAction } from '../core/slashInsert'
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
  | 'textStyles' | 'align' | 'lineHeight' | 'insert' | 'emoji' | 'table'

const toolbarRoot = ref<HTMLElement | null>(null)
const revision = ref(0)
const openPanel = ref<Panel>('')
const linkText = ref('')
const linkValue = ref('')
/** Captured while the format painter is armed; cleared after it is applied. */
const painter = ref<FormatSnapshot | null>(null)
let boundEditor: Editor | null = null

/** Anchor elements for the dropdown panels, each hangs from its own button. */
const insertButton = ref<HTMLElement | null>(null)
const blockButton = ref<HTMLElement | null>(null)
const sizeButton = ref<HTMLElement | null>(null)
const textStyleButton = ref<HTMLElement | null>(null)
const colorButton = ref<HTMLElement | null>(null)
const highlightButton = ref<HTMLElement | null>(null)
const alignButton = ref<HTMLElement | null>(null)
const lineHeightButton = ref<HTMLElement | null>(null)
const moreButton = ref<HTMLElement | null>(null)

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
/** Line height applied to the caret block; `null` follows the app setting. */
const activeLineHeight = computed(() => {
  revision.value
  return props.editor ? currentBlockLineHeight(props.editor) : null
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

/**
 * Panels render in a fixed layer, so "inside the toolbar" is no longer enough:
 * clicks in the floating menu must not count as outside clicks either.
 */
function handleDocumentPointerDown(event: PointerEvent): void {
  const target = event.target as Node | null
  if (!target || !openPanel.value) return
  if (toolbarRoot.value?.contains(target)) return
  // Icons are SVG elements, so this has to test Element, not HTMLElement:
  // pressing an icon inside a panel must not count as an outside click.
  if (target instanceof Element && target.closest('.toolbar-popover')) return
  openPanel.value = ''
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
      // Size first, then insert: the grid replaces the menu the same way the
      // emoji picker does, so the choice happens where the button was pressed.
      openPanel.value = 'table'
      return
    case 'math':
    case 'diagram':
    case 'callout':
    case 'toggle':
    case 'columns':
      insertRichBlock(item.key)
      return
    case 'emoji':
      // The picker is its own panel; it replaces the insert menu rather than
      // inserting anything by itself.
      openPanel.value = 'emoji'
      return
    case 'align':
      togglePanel('align')
      return
    case 'outline':
      ui.toggleOutline()
      return
    default:
      if (item.command) runEditorCommand(editor, item.command)
  }
  openPanel.value = ''
  revision.value += 1
}

/** Rich blocks the "+" menu inserts directly, no picker involved. */
function insertRichBlock(key: RichSlashAction): void {
  const editor = props.editor
  if (!editor) return
  insertRichContent(editor, richSlashContent(key, 'mermaid'))
  openPanel.value = ''
  revision.value += 1
}

/** Picked emoji are plain text, so they land at the caret like typed keys. */
function insertEmoji(char: string): void {
  if (!props.editor) return
  props.editor.chain().focus().insertContent(char).run()
  revision.value += 1
}

function selectBlock(command: EditorCommand): void {  if (!props.editor) return
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

function selectLineHeight(value: string | null): void {
  if (!props.editor) return
  setEditorLineHeight(props.editor, value)
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

/** Link panel hangs from whichever button opened it, the T menu or "more". */
const linkAnchor = computed(() => (
  openPanel.value === 'link' ? textStyleButton.value ?? moreButton.value : null
))
</script>

<template>
  <div ref="toolbarRoot" class="editor-toolbar" role="toolbar" :aria-label="t('editor.toolbar.aria')">
    <!-- 1 · insert -->
    <div class="toolbar-group">
      <button ref="insertButton" type="button" class="toolbar-button insert-button" data-testid="editor-insert" :class="{ active: openPanel === 'insert' }" :title="t('editor.insert')" :aria-label="t('editor.insert')" :aria-expanded="openPanel === 'insert'" @mousedown.prevent @click="togglePanel('insert')">
        <span class="insert-mark"><AppIcon name="plus" :size="16" /></span>
      </button>
      <ToolbarPopover v-if="openPanel === 'insert'" :anchor="insertButton" class="insert-menu" role="menu" :aria-label="t('editor.insert')">
        <button v-for="item in INSERT_MENU_ITEMS" :key="`insert-${item.key}`" type="button" role="menuitem" @mousedown.prevent @click="runItem(item)">
          <AppIcon :name="item.icon" :size="17" />
          <span>{{ t(item.labelKey) }}</span>
        </button>
      </ToolbarPopover>
    </div>

    <!-- 2 · history and format tools -->
    <div class="toolbar-group">
      <button type="button" class="toolbar-button" :title="t('editor.toolbar.undo') + '  Ctrl+Z'" :aria-label="t('editor.toolbar.undo')" :disabled="!canUndo" @mousedown.prevent @click="props.editor && runEditorCommand(props.editor, 'undo')">
        <AppIcon name="undo" :size="19" />
      </button>
      <button type="button" class="toolbar-button" :title="t('editor.toolbar.redo') + '  Ctrl+Shift+Z'" :aria-label="t('editor.toolbar.redo')" :disabled="!canRedo" @mousedown.prevent @click="props.editor && runEditorCommand(props.editor, 'redo')">
        <AppIcon name="redo" :size="19" />
      </button>
      <button type="button" class="toolbar-button" :class="{ active: painter }" data-testid="editor-painter" :title="t('editor.toolbar.formatPainter')" :aria-label="t('editor.toolbar.formatPainter')" :aria-pressed="Boolean(painter)" @mousedown.prevent @click="togglePainter">
        <AppIcon name="painter" :size="19" />
      </button>
      <button type="button" class="toolbar-button" :title="t('editor.clearFormatting')" :aria-label="t('editor.clearFormatting')" @mousedown.prevent @click="props.editor && runEditorCommand(props.editor, 'clearFormatting')">
        <AppIcon name="eraser" :size="19" />
      </button>
    </div>

    <!-- 3 · block style, size, text marks -->
    <div class="toolbar-group toolbar-group-wide">
      <button ref="blockButton" class="block-label" type="button" :class="{ active: openPanel === 'block' }" :aria-expanded="openPanel === 'block'" :title="t('editor.toolbar.paragraphStyle')" @mousedown.prevent @click="togglePanel('block')">
        <span class="block-label-text">{{ activeBlockLabel }}</span>
        <AppIcon name="chevronDown" :size="13" />
      </button>
      <ToolbarPopover v-if="openPanel === 'block'" :anchor="blockButton" class="block-menu" role="menu">
        <button v-for="option in blockOptions" :key="option.command" type="button" role="menuitem" :class="{ active: activeBlockLabel === t(option.labelKey) }" @mousedown.prevent @click="selectBlock(option.command)">
          <span>{{ t(option.labelKey) }}</span>
          <AppIcon v-if="activeBlockLabel === t(option.labelKey)" name="check" :size="16" />
        </button>
      </ToolbarPopover>

      <button ref="sizeButton" class="size-label" type="button" :class="{ active: openPanel === 'size' }" :aria-expanded="openPanel === 'size'" :title="t('editor.fontSize')" @mousedown.prevent @click="togglePanel('size')">
        {{ parseInt(activeFontSize, 10) }}px <AppIcon name="chevronDown" :size="12" />
      </button>
      <ToolbarPopover v-if="openPanel === 'size'" :anchor="sizeButton" class="size-menu" role="menu" :aria-label="t('editor.fontSize')">
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
      </ToolbarPopover>

      <button v-for="item in TEXT_GROUP" :key="item.key" type="button" class="toolbar-button" :class="{ active: isItemActive(item) }" :disabled="isItemDisabled(item)" :title="tooltip(item)" :aria-label="t(item.labelKey)" @mousedown.prevent @click="runItem(item)">
        <AppIcon :name="item.icon" :size="19" />
      </button>

      <button ref="textStyleButton" type="button" class="toolbar-button" data-testid="editor-text-styles" :class="{ active: openPanel === 'textStyles' }" :title="t('editor.moreText')" :aria-label="t('editor.moreText')" :aria-expanded="openPanel === 'textStyles'" @mousedown.prevent @click="togglePanel('textStyles')">
        <span class="text-style-mark">T<AppIcon name="chevronDown" :size="10" /></span>
      </button>
      <ToolbarPopover v-if="openPanel === 'textStyles'" :anchor="textStyleButton" class="more-menu" role="menu">
        <button v-for="item in TEXT_STYLE_MENU" :key="item.key" type="button" role="menuitem" :class="{ active: isItemActive(item) }" @mousedown.prevent @click="runItem(item)">
          <AppIcon :name="item.icon" :size="17" />
          <span>{{ t(item.labelKey) }}</span>
          <kbd v-if="item.shortcut">{{ item.shortcut }}</kbd>
        </button>
      </ToolbarPopover>
    </div>

    <!-- 4 · colour and highlight -->
    <div class="toolbar-group">
      <button ref="colorButton" type="button" class="toolbar-button color-button" :class="{ active: openPanel === 'color' }" :title="t('editor.toolbar.color')" :aria-label="t('editor.toolbar.color')" :aria-expanded="openPanel === 'color'" @mousedown.prevent @click="togglePanel('color')">
        <span class="color-mark" :style="activeTextColor ? { borderBottomColor: activeTextColor } : undefined">A</span><AppIcon name="chevronDown" :size="10" />
      </button>
      <button ref="highlightButton" type="button" class="toolbar-button color-button" :class="{ active: openPanel === 'highlight' }" :title="t('editor.toolbar.highlight')" :aria-label="t('editor.toolbar.highlight')" :aria-expanded="openPanel === 'highlight'" @mousedown.prevent @click="togglePanel('highlight')">
        <span class="highlight-mark" :style="activeHighlight ? { borderBottomColor: activeHighlight } : undefined"><AppIcon name="paint" :size="17" /></span><AppIcon name="chevronDown" :size="10" />
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
          <AppIcon :name="currentAlign.icon" :size="19" />
        </button>
        <button ref="alignButton" type="button" class="split-caret" :class="{ active: openPanel === 'align' }" :aria-expanded="openPanel === 'align'" :aria-label="t('editor.toolbar.alignMore')" @mousedown.prevent @click="togglePanel('align')">
          <AppIcon name="chevronDown" :size="12" />
        </button>
      </div>
      <ToolbarPopover v-if="openPanel === 'align'" :anchor="alignButton" class="split-menu" role="menu" :aria-label="t('editor.toolbar.alignMore')">
        <button v-for="item in ALIGN_ITEMS" :key="item.key" type="button" role="menuitem" :class="{ active: currentAlign.key === item.key }" @mousedown.prevent @click="runItem(item)">
          <AppIcon :name="item.icon" :size="17" />
          <span>{{ t(item.labelKey) }}</span>
        </button>
      </ToolbarPopover>

      <button type="button" class="toolbar-button" :class="{ active: isItemActive(LIST_ITEMS[0]!) }" :title="t('editor.bulletList')" :aria-label="t('editor.bulletList')" @mousedown.prevent @click="runItem(LIST_ITEMS[0]!)">
        <AppIcon name="list" :size="19" />
      </button>

      <button type="button" class="toolbar-button" :class="{ active: isItemActive(LIST_ITEMS[1]!) }" :title="t('editor.orderedList')" :aria-label="t('editor.orderedList')" @mousedown.prevent @click="runItem(LIST_ITEMS[1]!)">
        <AppIcon name="orderedList" :size="19" />
      </button>

      <!-- The bar's own checklist entry; the slash menu offers the same command. -->
      <button type="button" class="toolbar-button" :class="{ active: isItemActive(LIST_ITEMS[2]!) }" :title="t('editor.taskList')" :aria-label="t('editor.taskList')" @mousedown.prevent @click="runItem(LIST_ITEMS[2]!)">
        <AppIcon name="checkSquare" :size="19" />
      </button>

      <button type="button" class="toolbar-button" :title="tooltip(INDENT_ITEMS[0]!)" :aria-label="t('editor.indent')" @mousedown.prevent @click="runItem(INDENT_ITEMS[0]!)">
        <AppIcon name="indentIncrease" :size="19" />
      </button>
      <button type="button" class="toolbar-button" :title="tooltip(INDENT_ITEMS[1]!)" :aria-label="t('editor.outdent')" @mousedown.prevent @click="runItem(INDENT_ITEMS[1]!)">
        <AppIcon name="indentDecrease" :size="19" />
      </button>

      <button ref="lineHeightButton" class="line-height-label" type="button" :class="{ active: openPanel === 'lineHeight' }" :aria-expanded="openPanel === 'lineHeight'" :title="t('editor.lineHeight')" @mousedown.prevent @click="togglePanel('lineHeight')">
        <span>{{ t('editor.lineHeight.short') }}</span>
        <span class="line-height-value">{{ activeLineHeight ?? t('editor.lineHeight.auto') }}</span>
        <AppIcon name="chevronDown" :size="11" />
      </button>
      <ToolbarPopover v-if="openPanel === 'lineHeight'" :anchor="lineHeightButton" align="end" class="size-menu" role="menu" :aria-label="t('editor.lineHeight')">
        <button type="button" role="menuitem" :class="{ active: activeLineHeight === null }" @mousedown.prevent @click="selectLineHeight(null)">
          <span>{{ t('editor.lineHeight.followSettings') }}</span>
          <span class="size-hint">{{ ui.lineHeight.toFixed(2) }}</span>
        </button>
        <button
          v-for="value in LINE_HEIGHT_OPTIONS"
          :key="value"
          type="button"
          role="menuitem"
          :class="{ active: activeLineHeight === value }"
          @mousedown.prevent
          @click="selectLineHeight(value)"
        >
          <span>{{ value }}</span>
          <AppIcon v-if="activeLineHeight === value" name="check" :size="15" />
        </button>
      </ToolbarPopover>
    </div>

    <!-- 6 · block inserts -->
    <div class="toolbar-group toolbar-group-insert">
      <button v-for="item in INSERT_GROUP" :key="item.key" type="button" class="toolbar-button" :class="{ active: isItemActive(item) }" :title="t(item.labelKey)" :aria-label="t(item.labelKey)" @mousedown.prevent @click="runItem(item)">
        <AppIcon :name="item.icon" :size="19" />
      </button>
    </div>

    <span class="toolbar-spacer" />

    <!-- 7 · media, outline, overflow -->
    <div class="toolbar-group">
      <button v-for="item in VIEW_GROUP" :key="item.key" type="button" class="toolbar-button" :class="{ active: isItemActive(item) }" :title="t(item.labelKey)" :aria-label="t(item.labelKey)" @mousedown.prevent @click="runItem(item)">
        <AppIcon :name="item.icon" :size="19" />
      </button>
      <button type="button" class="toolbar-button" :class="{ active: ui.contentWidth === 'wide' }" :title="ui.contentWidth === 'wide' ? t('status.widthComfortable') : t('status.widthWide')" :aria-label="t('status.widthWide')" @mousedown.prevent @click="ui.toggleContentWidth()">
        <AppIcon name="widthFull" :size="19" />
      </button>
      <button ref="moreButton" type="button" class="toolbar-button" :class="{ active: openPanel === 'more' }" :title="t('editor.toolbar.moreFormat')" :aria-label="t('editor.toolbar.moreFormat')" :aria-expanded="openPanel === 'more'" @mousedown.prevent @click="togglePanel('more')">
        <AppIcon name="more" :size="19" />
      </button>
      <ToolbarPopover v-if="openPanel === 'more'" :anchor="moreButton" align="end" class="more-menu" role="menu">
        <button v-for="item in MORE_TOOLBAR_ITEMS" :key="item.key" type="button" role="menuitem" :class="{ active: isItemActive(item) }" :disabled="isItemDisabled(item)" @mousedown.prevent @click="runItem(item)">
          <AppIcon :name="item.icon" :size="17" />
          <span>{{ t(item.labelKey) }}</span>
          <kbd v-if="item.shortcut">{{ item.shortcut }}</kbd>
        </button>
        <div class="more-separator" />
        <button v-for="item in foldItems" :key="item.key" type="button" role="menuitem" @mousedown.prevent @click="runFold(item.key)">
          <AppIcon :name="item.icon" :size="17" />
          <span>{{ item.label }}</span>
          <kbd>{{ item.shortcut }}</kbd>
        </button>
      </ToolbarPopover>
    </div>

    <ToolbarPopover v-if="openPanel === 'link'" :anchor="linkAnchor" role="dialog" bare :aria-label="t('editor.link')">
      <LinkForm :text="linkText" :href="linkValue" @submit="applyLink" @cancel="openPanel = ''" />
    </ToolbarPopover>

    <EmojiPanel v-if="openPanel === 'emoji'" :anchor="insertButton" @pick="insertEmoji" @close="openPanel = ''" />
    <TablePicker v-if="openPanel === 'table'" :anchor="insertButton" :editor="props.editor" @close="openPanel = ''" />
  </div>
</template>

<style scoped>
/* The bar is a row of boxed groups, the way Yuque lays it out: no width-based
   folding, so every common action keeps its own always-visible slot.
   It scrolls horizontally, so every dropdown renders in ToolbarPopover's fixed
   layer instead of nesting here — a descendant panel would be clipped.
   The z-index sits above the editor's floating layers (selection bubble 85,
   slash menu 90, colour panel 95): those hover next to the caret, and when the
   caret was near the top of the page they covered the bar and swallowed its
   clicks — the "+" menu looked fine but could not be pressed. */
.editor-toolbar { position: relative; z-index: 100; display: flex; width: 100%; height: var(--toolbar-height); flex: 0 0 auto; align-items: center; gap: 6px; padding: 0 10px; border-bottom: 1px solid var(--divider-soft); background: var(--panel-strong); overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
.editor-toolbar::-webkit-scrollbar { display: none; }
.toolbar-group { display: flex; flex: 0 0 auto; align-items: center; gap: 2px; padding: 3px 4px; border: 1px solid var(--border-soft); border-radius: 10px; background: var(--panel-strong); }
.toolbar-group-wide { gap: 3px; }
.toolbar-spacer { min-width: 4px; flex: 1; }

.block-label, .size-label, .line-height-label, .toolbar-button { display: inline-flex; height: 32px; align-items: center; justify-content: center; border: 0; border-radius: 7px; background: transparent; color: var(--text-secondary); cursor: pointer; }
.block-label { max-width: 92px; gap: 3px; padding: 0 7px; font-size: 12px; font-weight: 650; }
.block-label-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.size-label { min-width: 50px; gap: 2px; padding: 0 5px; font-size: 12px; font-variant-numeric: tabular-nums; }
/* Two-part label: the word stays put, the number swaps between "自动" and a value. */
.line-height-label { gap: 4px; padding: 0 7px; font-size: 11.5px; }
.line-height-value { min-width: 22px; color: var(--text-primary); font-variant-numeric: tabular-nums; text-align: center; }
.toolbar-button { width: 30px; flex: 0 0 30px; }
.insert-button { width: 32px; }
.insert-mark { display: grid; width: 22px; height: 22px; place-items: center; border-radius: 50%; background: var(--state-success-fg); color: #fff; }
.block-label:hover, .block-label.active, .size-label:hover, .size-label.active, .toolbar-button:hover:not(:disabled), .toolbar-button.active { background: var(--panel-muted); color: var(--accent-strong); }
.toolbar-button.active, .split-caret.active { background: var(--accent-soft); color: var(--accent-strong); }
.toolbar-button:disabled, .more-menu button:disabled { color: var(--text-tertiary); cursor: default; opacity: 0.55; }

/* Panel surfaces: colour and placement come from ToolbarPopover. */
.block-menu { width: 160px; padding: 5px; }
.insert-menu { width: 190px; padding: 5px; }
.insert-menu button, .block-menu button, .more-menu button, .split-menu button { display: flex; width: 100%; height: 34px; align-items: center; gap: 9px; padding: 0 10px; border: 0; border-radius: 7px; background: transparent; color: var(--text-primary); cursor: pointer; font: inherit; font-size: 12px; text-align: left; }
.insert-menu button:hover, .block-menu button:hover, .more-menu button:hover:not(:disabled), .split-menu button:hover, .block-menu button.active, .more-menu button.active, .split-menu button.active { background: var(--accent-faint); color: var(--accent-strong); }
.block-menu button span:first-child, .insert-menu button span, .more-menu button span, .split-menu button span { flex: 1; }
.size-menu { display: flex; width: 156px; flex-direction: column; gap: 1px; padding: 5px; }
.size-menu button { display: flex; height: 32px; align-items: center; justify-content: space-between; padding: 0 10px; border: 0; border-radius: 7px; background: transparent; color: var(--text-primary); cursor: pointer; }
.size-menu button:hover, .size-menu button.active { background: var(--accent-faint); color: var(--accent-strong); }
.size-hint { color: var(--text-tertiary); font-size: 10px; }
.more-menu { width: 220px; max-height: min(420px, calc(100vh - 180px)); padding: 5px; overflow-y: auto; }
.more-menu kbd, .split-menu button kbd { color: var(--text-tertiary); font: inherit; font-size: 10px; }
.more-separator { height: 1px; margin: 4px 6px; background: var(--divider-soft); }
.text-style-mark { display: inline-flex; align-items: center; gap: 1px; font-size: 15px; font-weight: 700; }
.color-button { gap: 1px; }
.color-mark { font-size: 15px; font-weight: 700; border-bottom: 2px solid var(--state-danger-fg); line-height: 1.05; }
.highlight-mark { display: inline-flex; padding-bottom: 1px; border-bottom: 2px solid var(--state-warning-fg); }

/* Split buttons: face + caret, the shape the mock uses for lists. */
.split-button { display: flex; align-items: center; border-radius: 7px; }
.split-button:hover { background: var(--panel-muted); }
.split-face { border-radius: 7px 0 0 7px; }
.split-caret { display: inline-flex; width: 16px; height: 32px; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 0 7px 7px 0; background: transparent; color: var(--text-tertiary); cursor: pointer; }
.split-caret:hover { color: var(--accent-strong); }
.split-menu { width: 170px; padding: 5px; }

/* Narrow windows keep every tool on the bar by shaving a pixel or two off the
   buttons rather than hiding anything behind an overflow caret. The insert
   group is the one exception: its four commands are already in the "+" menu at
   the far left, so it is the only safe thing to drop when space runs out. */
@media (max-width: 1200px) {
  .editor-toolbar { gap: 5px; padding: 0 8px; }
  .toolbar-group { gap: 1px; padding: 3px; }
  .toolbar-button { width: 28px; flex-basis: 28px; }
  .block-label { padding: 0 5px; }
  .size-label { min-width: 46px; }
}

@media (max-width: 1120px) {
  .toolbar-group-insert { display: none; }
}

@media (max-width: 1000px) {
  .editor-toolbar { gap: 4px; padding: 0 6px; }
  .toolbar-group { gap: 1px; padding: 2px; }
  .toolbar-button { width: 27px; flex-basis: 27px; }
  .block-label { max-width: 70px; padding: 0 4px; }
  .size-label { min-width: 42px; padding: 0 3px; }
  .line-height-label { gap: 3px; padding: 0 5px; }
}
</style>
