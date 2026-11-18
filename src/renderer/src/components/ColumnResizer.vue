<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from '../i18n/useI18n'

const props = defineProps<{
  /** Current width in pixels of the panel to the left of this handle. */
  value: number
  min: number
  max: number
  label: string
  /**
   * Which way the panel grows. Uses a string rather than a boolean because Vue
   * coerces an absent Boolean prop to `false`, which silently inverted the drag
   * direction for every handle that did not pass it.
   */
  grow?: 'left' | 'right'
}>()

const emit = defineEmits<{ resize: [value: number]; reset: [] }>()
const { t } = useI18n()

const dragging = ref(false)
let startX = 0
let startValue = 0

const growRight = computed(() => props.grow !== 'left')

function handlePointerDown(event: PointerEvent): void {
  if (event.button !== 0) return
  dragging.value = true
  startX = event.clientX
  startValue = props.value
  // Register the drag listeners before anything that can throw, so a failed
  // pointer capture can never leave the handle stuck in a half-started drag.
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerUp)
  window.addEventListener('pointercancel', handlePointerUp)
  // Pointer capture keeps drag events flowing even when the cursor leaves the
  // 6px handle. It throws for synthetic or already-released pointers, in which
  // case the window-level listeners above still drive the drag.
  try {
    element.value?.setPointerCapture(event.pointerId)
  } catch {
    // Ignore: capture is an optimisation, not a requirement.
  }
}

function handlePointerMove(event: PointerEvent): void {
  if (!dragging.value) return
  const delta = (event.clientX - startX) * (growRight.value ? 1 : -1)
  emit('resize', clamp(startValue + delta))
}

function handlePointerUp(): void {
  dragging.value = false
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', handlePointerUp)
  window.removeEventListener('pointercancel', handlePointerUp)
}

function handleKeydown(event: KeyboardEvent): void {
  const step = event.shiftKey ? 24 : 8
  const grow = growRight.value ? 1 : -1
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    emit('resize', clamp(props.value - step * grow))
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    emit('resize', clamp(props.value + step * grow))
  } else if (event.key === 'Home') {
    event.preventDefault()
    emit('reset')
  }
}

function clamp(value: number): number {
  return Math.round(Math.min(props.max, Math.max(props.min, value)))
}

const element = ref<HTMLElement | null>(null)

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', handlePointerUp)
  window.removeEventListener('pointercancel', handlePointerUp)
})
</script>

<template>
  <div
    ref="element"
    class="column-resizer"
    :class="{ dragging }"
    role="separator"
    aria-orientation="vertical"
    :aria-label="label"
    :aria-valuenow="value"
    :aria-valuemin="min"
    :aria-valuemax="max"
    tabindex="0"
    :title="t('a11y.resizeHint', { label })"
    @pointerdown="handlePointerDown"
    @keydown="handleKeydown"
    @dblclick="emit('reset')"
  >
    <span class="resizer-grip" />
  </div>
</template>

<style scoped>
.column-resizer {
  position: relative;
  z-index: 6;
  width: 6px;
  flex: 0 0 6px;
  margin: 0 -3px;
  cursor: col-resize;
  touch-action: none;
  background: transparent;
}

.column-resizer::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 2px;
  width: 2px;
  background: transparent;
  content: "";
  transition: background 140ms ease;
}

.column-resizer:hover::before,
.column-resizer.dragging::before,
.column-resizer:focus-visible::before {
  background: color-mix(in srgb, var(--accent) 55%, transparent);
}

.resizer-grip {
  position: absolute;
  top: 50%;
  left: 1px;
  width: 4px;
  height: 28px;
  border-radius: 2px;
  background: var(--border-strong);
  opacity: 0;
  transform: translateY(-50%);
  transition: opacity 140ms ease;
}

.column-resizer:hover .resizer-grip,
.column-resizer.dragging .resizer-grip {
  opacity: 0.85;
}

.column-resizer:focus-visible {
  outline: none;
}
</style>
