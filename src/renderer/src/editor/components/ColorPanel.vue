<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { computePosition, flip, offset, shift } from '@floating-ui/dom'
import AppIcon from '../../components/AppIcon.vue'
import {
  COLOR_GRID,
  COLOR_NEUTRALS,
  TEXT_GRADIENTS,
  contrastOn,
  gradientTextColor,
  readRecentColors,
  rememberRecentColor,
  type PaletteSwatch,
} from '../core/palettes'
import { useI18n } from '../../i18n/useI18n'

/**
 * Colour picker panel, laid out like Yuque's: neutral row, hue grid, gradients,
 * recent picks and a "more colours" row with a native colour input.
 *
 * It is a floating panel anchored to its trigger instead of a popover inside
 * the toolbar: the toolbar scrolls horizontally, which would clip a descendant
 * absolutely positioned panel.
 */
const props = defineProps<{
  /** Panel mode: text colour or background fill. */
  mode: 'color' | 'highlight'
  /** The element the panel hangs from (the toolbar button). */
  anchor: HTMLElement | null
  /** Currently applied value, marked with a tick. */
  current: string | null
}>()

const emit = defineEmits<{
  pick: [value: string | null]
  close: []
}>()

const { t } = useI18n()
const panel = ref<HTMLElement | null>(null)
const customInput = ref<HTMLInputElement | null>(null)
const recent = ref<string[]>(readRecentColors())

const isFill = computed(() => props.mode === 'highlight')

function styleFor(swatch: PaletteSwatch): Record<string, string> | undefined {
  if (swatch.gradient) return { background: swatch.gradient }
  return swatch.value ? { background: swatch.value } : undefined
}

function isActive(value: string | null): boolean {
  return value !== null && props.current?.toLowerCase() === value.toLowerCase()
}

function choose(value: string | null): void {
  emit('pick', value)
}

function chooseCustom(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  if (!/^#[0-9a-f]{6}$/i.test(value)) return
  recent.value = rememberRecentColor(value)
  emit('pick', value)
}

function openCustomPicker(): void {
  customInput.value?.click()
}

/* --------------------------------------------------------------- placement */

async function position(): Promise<void> {
  if (!panel.value || !props.anchor) return
  const { x, y, strategy } = await computePosition(props.anchor, panel.value, {
    placement: 'bottom-start',
    strategy: 'fixed',
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
  })
  panel.value.style.position = strategy
  panel.value.style.left = `${x}px`
  panel.value.style.top = `${y}px`
}

onMounted(() => {
  document.addEventListener('pointerdown', handleOutside, true)
  window.addEventListener('resize', position)
  document.addEventListener('scroll', position, true)
  void nextTick(position)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutside, true)
  window.removeEventListener('resize', position)
  document.removeEventListener('scroll', position, true)
})

watch(() => props.anchor, () => void nextTick(position))

function handleOutside(event: PointerEvent): void {
  const target = event.target as Node | null
  if (!target) return
  if (panel.value?.contains(target) || props.anchor?.contains(target)) return
  emit('close')
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}
</script>

