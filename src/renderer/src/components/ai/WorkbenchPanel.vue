<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../AppIcon.vue'
import { useI18n } from '../../i18n/useI18n'
import { useAiStore, type AiApprovalItem } from '../../stores/ai'
import { useSettingsStore } from '../../stores/settings'
import type { AiPermissionMode } from '../../../../shared/aiTools'
import { AI_PERMISSION_MODES } from '../../../../shared/aiTools'

/**
 * The right-hand column of the workbench.
 *
 * Its job is context the transcript cannot carry: where the tools are pointed,
 * how much freedom they have, and anything currently waiting on the user.
 */
const ai = useAiStore()
const settingsStore = useSettingsStore()
const { t } = useI18n()

const workspaceRoot = computed(() => settingsStore.settings.workspaceRoot)
const permissionMode = computed(() => settingsStore.settings.aiPermissionMode)

const activeCalls = computed(() => {
  const turns = ai.active?.turns ?? []
  const calls = turns.flatMap((turn) => turn.toolCalls)
  return {
    total: calls.length,
    running: calls.filter((call) => call.status === 'running').length,
    failed: calls.filter((call) => call.status === 'error' || call.status === 'denied').length,
  }
})

const permissionOptions = computed(() => AI_PERMISSION_MODES.map((mode) => ({
  mode,
  label: t(`aiPermission.${mode}`),
  hint: t(`aiPermission.${mode}Hint`),
})))

async function pickWorkspace(): Promise<void> {
  const picked = await ai.pickWorkspace()
  if (!picked) return
  await settingsStore.update({ workspaceRoot: picked })
}

async function clearWorkspace(): Promise<void> {
  await settingsStore.update({ workspaceRoot: '' })
}

async function setPermission(mode: AiPermissionMode): Promise<void> {
  if (mode === permissionMode.value) return
  await settingsStore.update({ aiPermissionMode: mode })
}

function openWorkspace(): void {
  // `openExternal` on a folder path is what the data-folder button uses too.
  void ai.openPath(workspaceRoot.value)
}

function respond(item: AiApprovalItem, decision: 'allow' | 'deny', remember = false): void {
  void ai.respondApproval(item, decision, remember)
}
</script>

<template>
  <aside class="workbench" :aria-label="t('aiWorkbench.title')">
    <section class="wb-section">
      <header class="wb-head">
        <h2>{{ t('aiWorkbench.workspace') }}</h2>
      </header>
      <div v-if="workspaceRoot" class="wb-workspace">
        <button type="button" class="wb-path" :title="workspaceRoot" @click="openWorkspace">
          <AppIcon name="folder" :size="13" />
          <span>{{ workspaceRoot }}</span>
        </button>
        <button type="button" class="wb-link" @click="clearWorkspace">{{ t('aiWorkbench.clear') }}</button>
      </div>
      <div v-else class="wb-empty">
        <p>{{ t('aiWorkbench.workspaceEmpty') }}</p>
        <button type="button" class="wb-pick" @click="pickWorkspace">
          <AppIcon name="folder" :size="13" /> {{ t('aiWorkbench.choose') }}
        </button>
      </div>
      <button v-if="workspaceRoot" type="button" class="wb-link" @click="pickWorkspace">
        {{ t('aiWorkbench.change') }}
      </button>
    </section>

    <section class="wb-section">
      <header class="wb-head">
        <h2>{{ t('aiWorkbench.permission') }}</h2>
      </header>
      <div class="wb-modes">
        <button
          v-for="option in permissionOptions"
          :key="option.mode"
          type="button"
          class="wb-mode"
          :class="{ active: permissionMode === option.mode }"
          :title="option.hint"
          @click="setPermission(option.mode)"
        >
          <strong>{{ option.label }}</strong>
          <small>{{ option.hint }}</small>
        </button>
      </div>
    </section>

    <section v-if="ai.pendingApprovals.length" class="wb-section">
      <header class="wb-head">
        <h2>{{ t('aiWorkbench.pending') }} <span class="wb-count">{{ ai.pendingApprovals.length }}</span></h2>
      </header>
      <ul class="wb-queue">
        <li v-for="item in ai.pendingApprovals" :key="item.toolUseId">
          <span class="wb-queue-name">{{ item.name }}</span>
          <span class="wb-queue-preview">{{ item.preview }}</span>
          <div class="wb-queue-actions">
            <button type="button" @click="respond(item, 'deny')">{{ t('aiTool.deny') }}</button>
            <button type="button" class="allow" @click="respond(item, 'allow')">{{ t('aiTool.allowOnce') }}</button>
          </div>
        </li>
      </ul>
    </section>

    <section class="wb-section">
      <header class="wb-head">
        <h2>{{ t('aiWorkbench.stats') }}</h2>
      </header>
      <dl class="wb-stats">
        <div><dt>{{ t('aiWorkbench.totalCalls') }}</dt><dd>{{ activeCalls.total }}</dd></div>
        <div><dt>{{ t('aiWorkbench.runningCalls') }}</dt><dd>{{ activeCalls.running }}</dd></div>
        <div><dt>{{ t('aiWorkbench.failedCalls') }}</dt><dd>{{ activeCalls.failed }}</dd></div>
      </dl>
    </section>
  </aside>
