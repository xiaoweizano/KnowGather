<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import type { DocumentRecord } from '../../../shared/document'
import { shouldDismissLayer } from '../composables/dismissibleLayer'
import { formatKnowledgeUpdatedAt } from '../app/knowledgeView'
import { useI18n } from '../i18n/useI18n'

const props = defineProps<{ document: DocumentRecord }>()
const emit = defineEmits<{
  updateTitle: [title: string]
  toggleFavorite: []
  share: []
  addTag: [tag: string]
  removeTag: [tag: string]
  createDocument: []
  deleteDocument: []
}>()

const { t, locale } = useI18n()
const titleDraft = ref(props.document.title)
const tagMenuOpen = ref(false)
const tagDraft = ref('')
const tagError = ref<string | null>(null)
const moreMenuOpen = ref(false)
const tagInput = ref<HTMLInputElement | null>(null)
const tagAnchor = ref<HTMLElement | null>(null)
const moreAnchor = ref<HTMLElement | null>(null)

const favorite = computed(() => props.document.favorite)

const updatedLabel = computed(() => formatKnowledgeUpdatedAt(props.document.updatedAt, new Date(), locale.value))

watch(() => props.document.id, () => {
  titleDraft.value = props.document.title
  tagMenuOpen.value = false
  moreMenuOpen.value = false
})

// Keep the draft in sync when the title is changed elsewhere (for example when a
// save receipt rewrites the record), but never while the user is typing in it.
watch(() => props.document.title, (title) => {
  if (title !== titleDraft.value && document.activeElement?.classList.contains('document-title') !== true) {
    titleDraft.value = title
  }
})

function commitTitle(): void {
  const next = titleDraft.value.trim() || t('common.untitledDocument')
  titleDraft.value = next
  emit('updateTitle', next)
}

function commitTitleAndBlur(event: KeyboardEvent): void {
  const target = event.target
  if (target instanceof HTMLInputElement) target.blur()
}

async function openTagMenu(): Promise<void> {
  tagDraft.value = ''
  tagError.value = null
  tagMenuOpen.value = true
  moreMenuOpen.value = false
  await nextTick()
  tagInput.value?.focus()
}

function closeTagMenu(): void {
  tagMenuOpen.value = false
  tagDraft.value = ''
  tagError.value = null
}

function submitTag(): void {
  const next = tagDraft.value.trim()
  if (!next) {
    tagError.value = t('document.tagEmpty')
    return
  }
  if (Array.from(next).length > 30) {
    tagError.value = t('document.tagTooLong')
    return
  }
  if (props.document.tags.includes(next)) {
    tagError.value = t('document.tagDuplicate')
    return
  }
  emit('addTag', next)
  closeTagMenu()
}

function handleGlobalPointerDown(event: PointerEvent): void {
  if (tagMenuOpen.value && shouldDismissLayer(event, event.target, '.tag-popover, .add-tag')) closeTagMenu()
  if (moreMenuOpen.value && shouldDismissLayer(event, event.target, '.more-menu, .more-button')) moreMenuOpen.value = false
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (tagMenuOpen.value) {
    event.preventDefault()
    closeTagMenu()
  } else if (moreMenuOpen.value) {
    event.preventDefault()
    moreMenuOpen.value = false
  }
}

