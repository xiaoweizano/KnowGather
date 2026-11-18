<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { useI18n } from '../i18n/useI18n'
import type { ContextMenuItem } from '../app/knowledgeContextMenu'

const props = defineProps<{
  open: boolean
  x: number
  y: number
  items: readonly ContextMenuItem[]
  /** Labels for dynamic items (category names), keyed by item id. */
  dynamicLabels?: Record<string, string>
}>()

const emit = defineEmits<{
  select: [item: ContextMenuItem]
  close: []
}>()

const { t } = useI18n()
const root = ref<HTMLElement | null>(null)
const activeIndex = ref(-1)
const submenuOpen = ref<string | null>(null)
const position = ref({ top: 0, left: 0 })
const submenuPosition = ref({ top: 0, left: 0 })

const visibleItems = computed(() => props.items)

const menuStyle = computed(() => ({ top: `${position.value.top}px`, left: `${position.value.left}px` }))
const submenuStyle = computed(() => ({ top: `${submenuPosition.value.top}px`, left: `${submenuPosition.value.left}px` }))

function labelFor(item: ContextMenuItem): string {
  if (item.dynamicLabel) return item.dynamicLabel
  if (item.labelKey) return t(item.labelKey)
  return props.dynamicLabels?.[item.id] ?? item.id
}

watch(() => props.open, async (open) => {
  if (!open) return
  activeIndex.value = -1
  submenuOpen.value = null
  await nextTick()
  place()
})

onMounted(() => {
  document.addEventListener('pointerdown', handlePointerDown, true)
  document.addEventListener('keydown', handleKeydown, true)
  window.addEventListener('resize', place)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handlePointerDown, true)
  document.removeEventListener('keydown', handleKeydown, true)
  window.removeEventListener('resize', place)
})

/** Flip the menu back inside the viewport, the same rule the editor overlays use. */
function place(): void {
  const element = root.value
  if (!element) return
  const rect = element.getBoundingClientRect()
  const margin = 8
  const left = Math.max(margin, Math.min(props.x, window.innerWidth - rect.width - margin))
  const top = Math.max(margin, Math.min(props.y, window.innerHeight - rect.height - margin))
  position.value = { top, left }
}

function openSubmenu(item: ContextMenuItem, event: MouseEvent): void {
  if (!item.children?.length) {
    submenuOpen.value = null
    return
  }
  submenuOpen.value = item.id
  const target = event.currentTarget as HTMLElement | null
  const rect = target?.getBoundingClientRect()
  if (!rect) return
  const margin = 8
  const left = Math.min(rect.right + 2, window.innerWidth - 180 - margin)
  const top = Math.min(rect.top, window.innerHeight - 220 - margin)
  submenuPosition.value = { top: Math.max(margin, top), left: Math.max(margin, left) }
}

function choose(item: ContextMenuItem): void {
  if (item.disabled) return
  if (item.children?.length) return
  emit('select', item)
  emit('close')
}

function handlePointerDown(event: PointerEvent): void {
  if (!props.open) return
  const target = event.target as Node | null
  if (root.value && target && root.value.contains(target)) return
  // Clicks inside the submenu are still part of the menu.
  if (target instanceof Element && target.closest('.context-submenu')) return
  emit('close')
}

function handleKeydown(event: KeyboardEvent): void {
  if (!props.open) return
  if (event.key === 'Escape') {
    event.preventDefault()
    if (submenuOpen.value) submenuOpen.value = null
    else emit('close')
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const delta = event.key === 'ArrowDown' ? 1 : -1
    const count = visibleItems.value.length
    if (!count) return
    activeIndex.value = (activeIndex.value + delta + count) % count
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    const item = visibleItems.value[activeIndex.value]
    if (!item) return
    event.preventDefault()
    choose(item)
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="pop">
      <div
        v-if="props.open"
        ref="root"
        class="context-menu"
        :style="menuStyle"
        role="menu"
        @contextmenu.prevent
      >
        <template v-for="(item, index) in visibleItems" :key="item.id">
          <div v-if="item.separatorBefore" class="context-separator" />
          <button
            type="button"
            role="menuitem"
            class="context-item"
            :class="{ danger: item.danger, active: activeIndex === index, disabled: item.disabled }"
            :disabled="item.disabled"
            @mouseenter="activeIndex = index; submenuOpen = item.children ? item.id : null"
            @click="choose(item)"
            @mouseover="openSubmenu(item, $event)"
          >
            <AppIcon :name="item.icon" :size="14" />
            <span class="context-label">{{ labelFor(item) }}</span>
            <AppIcon v-if="item.children" name="chevronRight" :size="12" class="context-chevron" />
          </button>
        </template>
      </div>
    </Transition>

    <Transition name="pop">
      <div
        v-if="props.open && submenuOpen"
        class="context-menu context-submenu"
        :style="submenuStyle"
        role="menu"
        @contextmenu.prevent
      >
        <button
          v-for="child in visibleItems.find((item) => item.id === submenuOpen)?.children ?? []"
          :key="child.id"
          type="button"
          role="menuitem"
          class="context-item"
          :class="{ disabled: child.disabled }"
          :disabled="child.disabled"
          @click="choose(child)"
        >
          <AppIcon :name="child.icon" :size="14" />
          <span class="context-label">{{ labelFor(child) }}</span>
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 200;
  display: flex;
  min-width: 180px;
  flex-direction: column;
  padding: 5px;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: var(--panel-strong);
  box-shadow: var(--shadow-float);
  transform-origin: top left;
}

.context-submenu {
  min-width: 168px;
  max-height: 320px;
  overflow-y: auto;
}

.context-item {
  display: flex;
  width: 100%;
  height: 31px;
  align-items: center;
  gap: 8px;
  padding: 0 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font-size: 11.5px;
  text-align: left;
}

.context-item:hover:not(.disabled),
.context-item.active {
  background: var(--accent-faint);
  color: var(--accent-strong);
}

.context-item.danger {
  color: var(--danger);
}

.context-item.danger:hover:not(.disabled) {
  background: var(--state-danger-bg);
  color: var(--state-danger-fg);
}

.context-item.disabled {
  cursor: default;
  opacity: 0.45;
}

.context-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.context-chevron {
  color: var(--text-tertiary);
}

.context-separator {
  height: 1px;
  margin: 4px 6px;
  background: var(--divider-soft);
}
</style>
