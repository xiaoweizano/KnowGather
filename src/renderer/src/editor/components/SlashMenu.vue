<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Editor } from '@tiptap/core'
import { computePosition, flip, offset, shift } from '@floating-ui/dom'
import AppIcon from '../../components/AppIcon.vue'
import {
  filterSlashMenuItems,
  moveMenuSelection,
  type SlashMenuItem,
  type SlashTrigger,
} from '../core/overlayModel'

const props = defineProps<{
  editor: Editor
  trigger: SlashTrigger
  suppressed?: boolean
}>()
const emit = defineEmits<{
  select: [item: SlashMenuItem]
  close: []
}>()

const menu = ref<HTMLElement | null>(null)
const selectedIndex = ref(0)
const items = computed(() => filterSlashMenuItems(props.trigger.query))

watch(items, () => {
  selectedIndex.value = 0
  void nextTick(positionMenu)
}, { flush: 'post' })

watch(() => props.trigger, () => void nextTick(positionMenu), { deep: true })
watch(() => props.suppressed, (suppressed) => {
  if (suppressed) emit('close')
})

onMounted(() => {
  document.addEventListener('keydown', handleKeydown, true)
  void nextTick(positionMenu)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown, true)
})

async function positionMenu(): Promise<void> {
  if (!menu.value) return
  const coords = props.editor.view.coordsAtPos(props.trigger.start)
  const virtualElement = {
    getBoundingClientRect: () => ({
      x: coords.left,
      y: coords.top,
      top: coords.top,
      right: coords.right,
      bottom: coords.bottom,
      left: coords.left,
      width: Math.max(1, coords.right - coords.left),
      height: Math.max(1, coords.bottom - coords.top),
    }),
    contextElement: props.editor.view.dom,
  }
  const { x, y, strategy } = await computePosition(virtualElement, menu.value, {
    placement: 'bottom-start',
    strategy: 'fixed',
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
  })
  menu.value.style.position = strategy
  menu.value.style.left = `${x}px`
  menu.value.style.top = `${y}px`
}

function handleKeydown(event: KeyboardEvent): void {
  if (!items.value.length || event.isComposing) return
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    selectedIndex.value = moveMenuSelection(
      selectedIndex.value,
      event.key === 'ArrowDown' ? 1 : -1,
      items.value.length,
    )
    void nextTick(() => menu.value?.querySelector<HTMLElement>('.is-selected')?.scrollIntoView({ block: 'nearest' }))
    return
  }
  if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault()
    const item = items.value[selectedIndex.value]
    if (item) emit('select', item)
  }
}

function selectItem(item: SlashMenuItem): void {
  emit('select', item)
}
</script>

<template>
  <div ref="menu" class="slash-menu" role="listbox" aria-label="插入内容">
    <div class="slash-heading">
      <span>插入内容</span>
      <kbd>↑↓ 选择 · Enter 插入</kbd>
    </div>
    <div v-if="items.length" class="slash-items">
      <button
        v-for="(item, index) in items"
        :key="item.key"
        type="button"
        role="option"
        :aria-selected="selectedIndex === index"
        :class="{ 'is-selected': selectedIndex === index }"
        @mousedown.prevent
        @mouseenter="selectedIndex = index"
        @click="selectItem(item)"
      >
        <span class="slash-icon"><AppIcon :name="item.icon" :size="17" /></span>
        <span class="slash-copy"><strong>{{ item.label }}</strong><small>{{ item.description }}</small></span>
      </button>
    </div>
    <div v-else class="slash-empty">没有匹配的内容</div>
  </div>
</template>

<style scoped>
.slash-menu {
  position: fixed;
  z-index: 90;
  width: 290px;
  padding: 6px;
  border: 1px solid var(--border-soft);
  border-radius: 12px;
  background: var(--panel-strong);
  box-shadow: var(--shadow-float);
}

.slash-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 8px 7px;
  color: var(--text-tertiary);
  font-size: 9px;
}

.slash-heading span {
  color: var(--text-secondary);
  font-weight: 700;
  letter-spacing: 0.04em;
}

.slash-heading kbd {
  font: inherit;
}

.slash-items {
  max-height: 310px;
  overflow-y: auto;
}

.slash-items button {
  display: flex;
  width: 100%;
  min-height: 43px;
  align-items: center;
  gap: 10px;
  padding: 5px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
}

.slash-items button:hover,
.slash-items button.is-selected {
  background: var(--accent-faint);
}

.slash-icon {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: var(--panel-muted);
  color: var(--accent-strong);
}

.slash-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.slash-copy strong {
  font-size: 11px;
  font-weight: 650;
}

.slash-copy small {
  overflow: hidden;
  color: var(--text-tertiary);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slash-empty {
  padding: 20px 10px;
  color: var(--text-tertiary);
  font-size: 10px;
  text-align: center;
}
</style>
