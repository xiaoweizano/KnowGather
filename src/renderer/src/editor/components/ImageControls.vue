<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Editor } from '@tiptap/core'
import { computePosition, flip, offset, shift } from '@floating-ui/dom'
import AppIcon from '../../components/AppIcon.vue'
import { normalizeImageAlign, normalizeImageWidth } from '../extensions/image'

const props = defineProps<{ editor: Editor }>()
const controls = ref<HTMLElement | null>(null)
const revision = ref(0)
let boundEditor: Editor | null = null

const visible = computed(() => {
  revision.value
  return props.editor.isEditable && props.editor.isActive('image')
})
const attrs = computed(() => {
  revision.value
  return props.editor.getAttributes('image') as Record<string, unknown>
})
const altText = ref('')
const width = computed(() => normalizeImageWidth(attrs.value.width))
const align = computed(() => normalizeImageAlign(attrs.value.align))

watch(visible, (show) => {
  if (show) {
    altText.value = String(attrs.value.alt ?? '')
    void nextTick(positionControls)
  }
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
  const { from, to } = props.editor.state.selection
  const start = props.editor.view.coordsAtPos(from)
  const end = props.editor.view.coordsAtPos(to)
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
    placement: 'top-start',
    strategy: 'fixed',
    middleware: [offset(10), flip({ padding: 8 }), shift({ padding: 8 })],
  })
  controls.value.style.position = strategy
  controls.value.style.left = `${x}px`
  controls.value.style.top = `${y}px`
}

function setWidth(next: string): void {
  props.editor.chain().updateAttributes('image', { width: normalizeImageWidth(next) }).run()
}

function setAlign(next: string): void {
  props.editor.chain().updateAttributes('image', { align: normalizeImageAlign(next) }).run()
}

function commitAlt(): void {
  props.editor.chain().updateAttributes('image', { alt: altText.value.trim() }).run()
}

function removeImage(): void {
  props.editor.chain().focus().deleteSelection().run()
}
</script>

<template>
  <div v-if="visible" ref="controls" class="image-controls" role="toolbar" aria-label="图片设置">
    <div class="align-group">
      <button v-for="option in ['left', 'center', 'right']" :key="option" type="button" :class="{ active: align === option }" :title="option === 'left' ? '左对齐' : option === 'center' ? '居中' : '右对齐'" @mousedown.prevent @click="setAlign(option)">
        <AppIcon :name="option === 'left' ? 'alignLeft' : option === 'center' ? 'alignCenter' : 'alignRight'" :size="15" />
      </button>
    </div>
    <span class="control-divider" />
    <select :value="width" title="图片宽度" @change="setWidth(($event.target as HTMLSelectElement).value)">
      <option value="25">25%</option>
      <option value="50">50%</option>
      <option value="75">75%</option>
      <option value="100">100%</option>
    </select>
    <span class="control-divider" />
    <input v-model="altText" type="text" aria-label="图片替代文本" placeholder="替代文本" @keydown.enter.prevent="commitAlt" @blur="commitAlt" />
    <button type="button" class="danger" title="删除图片" aria-label="删除图片" @mousedown.prevent @click="removeImage">
      <AppIcon name="trash" :size="15" />
    </button>
  </div>
</template>

<style scoped>
.image-controls {
  position: fixed;
  z-index: 86;
  display: flex;
  height: 38px;
  align-items: center;
  gap: 3px;
  padding: 4px;
  border: 1px solid var(--border-soft);
  border-radius: 9px;
  background: var(--panel-strong);
  box-shadow: var(--shadow-float);
}

.align-group {
  display: flex;
}

button {
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

button:hover,
button.active {
  background: var(--accent-faint);
  color: var(--accent-strong);
}

.control-divider {
  width: 1px;
  height: 20px;
  background: var(--border-soft);
}

select,
input {
  height: 28px;
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  background: var(--panel-muted);
  color: var(--text-primary);
  font-size: 9.5px;
}

select {
  width: 64px;
  padding: 0 5px;
}

input {
  width: 104px;
  padding: 0 7px;
}

button.danger {
  color: var(--danger);
}
</style>
