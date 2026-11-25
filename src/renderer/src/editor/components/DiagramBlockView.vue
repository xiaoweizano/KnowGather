<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from '../../i18n/useI18n'
import { normalizeBlockSource } from '../core/richBlockModel'

const props = defineProps<{ code: string; language: string; selected?: boolean }>()
const { t } = useI18n()

const svg = ref('')
const failed = ref(false)
const pending = ref(true)
let runToken = 0
let timer: ReturnType<typeof setTimeout> | null = null

const source = computed(() => normalizeBlockSource(props.code).trim())

/**
 * Mermaid is loaded lazily and rendered asynchronously. Rendering is debounced
 * and guarded by a token: while the author is typing, half-finished diagram
 * source is expected, and the last render must win over stale ones.
 */
async function render(): Promise<void> {
  const token = ++runToken
  const text = source.value
  if (!text) {
    svg.value = ''
    failed.value = false
    pending.value = false
    return
  }
  pending.value = true
  try {
    const mermaid = (await import('mermaid')).default
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', fontFamily: 'inherit' })
    const id = `shizhi-mermaid-${token}`
    const { svg: output } = await mermaid.render(id, text)
    if (token !== runToken) return
    svg.value = output
    failed.value = false
  } catch {
    if (token !== runToken) return
    svg.value = ''
    failed.value = true
  } finally {
    if (token === runToken) pending.value = false
  }
}

function schedule(): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void render(), 400)
}

watch([source, () => props.language], schedule, { immediate: true })

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
  runToken += 1
})
</script>

<template>
  <div class="diagram-card" :class="{ 'is-selected': selected }" :data-hint="t('editor.diagram.edit')">
    <div v-if="svg" class="diagram-body" v-html="svg" />
    <div v-else-if="failed" class="diagram-state is-error">{{ t('editor.diagram.invalid') }}</div>
    <div v-else-if="pending || !source" class="diagram-state">{{ t('editor.diagram.rendering') }}</div>
    <pre class="diagram-source" :title="t('editor.diagram.source')">{{ source }}</pre>
  </div>
</template>

<style scoped>
.diagram-card {
  position: relative;
  margin: 1.05em 0 1.2em;
  padding: 10px;
  border: 1px solid var(--border-soft);
  border-radius: 11px;
  background: var(--panel-muted);
  cursor: pointer;
}

.diagram-card:hover { border-color: var(--border-strong); }

.diagram-card.is-selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.diagram-body {
  display: flex;
  justify-content: center;
  padding: 6px;
  overflow-x: auto;
}

.diagram-body :deep(svg) {
  max-width: 100%;
  height: auto;
}

.diagram-state {
  padding: 12px;
  color: var(--text-tertiary);
  font-size: 12px;
  text-align: center;
}

.diagram-state.is-error { color: var(--state-danger-fg); }

/* The source stays visible under the preview: diagram blocks are small enough
   that seeing the definition helps, and it doubles as the edit affordance. */
.diagram-source {
  max-height: 88px;
  margin: 0;
  padding: 7px 9px;
  border-radius: 7px;
  background: var(--panel-strong);
  color: var(--text-secondary);
  font-family: var(--editor-code-font);
  font-size: 11px;
  line-height: 1.5;
  overflow: auto;
  white-space: pre-wrap;
}
</style>
