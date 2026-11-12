<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { useDocumentStore } from '../stores/document'
import { useUiStore } from '../stores/ui'

const documentStore = useDocumentStore()
const ui = useUiStore()
const words = computed(() => documentStore.wordCount)
const readingMinutes = computed(() => Math.max(1, Math.ceil(words.value / 360)))

const saveLabel = computed(() => {
  const phase = documentStore.saveState.phase
  if (phase === 'saving') return '正在保存…'
  if (phase === 'dirty') return '等待保存'
  if (phase === 'error') return '保存失败'
  return '已保存'
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
      <span>字数：<strong>{{ words }}</strong></span>
      <span class="status-divider" />
      <span>阅读时长：约 {{ readingMinutes }} 分钟</span>
      <span class="save-status" :class="saveTone">
        <span class="status-pulse" />
        {{ saveLabel }}
      </span>
    </div>

    <div class="status-right">
      <button
        type="button"
        class="status-icon"
        :class="{ active: ui.contentWidth === 'wide' }"
        :title="ui.contentWidth === 'wide' ? '切换舒适宽度' : '切换宽屏宽度'"
        :aria-pressed="ui.contentWidth === 'wide'"
        @click="ui.toggleContentWidth()"
      >
        <AppIcon name="grid" :size="16" />
      </button>
      <button
        type="button"
        class="status-icon"
        :class="{ active: ui.companionVisible }"
        :title="ui.companionVisible ? '隐藏萌宠' : '显示萌宠'"
        :aria-pressed="ui.companionVisible"
        @click="ui.toggleCompanion()"
      >
        <AppIcon name="sparkles" :size="16" />
      </button>
      <div class="zoom-control">
        <button type="button" title="缩小" @click="ui.adjustZoom(-10)"><AppIcon name="zoomOut" :size="16" /></button>
        <button type="button" class="zoom-value" title="恢复 100% 缩放" @click="ui.resetZoom">{{ ui.zoom }}%</button>
        <button type="button" title="放大" @click="ui.adjustZoom(10)"><AppIcon name="zoomIn" :size="16" /></button>
      </div>
      <button
        type="button"
        class="status-icon"
        :class="{ active: ui.focusMode }"
        title="切换专注模式"
        :aria-pressed="ui.focusMode"
        @click="ui.toggleFocusMode()"
      >
        <AppIcon name="focus" :size="17" />
      </button>
      <button type="button" class="status-icon" :title="ui.sidebarVisible ? '隐藏侧栏' : '显示侧栏'" @click="ui.sidebarVisible = !ui.sidebarVisible"><AppIcon name="panel" :size="17" /></button>
    </div>
  </footer>
</template>

<style scoped>
.status-bar {
  display: flex;
  height: 42px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  padding: 0 19px 0 24px;
  border-top: 1px solid #ebe8f1;
  background: var(--panel-strong);
  color: #85808f;
  font-size: 10.5px;
}

.status-left,
.status-right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.status-left strong {
  color: #5c5767;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.status-divider {
  width: 1px;
  height: 14px;
  background: #e6e2ec;
}

.save-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: 6px;
  color: #8e8998;
}

.status-pulse {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #68b08f;
}

.save-status.pending .status-pulse {
  background: #d3a345;
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
  height: 27px;
  align-items: center;
  border: 1px solid #e6e3ec;
  border-radius: 7px;
  background: var(--panel-bg);
}

.zoom-control button {
  display: grid;
  height: 25px;
  place-items: center;
  border: 0;
  background: transparent;
  color: #736e7d;
  cursor: pointer;
}

.zoom-control button:first-child,
.zoom-control button:last-child {
  width: 29px;
}

.zoom-value {
  min-width: 49px;
  border-right: 1px solid #ebe8f1 !important;
  border-left: 1px solid #ebe8f1 !important;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.status-icon {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 1px solid #e6e3ec;
  border-radius: 7px;
  background: var(--panel-strong);
  color: #716c7c;
  cursor: pointer;
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
