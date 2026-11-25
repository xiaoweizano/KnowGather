<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Editor } from '@tiptap/core'
import { computePosition, flip, offset, shift } from '@floating-ui/dom'
import AppIcon from '../../components/AppIcon.vue'
import { getShizhiApi } from '../../services/api'
import {
  applyEditorLink,
  getActiveLinkRange,
  isEditorCommandActive,
  runEditorCommand,
  setEditorHighlight,
  setEditorTextColor,
  type EditorCommand,
} from '../core/editorCommands'
import { useI18n } from '../../i18n/useI18n'
import LinkForm from './LinkForm.vue'
import ColorPanel from './ColorPanel.vue'

const props = defineProps<{
  editor: Editor
  composing?: boolean
}>()
const { t } = useI18n()

const bubble = ref<HTMLElement | null>(null)
const revision = ref(0)
const panel = ref<'' | 'color' | 'highlight' | 'link'>('')
const linkText = ref('')
const linkHref = ref('')
const bubbleColorButton = ref<HTMLElement | null>(null)
const bubbleHighlightButton = ref<HTMLElement | null>(null)
/** True while "open link" waits for the system browser to take over. */
const openingLink = ref(false)
let boundEditor: Editor | null = null

const selectionEmpty = computed(() => {
  revision.value
  return props.editor.state.selection.empty
})
const activeTextColor = computed(() => {
  revision.value
  const value = props.editor.getAttributes('textStyle').color
  return typeof value === 'string' && value ? value : null
})
const activeHighlight = computed(() => {
  revision.value
  const value = props.editor.getAttributes('highlight').color
  return typeof value === 'string' && value ? value : null
})
const linkActive = computed(() => {
  revision.value
  return props.editor.isActive('link')
})
// Links get their own toolbar at the caret, which is otherwise a no-op for the
// formatting bubble. A link card replaces both while it is open.
const visible = computed(() => {
  revision.value
  if (!props.editor.isEditable || props.composing) return false
  return !selectionEmpty.value || linkActive.value
})

// Sub/superscript are mark-level, so they belong on the selection menu rather
// than only in the toolbar's "more" panel.
const markActions: ReadonlyArray<{ command: EditorCommand; labelKey: string; icon: string }> = [
  { command: 'bold', labelKey: 'editor.bold', icon: 'bold' },
  { command: 'italic', labelKey: 'editor.italic', icon: 'italic' },
  { command: 'underline', labelKey: 'editor.underline', icon: 'underline' },
  { command: 'strike', labelKey: 'editor.strike', icon: 'strike' },
  { command: 'code', labelKey: 'editor.code', icon: 'code' },
]

