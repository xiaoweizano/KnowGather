<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { useDocumentStore } from '../stores/document'
import { useUiStore } from '../stores/ui'
import { useI18n } from '../i18n/useI18n'

const documentStore = useDocumentStore()
const ui = useUiStore()
const { t } = useI18n()
const words = computed(() => documentStore.wordCount)
const readingMinutes = computed(() => Math.max(1, Math.ceil(words.value / 360)))

const saveLabel = computed(() => {
  const phase = documentStore.saveState.phase
  if (phase === 'saving') return t('common.saving')
  if (phase === 'dirty') return t('common.pending')
  if (phase === 'error') return t('common.saveFailed')
  return t('common.saved')
})

const saveTone = computed(() => {
  if (documentStore.saveState.phase === 'error') return 'error'
  if (documentStore.saveState.phase === 'saving' || documentStore.saveState.phase === 'dirty') return 'pending'
  return 'saved'
})
</script>

<template>
  <footer class="status-bar">
    <div class="status-left">
      <span>{{ t('status.words', { count: words }) }}</span>
      <span class="status-divider" />
      <span>{{ t('status.readingTime', { minutes: readingMinutes }) }}</span>
      <span class="save-status" :class="saveTone">
        <span class="status-pulse" />
        {{ saveLabel }}
      </span>
    </div>

    <div class="status-right">
      <button
        type="button"
        class="status-icon"
        :class="{ active: ui.outlineVisible }"
        :title="ui.outlineVisible ? t('editor.outline.hide') : t('editor.outline.show')"
        :aria-pressed="ui.outlineVisible"
        @click="ui.toggleOutline()"
      >
        <AppIcon name="list" :size="16" />
      </button>
      <button
        type="button"
        class="status-icon"
        :class="{ active: ui.contentWidth === 'wide' }"
        :title="ui.contentWidth === 'wide' ? t('status.widthComfortable') : t('status.widthWide')"
        :aria-pressed="ui.contentWidth === 'wide'"
        @click="ui.toggleContentWidth()"
      >
        <AppIcon name="grid" :size="16" />
      </button>
      <button
        type="button"
        class="status-icon"
        :class="{ active: ui.companionVisible }"
        :title="ui.companionVisible ? t('status.hideCompanion') : t('status.showCompanion')"
        :aria-pressed="ui.companionVisible"
        @click="ui.toggleCompanion()"
      >
        <AppIcon name="sparkles" :size="16" />
      </button>
      <div class="zoom-control">
        <button type="button" :title="t('status.zoomOut')" @click="ui.adjustZoom(-10)"><AppIcon name="zoomOut" :size="16" /></button>
        <button type="button" class="zoom-value" :title="t('status.zoomReset')" @click="ui.resetZoom">{{ ui.zoom }}%</button>
        <button type="button" :title="t('status.zoomIn')" @click="ui.adjustZoom(10)"><AppIcon name="zoomIn" :size="16" /></button>
      </div>
      <button
        type="button"
        class="status-icon"
        :class="{ active: ui.focusMode }"
        :title="t('status.focusMode')"
        :aria-pressed="ui.focusMode"
        @click="ui.toggleFocusMode()"
      >
        <AppIcon name="focus" :size="17" />
      </button>
      <button type="button" class="status-icon" :title="ui.sidebarVisible ? t('status.hideSidebar') : t('status.showSidebar')" @click="ui.sidebarVisible = !ui.sidebarVisible"><AppIcon name="panel" :size="17" /></button>
    </div>
  </footer>
</template>

<style scoped>
.status-bar {
  display: flex;
  height: 38px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  padding: 0 19px 0 24px;
  border-top: 1px solid var(--divider-soft);
  background: var(--panel-strong);
  color: var(--text-secondary);
  font-size: 10.5px;
}

.status-left,
.status-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-left strong {
  color: var(--text-row);
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.status-divider {
  width: 1px;
  height: 14px;
  background: var(--border-soft);
}

.save-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: 6px;
  color: var(--text-secondary);
}

.status-pulse {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--state-success-fg);
}

.save-status.pending .status-pulse {
  background: var(--state-warning-fg);
  animation: save-pulse 1.4s ease-in-out infinite;
}

.save-status.error {
  color: var(--danger);
}

.save-status.error .status-pulse {
  background: var(--danger);
}

.zoom-control {
  display: flex;
  height: 26px;
  align-items: center;
  border: 1px solid var(--border-soft);
  border-radius: 7px;
  background: var(--panel-bg);
}

.zoom-control button {
  display: grid;
  height: 24px;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.zoom-control button:first-child,
.zoom-control button:last-child {
  width: 28px;
}

.zoom-value {
  min-width: 48px;
  border-right: 1px solid var(--divider-soft) !important;
  border-left: 1px solid var(--divider-soft) !important;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.status-icon {
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--motion-fast) var(--ease-out), color var(--motion-fast) var(--ease-out);
}

.status-icon:hover {
  background: var(--panel-muted);
}

.status-icon.active {
  border-color: color-mix(in srgb, var(--accent) 34%, var(--border-soft));
  background: var(--accent-faint);
  color: var(--accent-strong);
}

@keyframes save-pulse {
  50% { opacity: 0.35; }
}
</style>
