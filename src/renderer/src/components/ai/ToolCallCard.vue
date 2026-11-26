<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useI18n } from '../../i18n/useI18n'
import { findToolMeta, summarizeToolInput } from '../../../../shared/aiTools'
import type { AiToolCallView } from '../../stores/ai'

/**
 * One tool call in the transcript.
 *
 * Collapsed by default: a week of journal reads would otherwise bury the reply
 * the user actually wants. The header still carries enough to judge what
 * happened — which tool, what it was asked, and whether it worked.
 */
const props = defineProps<{ call: AiToolCallView }>()

const { t } = useI18n()
const expanded = ref(false)

const meta = computed(() => findToolMeta(props.call.name))
const label = computed(() => (meta.value ? t(meta.value.labelKey) : props.call.name))
const icon = computed(() => meta.value?.icon ?? 'wrench')
const summary = computed(() => summarizeToolInput(props.call.name, props.call.input))
const dangerClass = computed(() => props.call.danger)

const statusKey = computed(() => {
  switch (props.call.status) {
    case 'approval': return 'aiTool.status.approval'
    case 'running': return 'aiTool.status.running'
    case 'denied': return 'aiTool.status.denied'
    case 'error': return 'aiTool.status.error'
    default: return 'aiTool.status.ok'
  }
})

const prettyInput = computed(() => {
  if (props.call.input === null || props.call.input === undefined) return ''
  try {
    return JSON.stringify(props.call.input, null, 2)
  } catch {
    return String(props.call.input)
  }
})
</script>

<template>
  <article class="tool-call" :class="[`danger-${dangerClass}`, `status-${call.status}`]">
    <button type="button" class="tool-head" @click="expanded = !expanded">
      <span class="tool-icon"><AppIcon :name="icon" :size="13" /></span>
      <span class="tool-name">{{ label }}</span>
      <span v-if="summary" class="tool-summary">{{ summary }}</span>
      <span class="tool-status" :class="`is-${call.status}`">
        <span v-if="call.status === 'running'" class="pulse" />
        {{ t(statusKey) }}
      </span>
      <AppIcon :name="expanded ? 'chevronDown' : 'chevronRight'" :size="12" class="tool-caret" />
    </button>

    <div v-if="expanded" class="tool-body">
      <template v-if="prettyInput">
        <h4>{{ t('aiTool.input') }}</h4>
        <pre>{{ prettyInput }}</pre>
      </template>
      <template v-if="call.output">
        <h4>{{ t('aiTool.output') }}</h4>
        <pre>{{ call.output }}</pre>
      </template>
      <p v-else-if="call.status === 'running'" class="tool-hint">{{ t('aiTool.runningHint') }}</p>
      <p v-else-if="call.status === 'approval'" class="tool-hint">{{ t('aiTool.approvalHint') }}</p>
    </div>
  </article>
</template>

<style scoped>
.tool-call {
  border: 1px solid var(--border-soft);
  border-radius: 9px;
  background: var(--panel-muted);
  overflow: hidden;
}

.tool-call.status-error,
.tool-call.status-denied {
  border-color: var(--state-danger-border, var(--border-strong));
}

.tool-head {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 7px 10px;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.tool-head:hover {
  background: var(--panel-strong);
}

.tool-icon {
  display: grid;
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 6px;
  background: var(--panel-strong);
  color: var(--text-tertiary);
}

.tool-name {
  flex: 0 0 auto;
  color: var(--text-primary);
  font-size: 11.5px;
  font-weight: 600;
}

.tool-summary {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: var(--text-tertiary);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--panel-strong);
  color: var(--text-tertiary);
  font-size: 9.5px;
}

.tool-status.is-ok { color: var(--state-success-fg, #2e7d32); }
.tool-status.is-error,
.tool-status.is-denied { color: var(--state-danger-fg); }
.tool-status.is-approval { color: var(--accent-strong); }

.pulse {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  animation: tool-pulse 1.2s ease-in-out infinite;
}

@keyframes tool-pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}

.tool-caret {
  flex: 0 0 auto;
  color: var(--text-tertiary);
}

.tool-body {
  padding: 0 10px 10px 37px;
}

.tool-body h4 {
  margin: 8px 0 4px;
  color: var(--text-tertiary);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.tool-body pre {
  max-height: 260px;
  margin: 0;
  padding: 8px 10px;
  border-radius: 7px;
  background: var(--panel-strong);
  color: var(--text-secondary);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10.5px;
  line-height: 1.55;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.tool-hint {
  margin: 8px 0 0;
  color: var(--text-tertiary);
  font-size: 10.5px;
}
</style>