<template>
  <div
    ref="panel"
    class="color-panel"
    role="dialog"
    :aria-label="isFill ? t('editor.toolbar.highlight') : t('editor.toolbar.color')"
    @keydown="handleKeydown"
  >
    <button type="button" class="panel-clear" @mousedown.prevent @click="choose(null)">
      <span class="panel-clear-mark" :class="{ 'is-fill': isFill }" />
      <span>{{ isFill ? t('editor.palette.noFill') : t('editor.palette.resetColor') }}</span>
      <AppIcon v-if="current === null" name="check" :size="14" class="panel-check" />
    </button>

    <div class="swatch-row swatch-neutrals">
      <button
        v-for="swatch in COLOR_NEUTRALS"
        :key="swatch.value"
        type="button"
        class="swatch"
        @mousedown.prevent
        :style="styleFor(swatch)"
        :class="{ active: isActive(swatch.value) }"
        :title="t(swatch.labelKey)"
        @click="choose(swatch.value)"
      >
        <AppIcon v-if="isActive(swatch.value)" name="check" :size="11" :style="{ color: contrastOn(swatch.value ?? '#ffffff') }" />
      </button>
    </div>

    <div class="swatch-grid">
      <div v-for="column in COLOR_GRID" :key="column.labelKey" class="swatch-column">
        <button
          v-for="swatch in column.swatches"
          :key="swatch.value ?? swatch.labelKey"
          type="button"
          class="swatch"
          :style="styleFor(swatch)"
          :class="{ active: isActive(swatch.value) }"
          :title="t(swatch.labelKey)"
          @click="choose(swatch.value)"
        >
          <AppIcon v-if="isActive(swatch.value)" name="check" :size="11" :style="{ color: contrastOn(swatch.value ?? '#ffffff') }" />
        </button>
      </div>
    </div>

    <template v-if="!isFill">
      <p class="panel-caption">{{ t('editor.palette.gradients') }}</p>
      <div class="swatch-row swatch-gradients">
        <button
          v-for="swatch in TEXT_GRADIENTS"
          :key="swatch.labelKey"
          type="button"
          class="swatch"
          :style="styleFor(swatch)"
          :title="t(swatch.labelKey)"
        @mousedown.prevent
          @click="choose(gradientTextColor(swatch))"
        />
      </div>
    </template>

    <div class="panel-recent">
      <p class="panel-caption">{{ t('editor.palette.recent') }}</p>
      <div v-if="recent.length" class="swatch-row swatch-recent">
        <button
          v-for="value in recent"
          :key="value"
          type="button"
          class="swatch"
          :style="{ background: value }"
          :class="{ active: isActive(value) }"
          :title="value"
        @mousedown.prevent
          @click="choose(value)"
        >
          <AppIcon v-if="isActive(value)" name="check" :size="11" :style="{ color: contrastOn(value) }" />
        </button>
      </div>
      <p v-else class="panel-empty">{{ t('editor.palette.recentEmpty') }}</p>
    </div>

    <button type="button" class="panel-more" @mousedown.prevent @click="openCustomPicker">
      <span class="panel-more-icon" />
      <span>{{ t('editor.palette.more') }}</span>
      <AppIcon name="chevronRight" :size="13" />
    </button>
    <input ref="customInput" type="color" class="panel-native" :value="current ?? '#000000'" @input="chooseCustom" />
  </div>
</template>

<style scoped>
.color-panel {
  position: fixed;
  z-index: 95;
  display: flex;
  width: 268px;
  flex-direction: column;
  gap: 8px;
  padding: 10px 10px 6px;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: var(--panel-strong);
  box-shadow: var(--shadow-float);
}

.panel-clear {
  display: flex;
  height: 30px;
  align-items: center;
  gap: 8px;
  padding: 0 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  text-align: left;
}

.panel-clear:hover {
  background: var(--panel-muted);
}

.panel-clear-mark {
  width: 16px;
  height: 16px;
  border: 1px solid var(--border-strong);
  border-radius: 3px;
  background: #1b1a1f;
}

.panel-clear-mark.is-fill {
  background: linear-gradient(135deg, transparent 44%, #e05a5a 44% 56%, transparent 56%), var(--panel-strong);
}

.panel-check {
  margin-left: auto;
  color: var(--accent-strong);
}

.swatch-row {
  display: flex;
  gap: 5px;
}

.swatch-neutrals {
  gap: 5px;
}

.swatch-gradients {
  gap: 6px;
}

.swatch-recent {
  flex-wrap: wrap;
}

.swatch-grid {
  display: flex;
  justify-content: space-between;
  padding: 0 2px;
}

.swatch-column {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.swatch {
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  padding: 0;
  border: 1px solid color-mix(in srgb, #000 9%, transparent);
  border-radius: 3px;
  background: var(--panel-muted);
  cursor: pointer;
}

.swatch:hover {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.swatch.active {
  outline: 2px solid var(--accent-strong);
  outline-offset: 1px;
}

.panel-caption {
  margin: 2px 0 0;
  color: var(--text-tertiary);
  font-size: 11px;
}

.panel-recent {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--divider-soft);
}

.panel-empty {
  margin: 0;
  color: var(--text-tertiary);
  font-size: 11px;
}

.panel-more {
  display: flex;
  height: 30px;
  align-items: center;
  gap: 8px;
  margin: 0 -10px -6px;
  padding: 0 12px;
  border: 0;
  border-top: 1px solid var(--divider-soft);
  border-radius: 0 0 10px 10px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}

.panel-more:hover {
  background: var(--panel-muted);
}

.panel-more-icon {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: conic-gradient(#e8483f, #f0b400, #27b06a, #3176f0, #b93ecc, #e8483f);
}

.panel-more > svg:last-child {
  margin-left: auto;
  color: var(--text-tertiary);
}

.panel-native {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
</style>