function handleEditorEvent(): void {
  revision.value += 1
  if (selectionEmpty.value && !linkActive.value) panel.value = ''
  else if (!props.editor.isActive('link') && panel.value === 'link') panel.value = ''
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
watch(panel, () => void nextTick(positionBubble))

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

/**
 * The bar owns the strip above the page: a bubble placed over it would sit
 * behind the toolbar (the bar stacks above floating editor layers so its
 * buttons stay clickable), so the flip boundary starts below the bar.
 */
function boundaryPadding(): { top: number; right: number; bottom: number; left: number } {
  const toolbar = document.querySelector('.editor-toolbar')
  const top = toolbar ? toolbar.getBoundingClientRect().bottom + 6 : 8
  return { top, right: 8, bottom: 8, left: 8 }
}

async function positionBubble(): Promise<void> {
  if (!visible.value || !bubble.value) return
  // Anchor to the whole link, not to a collapsed caret inside it.
  const range = linkActive.value ? getActiveLinkRange(props.editor) ?? props.editor.state.selection : props.editor.state.selection
  const start = props.editor.view.coordsAtPos(range.from)
  const end = props.editor.view.coordsAtPos(range.to)
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
  const below = linkActive.value || panel.value === 'link'
  const { x, y, strategy } = await computePosition(virtualElement, bubble.value, {
    placement: below ? 'bottom-start' : 'top-start',
    strategy: 'fixed',
    middleware: [offset(9), flip({ padding: boundaryPadding() }), shift({ padding: 8 })],
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
}

function openLinkPanel(): void {
  const range = getActiveLinkRange(props.editor) ?? props.editor.state.selection
  linkText.value = range.from === range.to ? '' : props.editor.state.doc.textBetween(range.from, range.to, ' ')
  linkHref.value = String(props.editor.getAttributes('link').href ?? '')
  panel.value = panel.value === 'link' ? '' : 'link'
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

function applyLink(text: string, href: string): void {
  applyEditorLink(props.editor, text, href)
  panel.value = ''
  revision.value += 1
}

function currentHref(): string {
  return String(props.editor.getAttributes('link').href ?? '')
}

async function openActiveLink(): Promise<void> {
  const href = currentHref()
  if (!href || openingLink.value) return
  // The IPC round trip plus the browser's cold start can take a second; show
  // the press landed right away so the button is not clicked twice.
  openingLink.value = true
  try {
    await getShizhiApi().app.openExternal(href)
  } catch {
    // A refused URL is reported by the main process; the editor stays usable.
  } finally {
    openingLink.value = false
  }
}

async function copyActiveLink(): Promise<void> {
  const href = currentHref()
  if (!href) return
  try {
    await navigator.clipboard.writeText(href)
  } catch {
    // Clipboard access can be denied; the link itself must not change.
  }
}

function removeActiveLink(): void {
  props.editor.chain().focus().extendMarkRange('link').unsetLink().run()
  panel.value = ''
  revision.value += 1
}

</script>

<template>
  <div
    v-if="visible"
    ref="bubble"
    class="bubble-menu"
    :class="{ 'bubble-menu--card': panel === 'link' }"
    role="toolbar"
    :aria-label="t('editor.bubble.aria')"
  >
    <LinkForm
      v-if="panel === 'link'"
      :text="linkText"
      :href="linkHref"
      @submit="applyLink"
      @cancel="panel = ''"
    />

    <template v-else-if="linkActive">
      <button type="button" :aria-label="t('editor.link.open')" :title="t('editor.link.open')" :disabled="openingLink" :class="{ 'is-pending': openingLink }" @mousedown.prevent @click="openActiveLink">
        <AppIcon name="external" :size="15" />
      </button>
      <button type="button" :aria-label="t('editor.link.edit')" :title="t('editor.link.edit')" @mousedown.prevent @click="openLinkPanel">
        <AppIcon name="edit" :size="15" />
      </button>
      <button type="button" :aria-label="t('editor.link.copy')" :title="t('editor.link.copy')" @mousedown.prevent @click="copyActiveLink">
        <AppIcon name="copy" :size="15" />
      </button>
      <button type="button" :aria-label="t('editor.link.remove')" :title="t('editor.link.remove')" @mousedown.prevent @click="removeActiveLink">
        <AppIcon name="unlink" :size="15" />
      </button>
    </template>

    <template v-else>
      <button
        v-for="action in markActions"
        :key="action.command"
        type="button"
        :class="{ active: isActive(action.command) }"
        :aria-label="t(action.labelKey)"
        :title="t(action.labelKey)"
        @mousedown.prevent
        @click="applyMark(action.command)"
      >
        <AppIcon :name="action.icon" :size="15" />
      </button>
      <span class="bubble-divider" />
      <button ref="bubbleColorButton" type="button" :aria-label="t('editor.toolbar.color')" :title="t('editor.toolbar.color')" :class="{ active: panel === 'color' }" @mousedown.prevent @click="togglePanel('color')">
        <AppIcon name="palette" :size="15" />
      </button>
      <button ref="bubbleHighlightButton" type="button" :aria-label="t('editor.toolbar.highlight')" :title="t('editor.toolbar.highlight')" :class="{ active: panel === 'highlight' }" @mousedown.prevent @click="togglePanel('highlight')">
        <span class="highlight-dot" />
      </button>
      <button type="button" :aria-label="t('editor.link')" :title="t('editor.link')" :class="{ active: linkActive }" @mousedown.prevent @click="openLinkPanel">
        <AppIcon name="link" :size="15" />
      </button>
      <ColorPanel
        v-if="panel === 'color' || panel === 'highlight'"
        :mode="panel === 'highlight' ? 'highlight' : 'color'"
        :anchor="panel === 'highlight' ? bubbleHighlightButton : bubbleColorButton"
        :current="panel === 'highlight' ? activeHighlight : activeTextColor"
        @pick="panel === 'highlight' ? applyHighlight($event) : applyColor($event)"
        @close="panel = ''"
      />
    </template>
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

/* The link card draws its own frame, so the toolbar chrome steps aside. */
.bubble-menu--card {
  height: auto;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
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

/* Waiting on the system browser: dim the button so the press visibly landed. */
.bubble-menu > button.is-pending {
  color: var(--accent-strong);
  opacity: 0.55;
  cursor: progress;
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

</style>