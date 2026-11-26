<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { useUiStore } from '../stores/ui'
import { countDocumentCharacters, useDocumentStore } from '../stores/document'
import { getShizhiApi } from '../services/api'
import { showTrafficLights } from '../../../shared/platform'
import { journalStreak, journalsForLocalDate, type NavigationKey } from '../app/knowledgeNavigation'
import { useI18n } from '../i18n/useI18n'

defineProps<{ activeItem: NavigationKey }>()
const emit = defineEmits<{ navigate: [key: NavigationKey]; openToday: [] }>()

const ui = useUiStore()
const documentStore = useDocumentStore()
const { t } = useI18n()
const platform = getShizhiApi().platform

const todayJournals = computed(() => journalsForLocalDate(documentStore.journals))
const todayEntryCount = computed(() => todayJournals.value.length)
const todayCharacterCount = computed(() =>
  todayJournals.value.reduce((total, journal) => total + countDocumentCharacters(journal.content), 0))
const streak = computed(() => journalStreak(documentStore.journals))
// `time.monthDay` is date-only; it stays correct across midnight only once
// something else re-renders, which is the same trade-off the old card made.
const todayLabel = computed(() => {
  const now = new Date()
  return t('time.monthDay', { month: now.getMonth() + 1, day: now.getDate() })
})

// Width lives on the component instead of a global ancestor selector: scoped
// styles and ancestor overrides end up with equal specificity, so the width was
// previously always won by the default rule.
const railStyle = computed(() => ({
  width: `${ui.navigationCollapsed ? COLLAPSED_RAIL_WIDTH : ui.navigationWidth}px`,
}))

const navigation: Array<{ id: NavigationKey; labelKey: string; icon: string }> = [
  { id: 'home', labelKey: 'nav.home', icon: 'home' },
  // Journal first: it is the daily surface; the library collects what is kept.
  { id: 'journal', labelKey: 'nav.journal', icon: 'journal' },
  { id: 'library', labelKey: 'nav.library', icon: 'library' },
  { id: 'assistant', labelKey: 'nav.assistant', icon: 'sparkles' },
  { id: 'settings', labelKey: 'nav.settings', icon: 'settings' },
]

const COLLAPSED_RAIL_WIDTH = 70
</script>

<template>
  <aside
    v-if="!ui.focusMode"
    class="navigation-rail"
    :class="{ collapsed: ui.navigationCollapsed }"
    :style="railStyle"
    :aria-label="t('nav.aria')"
  >
    <div v-if="showTrafficLights(platform)" class="window-controls" aria-hidden="true">
      <span class="window-dot dot-red" />
      <span class="window-dot dot-amber" />
      <span class="window-dot dot-green" />
    </div>

    <button class="brand" type="button" :title="t('nav.brandHome')" @click="emit('navigate', 'home')">
      <span class="brand-mark">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M9 7.5h14v17H9z" fill="currentColor" opacity=".2" />
          <path d="M10.5 7.5h11a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3h-11z" fill="none" stroke="currentColor" stroke-width="2" />
          <path d="M13 12h6M13 16h7M13 20h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </span>
      <span v-if="!ui.navigationCollapsed" class="brand-copy">
        <strong>{{ t('common.appName') }}</strong>
        <small>{{ t('common.appTagline') }}</small>
      </span>
    </button>

    <nav class="navigation-list">
      <button
        v-for="item in navigation"
        :key="item.id"
        class="navigation-item"
        :class="{ active: activeItem === item.id }"
        type="button"
        :data-nav="item.id"
        :title="t(item.labelKey)"
        @click="emit('navigate', item.id)"
      >
        <span class="navigation-icon"><AppIcon :name="item.icon" :size="19" /></span>
        <span v-if="!ui.navigationCollapsed" class="navigation-label">{{ t(item.labelKey) }}</span>
      </button>
    </nav>

    <div class="rail-spacer" />

    <section v-if="!ui.navigationCollapsed" class="today-card" :aria-label="t('nav.todaySummaryAria')">
      <span class="today-date">{{ todayLabel }}</span>
      <div class="today-stats">
        <span><strong>{{ todayCharacterCount }}</strong>{{ t('nav.todayChars') }}</span>
        <span><strong>{{ todayEntryCount }}</strong>{{ t('nav.todayEntries') }}</span>
      </div>
      <span v-if="streak > 0" class="today-streak">
        <AppIcon name="flame" :size="12" /> {{ t('nav.todayStreak', { count: streak }) }}
      </span>
      <span v-else class="today-streak muted">{{ t('nav.todayNoStreak') }}</span>
      <button type="button" class="today-open" @click="emit('openToday')">{{ t('nav.todayOpen') }}</button>
    </section>

    <!-- Collapsed rail has no room for the numbers; the flame keeps the streak
         visible and the click still opens today's entry. -->
    <button
      v-else
      type="button"
      class="today-compact"
      :title="t('nav.todaySummaryTitle', { date: todayLabel, chars: todayCharacterCount, count: todayEntryCount })"
      :aria-label="t('nav.todaySummaryAria')"
      @click="emit('openToday')"
    >
      <AppIcon name="flame" :size="17" />
      <span v-if="streak > 0">{{ streak }}</span>
    </button>

    <button
      class="rail-collapse"
      type="button"
      :title="ui.navigationCollapsed ? t('nav.expand') : t('nav.collapse')"
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
  flex: 0 0 auto;
  /* Without this a flex item refuses to shrink below its content width, so the
     collapsed width was overridden by the widest child (the mascot card). */
  min-width: 0;
  overflow: hidden;
  padding: 16px 12px 14px;
  border-right: 1px solid var(--border-soft);
  background: var(--panel-bg);
  transition: width 180ms ease, padding 180ms ease;
}

.navigation-rail.collapsed {
  padding-right: 9px;
  padding-left: 9px;
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

.rail-spacer {
  flex: 1;
}

.today-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 0 14px;
  padding: 11px 12px 9px;
  border: 1px solid var(--border-soft);
  border-radius: 12px;
  background: var(--panel-muted);
}

.today-date {
  color: var(--text-tertiary);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.today-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 10px;
  color: var(--text-secondary);
  font-size: 10px;
}

.today-stats span {
  display: flex;
  align-items: baseline;
  gap: 3px;
  white-space: nowrap;
}

.today-stats strong {
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.today-streak {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--accent-strong);
  font-size: 10px;
  font-weight: 600;
}

.today-streak.muted {
  color: var(--text-tertiary);
  font-weight: 400;
}

.today-open {
  width: 100%;
  margin-top: 2px;
  padding: 5px 0;
  overflow: hidden;
  border: 0;
  border-radius: 8px;
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: background 160ms ease;
}

.today-open:hover {
  background: var(--accent-soft-border);
}

.today-compact {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  margin: 0 0 14px;
  padding: 9px 0;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: var(--panel-muted);
  color: var(--accent-strong);
  font-size: 11px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.today-compact:hover {
  background: var(--accent-soft);
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

/*
 * Collapsed and focus states are bound through component state (the `collapsed`
 * class and a v-if) rather than ancestor selectors. Vue's scoped compiler gives
 * scoped rules and ancestor overrides equal specificity, so ancestor-based rules
 * used to lose against the component's own default width.
 */
.navigation-rail.collapsed .brand-copy,
.navigation-rail.collapsed .navigation-label {
  display: none;
}

.navigation-rail.collapsed .navigation-item {
  justify-content: center;
  padding: 0;
}
</style>
