<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom'

/**
 * Menu panel hanging from a toolbar button.
 *
 * The toolbar scrolls horizontally (`overflow-x: auto`), which also clips on
 * the vertical axis, so an absolutely positioned child menu is cut off at the
 * bar's height and can never be clicked. A fixed-position panel escapes that
 * clip the same way the colour picker does, and the anchor is tracked so the
 * menu stays put while the bar scrolls.
 */
const props = withDefaults(defineProps<{
  /** Toolbar button the panel hangs from. */
  anchor: HTMLElement | null
  /** Edge of the anchor to align the panel with. */
  align?: 'start' | 'end'
  /** No card chrome: the slot brings its own surface (the link form does). */
  bare?: boolean
}>(), { align: 'start', bare: false })

const root = ref<HTMLElement | null>(null)
const ready = ref(false)
let stopAutoUpdate: (() => void) | null = null

async function place(): Promise<void> {
  if (!root.value || !props.anchor) return
  const { x, y } = await computePosition(props.anchor, root.value, {
    placement: `bottom-${props.align}`,
    strategy: 'fixed',
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
  })
  if (!root.value) return
  root.value.style.left = `${x}px`
  root.value.style.top = `${y}px`
  ready.value = true
}

function track(): void {
  stopAutoUpdate?.()
  stopAutoUpdate = null
  if (!root.value || !props.anchor) return
  stopAutoUpdate = autoUpdate(props.anchor, root.value, () => void place())
}

onMounted(async () => {
  await nextTick()
  await place()
  track()
})

watch(() => props.anchor, () => {
  ready.value = false
  void nextTick(async () => {
    await place()
    track()
  })
})

onBeforeUnmount(() => stopAutoUpdate?.())
</script>

<template>
  <div
    ref="root"
    class="toolbar-popover"
    :class="{ 'is-ready': ready, 'is-bare': bare }"
  >
    <slot />
  </div>
</template>

<style scoped>
/* A fixed layer so the toolbar's horizontal scrolling cannot clip the panel.
   It stays inside the bar's stacking context, which the toolbar raises above
   the editor's floating layers (selection bubble, slash menu): that way a menu
   hanging over the page can never be covered by one of them and lose its
   clicks. */
.toolbar-popover {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 96;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: var(--panel-strong);
  box-shadow: var(--shadow-float);
  font-family: var(--ui-font);
  opacity: 0;
}

/* Reveal only once the first position is known, so the menu never flashes. */
.toolbar-popover.is-ready {
  opacity: 1;
}

.toolbar-popover.is-bare {
  border: 0;
  background: transparent;
  box-shadow: none;
}
</style>
