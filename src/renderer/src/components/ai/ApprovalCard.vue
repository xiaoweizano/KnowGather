<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useI18n } from '../../i18n/useI18n'
import { findToolMeta, summarizeToolInput } from '../../../../shared/aiTools'
import type { AiApprovalItem } from '../../stores/ai'

/**
 * A tool call blocked on the user's decision.
 *
 * Rendered inline where the call happened rather than in a modal: the user is
 * mid-conversation and needs to see what the model was trying to do in context.
 * Buttons are deliberately equal-weight text (no pre-selected default) so a
 * stray Enter cannot approve a destructive command.
 */
const props = defineProps<{ item: AiApprovalItem; busy?: boolean }>()
const emit = defineEmits<{ decide: [decision: 'allow' | 'deny', remember: boolean] }>()

const { t } = useI18n()

const meta = computed(() => findToolMeta(props.item.name))
const label = computed(() => (meta.value ? t(meta.value.labelKey) : props.item.name))
const summary = computed(() => summarizeToolInput(props.item.name, props.item.input))
const isExecute = computed(() => props.item.danger === 'execute')

const detail = computed(() => {
  // For a command the full line is what matters; for a write, the path.
  if (isExecute.value) {
    const command = props.item.input && typeof props.item.input === 'object'
      ? (props.item.input as Record<string, unknown>).command
      : null
    if (typeof command === 'string' && command.trim()) return command
  }
  const path = props.item.input && typeof props.item.input === 'object'
    ? (props.item.input as Record<string, unknown>).path
    : null
  if (typeof path === 'string' && path.trim()) return path
  return summary.value
})
</script>

<template>
  <article class="approval" :class="`danger-${item.danger}`" role="alertdialog" :aria-label="t('aiTool.approvalTitle')">
    <header class="approval-head">
      <span class="approval-icon"><AppIcon name="shield" :size="14" /></span>
      <div>
        <strong>{{ t('aiTool.approvalTitle') }}</strong>
        <p>{{ t('aiTool.approvalBody', { tool: label }) }}</p>
      </div>
    </header>

    <pre v-if="detail" class="approval-command">{{ detail }}</pre>

    <div class="approval-actions">
      <button type="button" class="deny" :disabled="busy" @click="emit('decide', 'deny', false)">
        {{ t('aiTool.deny') }}
      </button>
      <button type="button" class="allow-once" :disabled="busy" @click="emit('decide', 'allow', false)">
        {{ t('aiTool.allowOnce') }}
      </button>
      <button type="button" class="allow-remember" :disabled="busy" @click="emit('decide', 'allow', true)">
        {{ t('aiTool.allowAlways') }}
      </button>
    </div>
  </article>
</template>

<style scoped>
.approval {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 11px 12px;
  border: 1px solid var(--accent-soft-border, var(--border-strong));
  border-radius: 11px;
  background: var(--accent-faint);
}

.approval.danger-write,
.approval.danger-execute {
  border-color: var(--state-warning-border, #d9a441);
  background: var(--state-warning-bg, #fdf6e3);
}

.approval-head {
  display: flex;
  gap: 9px;
  align-items: flex-start;
}

.approval-icon {
  display: grid;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 7px;
  background: var(--panel-strong);
  color: var(--accent-strong);
}

.approval.danger-write .approval-icon,
.approval.danger-execute .approval-icon {
  color: #a8712a;
}

.approval-head strong {
  display: block;
  color: var(--text-primary);
  font-size: 11.5px;
  font-weight: 650;
}

.approval-head p {
  margin: 2px 0 0;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.6;
}

.approval-command {
  margin: 0;
  padding: 8px 10px;
  border-radius: 7px;
  background: var(--panel-strong);
  color: var(--text-primary);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11px;
  line-height: 1.55;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.approval-actions {
  display: flex;
  gap: 7px;
  justify-content: flex-end;
}

.approval-actions button {
  padding: 5px 11px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: var(--panel-strong);
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
}

.approval-actions button:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--text-primary);
}

.approval-actions .deny {
  color: var(--state-danger-fg);
}

.approval-actions .deny:hover:not(:disabled) {
  border-color: var(--state-danger-fg);
}

.approval-actions .allow-once {
  border-color: var(--accent);
  background: var(--accent);
  color: white;
}

.approval-actions .allow-once:hover:not(:disabled) {
  color: white;
  filter: brightness(1.05);
}
</style>
