<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from './AppIcon.vue'
import ShizhiMascot from './ShizhiMascot.vue'
import { useUiStore } from '../stores/ui'

const ui = useUiStore()
const activeItem = ref('library')

const navigation = [
  { id: 'home', label: '首页', icon: 'home' },
  { id: 'library', label: '知识库', icon: 'library' },
  { id: 'journal', label: '日志', icon: 'journal' },
  { id: 'assistant', label: 'AI 助手', icon: 'sparkles' },
  { id: 'settings', label: '设置', icon: 'settings' },
]
</script>

<template>
  <aside class="navigation-rail" aria-label="主导航">
    <div class="window-controls" aria-hidden="true">
      <span class="window-dot dot-red" />
      <span class="window-dot dot-amber" />
      <span class="window-dot dot-green" />
    </div>

    <button class="brand" type="button" title="拾知首页" @click="activeItem = 'home'">
      <span class="brand-mark">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M9 7.5h14v17H9z" fill="currentColor" opacity=".2" />
          <path d="M10.5 7.5h11a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3h-11z" fill="none" stroke="currentColor" stroke-width="2" />
          <path d="M13 12h6M13 16h7M13 20h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </span>
      <span v-if="!ui.navigationCollapsed" class="brand-copy">
        <strong>拾知</strong>
        <small>SHIZHI</small>
      </span>
    </button>

    <nav class="navigation-list">
      <button
        v-for="item in navigation"
        :key="item.id"
        class="navigation-item"
        :class="{ active: activeItem === item.id }"
        type="button"
        :title="item.label"
        @click="activeItem = item.id"
      >
        <span class="navigation-icon"><AppIcon :name="item.icon" :size="19" /></span>
        <span v-if="!ui.navigationCollapsed" class="navigation-label">{{ item.label }}</span>
        <span v-if="item.id === 'assistant' && !ui.navigationCollapsed" class="new-badge">NEW</span>
      </button>
    </nav>

    <div class="rail-spacer" />

    <section v-if="ui.companionVisible" class="companion-card" aria-label="今日记录">
      <ShizhiMascot />
      <div v-if="!ui.navigationCollapsed" class="companion-copy">
        <span class="companion-heart">♥</span>
        <span>今日已记录</span>
        <strong>+1</strong>
        <small>继续加油哦～</small>
      </div>
    </section>

    <button
      class="rail-collapse"
      type="button"
      :title="ui.navigationCollapsed ? '展开导航' : '收起导航'"
      @click="ui.navigationCollapsed = !ui.navigationCollapsed"
    >
      <AppIcon :name="ui.navigationCollapsed ? 'chevronRight' : 'chevronLeft'" :size="17" />
    </button>
  </aside>
</template>

<style scoped>
.navigation-rail {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 116px;
  flex: 0 0 auto;
  padding: 16px 12px 14px;
  border-right: 1px solid var(--border-soft);
  background: var(--panel-bg);
  transition: width 180ms ease;
}

.window-controls {
  display: flex;
  gap: 8px;
  height: 20px;
  padding-left: 4px;
  align-items: center;
}

.window-dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.05);
}

.dot-red { background: #fb6158; }
.dot-amber { background: #f9bd30; }
.dot-green { background: #45c948; }

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin: 22px 0 18px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.brand-mark {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 10px;
  background: linear-gradient(145deg, #f0edff, #e4dfff);
  color: #6a58df;
}

.brand-mark svg {
  width: 25px;
  height: 25px;
}

.brand-copy {
  display: flex;
  flex-direction: column;
  line-height: 1;
}

.brand-copy strong {
  font-size: 17px;
  letter-spacing: 0.02em;
}

.brand-copy small {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.16em;
}

.navigation-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.navigation-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 42px;
  padding: 0 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #5e5a6e;
  cursor: pointer;
  text-align: left;
  transition: background 160ms ease, color 160ms ease;
}

.navigation-item:hover {
  background: var(--panel-muted);
  color: var(--text-primary);
}

.navigation-item.active {
  background: var(--accent-faint);
  color: var(--accent-strong);
  font-weight: 650;
}

.navigation-item.active::before {
  position: absolute;
  top: 10px;
  bottom: 10px;
  left: 0;
  width: 3px;
  border-radius: 2px;
  background: var(--accent);
  content: "";
}

.navigation-icon {
  display: grid;
  width: 20px;
  flex: 0 0 auto;
  place-items: center;
}

.navigation-label {
  overflow: hidden;
  white-space: nowrap;
}

.new-badge {
  margin-left: auto;
  padding: 2px 4px;
  border-radius: 4px;
  background: #7c69e8;
  color: white;
  font-size: 7px;
  font-weight: 800;
  letter-spacing: 0.06em;
}

.rail-spacer {
  flex: 1;
}

.companion-card {
  position: relative;
  margin: 0 0 14px;
  padding: 22px 7px 10px;
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(246, 242, 255, 0.2), rgba(243, 239, 255, 0.9));
}

.companion-card :deep(.shizhi-mascot) {
  width: 92px;
  margin: -21px auto 9px;
}

.companion-copy {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  color: var(--text-secondary);
  font-size: 10px;
}

.companion-copy strong {
  margin: 2px 0 1px;
  color: var(--accent-strong);
  font-size: 19px;
}

.companion-copy small {
  color: var(--text-tertiary);
  font-size: 9px;
}

.companion-heart {
  position: absolute;
  top: -53px;
  left: 1px;
  color: #ef75a0;
  font-size: 14px;
  transform: rotate(-12deg);
}

.rail-collapse {
  align-self: center;
  display: grid;
  width: 30px;
  height: 28px;
  place-items: center;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: var(--panel-strong);
  color: var(--text-secondary);
  cursor: pointer;
}

:global(.is-navigation-collapsed) .navigation-rail {
  width: 70px;
  padding-right: 9px;
  padding-left: 9px;
}

:global(.is-navigation-collapsed) .brand-copy,
:global(.is-navigation-collapsed) .navigation-label,
:global(.is-navigation-collapsed) .new-badge {
  display: none;
}

:global(.is-navigation-collapsed) .navigation-item {
  justify-content: center;
  padding: 0;
}

:global(.is-navigation-collapsed) .companion-card {
  padding: 7px;
}

:global(.is-navigation-collapsed) .companion-card :deep(.shizhi-mascot) {
  width: 46px;
  margin: 0 auto;
}

:global(.is-focus-mode) .navigation-rail,
:global(.is-focus-mode) .resource-sidebar {
  display: none;
}
</style>