onMounted(() => {
  window.addEventListener('pointerdown', handleGlobalPointerDown)
  window.addEventListener('keydown', handleGlobalKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', handleGlobalPointerDown)
  window.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<template>
  <header class="document-header">
    <div class="breadcrumbs" :aria-label="t('document.breadcrumbAria')">
      <span>{{ t('document.breadcrumbRoot') }}</span>
      <AppIcon name="chevronRight" :size="12" />
      <strong>{{ document.title }}</strong>
      <button type="button" class="header-add" :title="t('document.newDocument')" :aria-label="t('document.newDocument')" @click="emit('createDocument')">
        <AppIcon name="plus" :size="18" />
      </button>
    </div>

    <div class="title-row">
      <span class="document-symbol"><AppIcon name="journal" :size="25" /></span>
      <input
        v-model="titleDraft"
        class="document-title"
        :aria-label="t('document.titleAria')"
        maxlength="120"
        @blur="commitTitle"
        @keydown.enter.prevent="commitTitleAndBlur"
      />
      <button
        type="button"
        class="favorite-button"
        :class="{ active: favorite }"
        :title="favorite ? t('document.favoriteRemove') : t('document.favoriteAdd')"
        :aria-pressed="favorite"
        @click="emit('toggleFavorite')"
      >
        <span>{{ favorite ? '★' : '☆' }}</span>
      </button>
      <span class="title-meta">{{ t('document.lastEdited', { time: updatedLabel }) }}</span>
      <span class="title-clock"><AppIcon name="clock" :size="17" /></span>
      <button type="button" class="share-button" @click="emit('share')">
        <AppIcon name="share" :size="17" />
        <span>{{ t('document.share') }}</span>
      </button>
      <div ref="moreAnchor" class="more-anchor">
        <button
          type="button"
          class="more-button"
          :title="t('document.moreAria')"
          :aria-label="t('document.moreAria')"
          :aria-expanded="moreMenuOpen"
          @click="moreMenuOpen = !moreMenuOpen; tagMenuOpen = false"
        >
          <AppIcon name="more" :size="19" />
        </button>
        <div v-if="moreMenuOpen" class="more-menu" role="menu">
          <button type="button" role="menuitem" @click="moreMenuOpen = false; emit('createDocument')">
            <AppIcon name="filePlus" :size="15" /> {{ t('document.newDocument') }}
          </button>
          <button type="button" role="menuitem" class="danger" @click="moreMenuOpen = false; emit('deleteDocument')">
            <AppIcon name="trash" :size="15" /> {{ t('document.deleteDocument') }}
          </button>
        </div>
      </div>
    </div>

    <div class="tag-row">
      <span v-for="tag in document.tags" :key="tag" class="tag-chip">
        {{ tag }}
        <button
          type="button"
          class="tag-remove"
          :aria-label="t('document.removeTag', { tag })"
          :title="t('document.removeTag', { tag })"
          @click="emit('removeTag', tag)"
        >
          ×
        </button>
      </span>
      <div ref="tagAnchor" class="tag-anchor">
        <button type="button" class="add-tag" :aria-expanded="tagMenuOpen" @click="tagMenuOpen ? closeTagMenu() : openTagMenu()">
          <AppIcon name="plus" :size="12" /> {{ t('document.addTag') }}
        </button>
        <form v-if="tagMenuOpen" class="tag-popover" novalidate @submit.prevent="submitTag" @invalid.capture.prevent>
          <label for="new-tag-name">{{ t('document.addTagLabel') }}</label>
          <input
            id="new-tag-name"
            ref="tagInput"
            v-model="tagDraft"
            maxlength="30"
            autocomplete="off"
            :placeholder="t('document.tagPlaceholder')"
          />
          <p v-if="tagError" class="tag-error" role="alert">{{ tagError }}</p>
          <div class="tag-actions">
            <button type="button" @click="closeTagMenu">{{ t('common.cancel') }}</button>
            <button type="submit" class="tag-primary">{{ t('document.tagAdd') }}</button>
          </div>
        </form>
      </div>
    </div>
  </header>
</template>

<style scoped>
.document-header {
  flex: 0 0 auto;
  padding: 8px 24px 11px;
  background: var(--panel-strong);
}

.breadcrumbs {
  display: flex;
  height: 24px;
  align-items: center;
  gap: 7px;
  color: var(--text-secondary);
  font-size: 10px;
}

.breadcrumbs strong {
  overflow: hidden;
  max-width: 320px;
  color: var(--text-row);
  font-size: 10px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-add {
  display: grid;
  width: 24px;
  height: 24px;
  margin-left: auto;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-hint);
  cursor: pointer;
}

.title-row {
  display: flex;
  min-width: 0;
  height: 53px;
  align-items: center;
  gap: 10px;
}

.document-symbol {
  display: grid;
  width: 35px;
  height: 35px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--accent-soft-border);
  border-radius: 9px;
  background: linear-gradient(135deg, var(--accent-faint), var(--accent-soft-bg));
  color: #7561e5;
}

.document-title {
  width: min(520px, 50vw);
  min-width: 120px;
  padding: 2px 3px;
  border: 0;
  border-radius: 5px;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
  font-size: 23px;
  font-weight: 730;
  letter-spacing: -0.035em;
}

.document-title:hover {
  background: var(--panel-muted);
}

.document-title:focus {
  background: var(--panel-muted);
  box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--accent) 35%, transparent);
}

