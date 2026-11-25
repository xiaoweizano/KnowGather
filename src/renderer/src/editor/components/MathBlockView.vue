<script setup lang="ts">
import { computed } from 'vue'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { useI18n } from '../../i18n/useI18n'
import { normalizeBlockSource } from '../core/richBlockModel'

const props = defineProps<{ latex: string; selected?: boolean }>()
const { t } = useI18n()

/**
 * KaTeX throws on malformed input instead of returning an error string, so the
 * render is wrapped: a typo in the formula must stay editable, not break the
 * whole document's node view.
 */
const rendered = computed(() => {
  const source = normalizeBlockSource(props.latex).trim()
  if (!source) return { ok: true, html: '', error: '' }
  try {
    return {
      ok: true,
      html: katex.renderToString(source, { throwOnError: false, displayMode: true, strict: 'ignore', trust: false }),
      error: '',
    }
  } catch (error) {
    return { ok: false, html: '', error: error instanceof Error ? error.message : String(error) }
  }
})
</script>

<template>
  <div class="math-card" :class="{ 'is-selected': selected }" :data-hint="t('editor.math.edit')">
    <div v-if="rendered.ok && rendered.html" class="math-body" v-html="rendered.html" />
    <div v-else-if="rendered.ok" class="math-empty">{{ t('editor.math.placeholder') }}</div>
    <div v-else class="math-error" role="status">{{ t('editor.math.invalid') }}</div>
  </div>
</template>

<style scoped>
.math-card {
  position: relative;
  display: block;
  margin: 1.05em 0 1.2em;
  padding: 12px 16px;
  border: 1px solid var(--border-soft);
  border-radius: 11px;
  background: var(--panel-muted);
  overflow-x: auto;
  cursor: pointer;
}

.math-card:hover { border-color: var(--border-strong); }

.math-card.is-selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.math-body :deep(.katex-display) { margin: 0; }

.math-empty,
.math-error {
  color: var(--text-tertiary);
  font-size: 12px;
}

.math-error { color: var(--state-danger-fg); }
</style>
