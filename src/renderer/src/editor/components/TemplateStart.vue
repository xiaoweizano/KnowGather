<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Editor } from '@tiptap/core'
import AppIcon from '../../components/AppIcon.vue'
import { useJournalTemplateStore } from '../../stores/journalTemplates'
import { useI18n } from '../../i18n/useI18n'
import {
  firstPageTemplates,
  journalTemplateDescription,
  journalTemplateLabel,
  type JournalTemplate,
} from '../../app/journalTemplates'

/**
 * The blank-page starting block, modelled on Yuque: a grid of template tiles
 * placed below a full writing area. It is purely a suggestion — the whole area
 * above it is the editor, and typing a single character hides the block, which
 * is why there is no dismiss button.
 */
const props = defineProps<{ editor: Editor | null }>()

const emit = defineEmits<{
  insert: [template: JournalTemplate]
  /** Drives the canvas's `has-template-start` class, which grows the blank
      writing area above the tiles so it is a clickable target. */
  visibility: [visible: boolean]
}>()

const templateStore = useJournalTemplateStore()
const { t } = useI18n()

const templates = computed(() => templateStore.all)
const expanded = ref(false)
const visibleTemplates = computed(() => firstPageTemplates(templates.value, expanded.value))
const hasMore = computed(() => templates.value.length > visibleTemplates.value.length)

// The block belongs to an empty page: it disappears as soon as there is
// content, and returns if the page is emptied again.
const empty = ref(true)

function syncEmpty(): void {
  empty.value = props.editor?.isEmpty ?? true
}

// The instance arrives after the editor mounts; the subscription follows it.
watch(() => props.editor, (editor, previous) => {
  previous?.off('update', syncEmpty)
  editor?.on('update', syncEmpty)
  syncEmpty()
}, { immediate: true })

onBeforeUnmount(() => props.editor?.off('update', syncEmpty))

const visible = computed(() => Boolean(props.editor) && empty.value)
watch(visible, (shown) => emit('visibility', shown), { immediate: true })

function label(template: JournalTemplate): string {
  return journalTemplateLabel(template, t)
}

function description(template: JournalTemplate): string {
  return journalTemplateDescription(template, t)
}

function pick(template: JournalTemplate): void {
  emit('insert', template)
}
</script>

<template>
  <section v-if="visible" class="template-start" :aria-label="t('editor.template.heading')">
    <p class="template-start-prompt">{{ t('editor.template.prompt') }}</p>

    <div class="template-grid">
      <button
        v-for="template in visibleTemplates"
        :key="template.id"
        type="button"
        class="template-card"
        :data-template="template.id"
        :data-tone="template.tone"
        @mousedown.prevent
        @click="pick(template)"
      >
        <span class="template-card-icon"><AppIcon :name="template.icon" :size="18" /></span>
        <span class="template-card-copy">
          <strong>{{ label(template) }}</strong>
          <small v-if="description(template)">{{ description(template) }}</small>
        </span>
      </button>

      <button
        v-if="hasMore"
        type="button"
        class="template-card template-card-more"
        @mousedown.prevent
        @click="expanded = true"
      >
        <span class="template-card-icon"><AppIcon name="grid" :size="18" /></span>
        <span class="template-card-copy">
          <strong>{{ t('editor.template.more') }}</strong>
          <small>{{ t('editor.template.moreHint') }}</small>
        </span>
      </button>
    </div>
  </section>
</template>

<style scoped>
/* Absolute inside the paper and pushed down past a comfortable writing area:
   the blank space above is live editor surface, so a click there puts the caret
   in the body instead of hitting this layer. No panel chrome — it reads as a
   suggestion sitting under the page's first lines. */
.template-start {
  position: absolute;
  top: var(--template-offset, 200px);
  left: 0;
  z-index: 2;
  width: 100%;
  padding: 0 0 8px;
  /* Clicks on the blank space between the prompt and the tiles should reach the
     editor underneath and put the caret there, not be swallowed by the layer. */
  pointer-events: none;
}

.template-start button,
.template-card {
  pointer-events: auto;
}

.template-start-prompt {
  margin: 0 0 14px;
  color: #aaa6b9;
  font-size: 13px;
  line-height: 1.5;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  max-width: 660px;
}

.template-card {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: var(--panel-strong);
  cursor: pointer;
  text-align: left;
  transition: border-color var(--motion-fast) var(--ease-out), box-shadow var(--motion-fast) var(--ease-out);
}

.template-card:hover {
  border-color: var(--accent-soft-border);
  box-shadow: var(--shadow-float);
}

.template-card-icon {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 9px;
  background: var(--tone-bg, var(--panel-muted));
  color: var(--tone-fg, var(--text-secondary));
}

/* One colour family per template, matched on the icon tile only, so the grid
   reads as a set without turning into a rainbow of cards. */
.template-card[data-tone='green'] { --tone-bg: var(--state-success-bg); --tone-fg: var(--state-success-fg); }
.template-card[data-tone='amber'] { --tone-bg: var(--state-warning-bg); --tone-fg: var(--state-warning-fg); }
.template-card[data-tone='blue'] { --tone-bg: var(--state-info-bg, var(--accent-faint)); --tone-fg: var(--state-info-fg, var(--accent-strong)); }
.template-card[data-tone='violet'] { --tone-bg: var(--accent-faint); --tone-fg: var(--accent-strong); }
.template-card[data-tone='rose'] { --tone-bg: var(--state-danger-bg); --tone-fg: var(--state-danger-fg); }
.template-card[data-tone='orange'] { --tone-bg: color-mix(in srgb, var(--state-warning-bg) 70%, var(--accent-faint)); --tone-fg: var(--state-warning-fg); }
.template-card[data-tone='slate'] { --tone-bg: var(--panel-muted); --tone-fg: var(--text-secondary); }

.template-card-more .template-card-icon {
  border: 1px dashed var(--border-strong);
  background: transparent;
}

.template-card-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.template-card-copy strong {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
}

.template-card-copy small {
  overflow: hidden;
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 920px) {
  .template-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 620px) {
  .template-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