.favorite-button {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-hint);
  cursor: pointer;
  font-size: 18px;
}

.favorite-button.active {
  color: #f3bd35;
}

.title-meta {
  margin-left: auto;
  color: var(--text-meta);
  font-size: 10px;
  white-space: nowrap;
}

.title-clock {
  color: var(--text-hint);
}

.share-button {
  display: flex;
  height: 31px;
  align-items: center;
  gap: 5px;
  padding: 0 11px;
  border: 1px solid #6f5be0;
  border-radius: 8px;
  background: linear-gradient(180deg, #836ff0, #6d59df);
  box-shadow: 0 4px 10px rgba(105, 84, 221, 0.18);
  color: white;
  cursor: pointer;
  font-size: 11px;
}

.more-button {
  display: grid;
  width: 31px;
  height: 30px;
  place-items: center;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: var(--panel-strong);
  color: var(--text-secondary);
  cursor: pointer;
}

.tag-row {
  display: flex;
  min-height: 25px;
  align-items: center;
  gap: 6px;
  padding-left: 45px;
}

.tag-chip {
  display: inline-flex;
  height: 20px;
  align-items: center;
  gap: 3px;
  padding: 0 9px;
  border-radius: 999px;
  background: #e9e5ff;
  color: #6956dd;
  font-size: 9px;
  font-weight: 600;
}

.tag-chip:nth-child(2) {
  background: #e8f3fb;
  color: #5d8db8;
}

.tag-chip.hot {
  background: #fff0e5;
  color: #dd8353;
}

.tag-dot {
  color: #f18b52;
  font-size: 7px;
}

.add-tag {
  display: inline-flex;
  height: 20px;
  align-items: center;
  gap: 2px;
  padding: 0 7px;
  border: 1px dashed var(--border-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--text-placeholder);
  cursor: pointer;
  font-size: 9px;
}

.tag-remove {
  display: grid;
  width: 12px;
  height: 12px;
  margin-left: 1px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  line-height: 1;
  opacity: 0;
  transition: opacity 120ms ease, background 120ms ease;
}

.tag-chip:hover .tag-remove,
.tag-remove:focus-visible {
  opacity: 0.75;
}

.tag-remove:hover {
  background: color-mix(in srgb, currentColor 18%, transparent);
  opacity: 1;
}

.tag-anchor,
.more-anchor {
  position: relative;
  display: inline-flex;
}

.tag-popover,
.more-menu {
  position: absolute;
  z-index: 40;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: var(--panel-strong);
  box-shadow: var(--shadow-float);
}

.tag-popover {
  top: 26px;
  left: 0;
  display: flex;
  width: 218px;
  flex-direction: column;
  gap: 8px;
  padding: 11px;
  color: var(--text-primary);
  font-size: 11px;
}

.tag-popover label {
  font-weight: 650;
}

.tag-popover input {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--border-soft);
  border-radius: 7px;
  outline: none;
  background: var(--panel-bg);
  color: var(--text-primary);
  font: inherit;
}

.tag-popover input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-faint);
}

.tag-error {
  margin: 0;
  color: var(--state-danger-fg);
  font-size: 10px;
  line-height: 1.45;
}

.tag-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.tag-actions button {
  height: 26px;
  padding: 0 9px;
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  background: var(--panel-strong);
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 10px;
}

.tag-actions .tag-primary {
  border-color: var(--accent);
  background: var(--accent);
  color: white;
}

.more-menu {
  top: 34px;
  right: 0;
  width: 158px;
  padding: 5px;
}

.more-menu button {
  display: flex;
  width: 100%;
  height: 32px;
  align-items: center;
  gap: 8px;
  padding: 0 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font-size: 11px;
  text-align: left;
}

.more-menu button:hover {
  background: var(--accent-faint);
  color: var(--accent-strong);
}

.more-menu button.danger {
  color: var(--danger);
}

.more-menu button.danger:hover {
  background: var(--state-danger-bg);
  color: var(--state-danger-fg);
}

@media (max-width: 1150px) {
  .title-meta {
    display: none;
  }
}
</style>