</template>

<style scoped>
.workbench {
  display: flex;
  width: 268px;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 16px;
  padding: 18px 14px;
  border-left: 1px solid var(--border-soft);
  background: var(--panel-strong);
  overflow-y: auto;
}

.wb-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wb-head h2 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--text-tertiary);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.wb-count {
  padding: 0 5px;
  border-radius: 999px;
  background: var(--accent);
  color: white;
  font-size: 9px;
}

.wb-workspace {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.wb-path {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 7px 9px;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: var(--panel-muted);
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 10.5px;
  text-align: left;
}

.wb-path span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wb-path:hover {
  border-color: var(--accent);
  color: var(--text-primary);
}

.wb-link {
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent-strong);
  cursor: pointer;
  font: inherit;
  font-size: 10.5px;
}

.wb-empty p {
  margin: 0 0 6px;
  color: var(--text-tertiary);
  font-size: 10.5px;
  line-height: 1.6;
}

.wb-pick {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 11px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: var(--accent);
  color: white;
  cursor: pointer;
  font: inherit;
  font-size: 10.5px;
}

.wb-modes {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.wb-mode {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 7px 9px;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: var(--panel-muted);
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.wb-mode strong {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
}

.wb-mode small {
  color: var(--text-tertiary);
  font-size: 9.5px;
  line-height: 1.5;
}

.wb-mode:hover {
  border-color: var(--accent-soft-border, var(--border-strong));
}

.wb-mode.active {
  border-color: var(--accent);
  background: var(--accent-faint);
}

.wb-mode.active strong {
  color: var(--accent-strong);
}

.wb-queue {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.wb-queue li {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--state-warning-border, #d9a441);
  border-radius: 8px;
  background: var(--state-warning-bg, #fdf6e3);
}

.wb-queue-name {
  color: var(--text-primary);
  font-size: 10.5px;
  font-weight: 600;
}

.wb-queue-preview {
  color: var(--text-secondary);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 9.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wb-queue-actions {
  display: flex;
  gap: 5px;
  justify-content: flex-end;
}

.wb-queue-actions button {
  padding: 3px 8px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--panel-strong);
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 9.5px;
}

.wb-queue-actions .allow {
  border-color: var(--accent);
  background: var(--accent);
  color: white;
}

.wb-stats {
  display: flex;
  gap: 6px;
  margin: 0;
}

.wb-stats div {
  flex: 1;
  padding: 8px;
  border-radius: 8px;
  background: var(--panel-muted);
  text-align: center;
}

.wb-stats dt {
  color: var(--text-tertiary);
  font-size: 9px;
}

.wb-stats dd {
  margin: 3px 0 0;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 650;
}
</style>
