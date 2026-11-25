<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { computePosition, flip, offset, shift } from '@floating-ui/dom'
import AppIcon from '../../components/AppIcon.vue'
import { EMOJI_CATEGORIES, searchEmojis, type EmojiCategoryKey } from '../core/emoji'
import { useI18n } from '../../i18n/useI18n'

/**
 * Emoji picker hanging from the toolbar's "+" menu, laid out like Yuque's:
 * a search field, a grid, and the category tabs along the bottom.
 *
 * Like the colour panel it positions itself: the toolbar clips its descendants,
 * so the picker has to live in a fixed layer. Picking does not close the panel,
 * so several emoji can be dropped in a row.
 */
const props = defineProps<{
  /** The element the panel hangs from. */
  anchor: HTMLElement | null
}>()

const emit = defineEmits<{
  pick: [char: string]
  close: []
}>()

const { t } = useI18n()
const panel = ref<HTMLElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const query = ref('')
const activeCategory = ref<EmojiCategoryKey>('recommend')

const currentCategory = computed(
  () => EMOJI_CATEGORIES.find((category) => category.key === activeCategory.value) ?? EMOJI_CATEGORIES[0]!,
)
const entries = computed(() => (query.value.trim() ? searchEmojis(query.value) : currentCategory.value.emojis))

function choose(char: string): void {
  emit('pick', char)
  // The caret stays in the search field, so the next pick is one click away.
  searchInput.value?.focus()
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
  void nextTick(async () => {
    await position()
    searchInput.value?.focus()
  })
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
  if (event.key !== 'Escape') return
  event.preventDefault()
  emit('close')
}
</script>

<template>
  <div ref="panel" class="emoji-panel" role="dialog" :aria-label="t('editor.emoji')" @keydown="handleKeydown">
    <label class="emoji-search">
      <AppIcon name="search" :size="14" />
      <input
        ref="searchInput"
        v-model="query"
        type="search"
        :placeholder="t('editor.emoji.placeholder')"
        :aria-label="t('editor.emoji.placeholder')"
        autocomplete="off"
        spellcheck="false"
      />
    </label>

    <div class="emoji-grid-wrap">
      <div v-if="entries.length" class="emoji-grid">
        <button
          v-for="entry in entries"
          :key="entry.char"
          type="button"
          class="emoji-cell"
          :title="entry.keywords.split(' ')[0]"
          @mousedown.prevent
          @click="choose(entry.char)"
        >{{ entry.char }}</button>
      </div>
      <p v-else class="emoji-empty">{{ t('editor.emoji.empty') }}</p>
    </div>

    <div class="emoji-tabs" role="tablist" :aria-label="t('editor.emoji')">
      <button
        v-for="category in EMOJI_CATEGORIES"
        :key="category.key"
        type="button"
        role="tab"
        :aria-selected="!query.trim() && activeCategory === category.key"
        :class="{ active: !query.trim() && activeCategory === category.key }"
        @mousedown.prevent
        @click="activeCategory = category.key; query = ''"
      >{{ t(category.labelKey) }}</button>
    </div>
  </div>
</template>

<style scoped>
.emoji-panel {
  position: fixed;
  z-index: 96;
  display: flex;
  width: 320px;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: var(--panel-strong);
  box-shadow: var(--shadow-float);
  font-family: var(--ui-font);
}

.emoji-search {
  display: flex;
  height: 30px;
  align-items: center;
  gap: 6px;
  padding: 0 9px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  color: var(--text-tertiary);
  background: var(--surface-input);
}

.emoji-search:focus-within {
  border-color: var(--accent);
}

.emoji-search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
}

.emoji-search input::placeholder {
  color: var(--text-placeholder);
}

.emoji-search input::-webkit-search-cancel-button {
  display: none;
}

.emoji-grid-wrap {
  height: 236px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
}

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
}

.emoji-cell {
  display: grid;
  height: 32px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 19px;
  line-height: 1;
}

.emoji-cell:hover {
  background: var(--accent-faint);
}

.emoji-empty {
  margin: 0;
  padding: 80px 0;
  color: var(--text-tertiary);
  font-size: 11.5px;
  text-align: center;
}

.emoji-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  border-top: 1px solid var(--divider-soft);
  padding-top: 6px;
}

.emoji-tabs button {
  flex: 1;
  height: 26px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
}

.emoji-tabs button:hover {
  background: var(--panel-muted);
  color: var(--text-primary);
}

.emoji-tabs button.active {
  background: var(--accent-faint);
  color: var(--accent-strong);
  font-weight: 620;
}
</style>