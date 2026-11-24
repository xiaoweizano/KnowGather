<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import ShizhiMascot from './ShizhiMascot.vue'
import ActivityHeatmap from './ActivityHeatmap.vue'
import { useDocumentStore } from '../stores/document'
import { useUiStore } from '../stores/ui'
import { useI18n } from '../i18n/useI18n'
import { formatKnowledgeUpdatedAt } from '../app/knowledgeView'
import { countJournalsForLocalDate, journalDaysSet, todayDayKey } from '../app/knowledgeNavigation'
import { formatJournalDay } from '../app/journalView'

const emit = defineEmits<{
  openDocument: [id: string]
  openJournal: [id: string]
  openJournalDay: [dayKey: string]
  importDocuments: []
  goToLibrary: []
  goToJournal: []
}>()

const documentStore = useDocumentStore()
const ui = useUiStore()
const { t, locale } = useI18n()

const activity = computed(() => documentStore.activity)
const activityLoaded = computed(() => documentStore.activityLoaded)
const greetingIndex = ref(0)

const recentDocuments = computed(() => [...documentStore.documents]
  .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  .slice(0, 5))
const recentJournals = computed(() => documentStore.journals.slice(0, 3))
const todayCount = computed(() => countJournalsForLocalDate(documentStore.journals))
const favoriteDocuments = computed(() => documentStore.documents.filter((document) => document.favorite))
const isEmpty = computed(() =>
  documentStore.documents.length === 0 && documentStore.journals.length === 0 && documentStore.categories.length === 0)

const journalDays = computed(() => journalDaysSet(documentStore.journals))

const companionTip = computed(() => {
  const tips = [t('home.mascot.tip1'), t('home.mascot.tip2'), t('home.mascot.tip3')]
  return tips[greetingIndex.value % tips.length]
})

const mascotMessage = computed(() => todayCount.value > 0
  ? t('home.mascot.todayOne', { count: todayCount.value })
  : t('home.mascot.todayNone'))

onMounted(() => {
  // Shared with the journal page; a failed read only leaves the heatmap empty.
  void documentStore.refreshActivity()
})

function cycleGreeting(): void {
  greetingIndex.value += 1
}

/** The home page is about today, so its primary action writes today's entry. */
function writeToday(): void {
  emit('openJournalDay', todayDayKey())
}

function updatedAt(value: string): string {
  return formatKnowledgeUpdatedAt(value, new Date(), locale.value)
}

function journalDate(value: string): string {
  // Entries belong to the day they were written, not the last edit.
  return formatJournalDay(value, locale.value)
}
</script>

<template>
  <section class="home-page" aria-labelledby="home-heading">
    <header class="home-hero">
      <div class="home-hero-copy">
        <span class="home-eyebrow">{{ t('home.eyebrow') }}</span>
        <h1 id="home-heading">{{ t('home.heading') }}</h1>
        <p>{{ t('home.subtitle') }}</p>
        <div class="home-actions">
          <button type="button" class="home-primary" @click="writeToday">
            <AppIcon name="journal" :size="16" /> {{ t('home.writeJournal') }}
          </button>
          <button type="button" class="home-secondary" @click="emit('importDocuments')">
            <AppIcon name="attachment" :size="16" /> {{ t('home.importDocuments') }}
          </button>
          <button type="button" class="home-secondary" @click="emit('goToJournal')">
            <AppIcon name="journal" :size="16" /> {{ t('home.openJournal') }}
          </button>
        </div>
      </div>
      <button v-if="ui.companionVisible" type="button" class="home-companion" @click="cycleGreeting">
        <ShizhiMascot :variant="ui.companionStyle" :src="ui.customCompanionUrl" />
        <span class="home-companion-bubble">{{ mascotMessage }}</span>
        <small>{{ companionTip }}</small>
      </button>
    </header>

    <div class="home-stats">
      <article class="home-stat">
        <span>{{ t('home.stats.documents') }}</span>
        <strong>{{ documentStore.documents.length }}</strong>
        <small>{{ t('home.stats.documentsHint') }}</small>
      </article>
      <article class="home-stat">
        <span>{{ t('home.stats.journals') }}</span>
        <strong>{{ documentStore.journals.length }}</strong>
        <small>{{ t('home.stats.journalsHint', { count: todayCount }) }}</small>
      </article>
      <article class="home-stat">
        <span>{{ t('home.stats.favorites') }}</span>
        <strong>{{ favoriteDocuments.length }}</strong>
        <small>{{ t('home.stats.favoritesHint') }}</small>
      </article>
      <article class="home-stat">
        <span>{{ t('home.stats.categories') }}</span>
        <strong>{{ documentStore.categories.length }}</strong>
        <small>{{ t('home.stats.categoriesHint') }}</small>
      </article>
    </div>

    <div v-if="isEmpty" class="home-empty">
      <span class="home-empty-mark">{{ t('document.brandLetter') }}</span>
      <strong>{{ t('home.empty.title') }}</strong>
      <span>{{ t('home.empty.body') }}</span>
    </div>

    <template v-else>
      <ActivityHeatmap
        v-if="activityLoaded"
        class="home-heatmap"
        :days="activity.days"
        :journal-days="journalDays"
        @select-day="emit('openJournalDay', $event)"
      />

      <div class="home-columns">
        <section class="home-column" aria-labelledby="home-recent-heading">
          <header class="home-column-heading">
            <h2 id="home-recent-heading">{{ t('home.recent.heading') }}</h2>
            <button type="button" @click="emit('goToLibrary')">{{ t('home.recent.viewAll') }}</button>
          </header>
          <ul v-if="recentDocuments.length" class="home-list">
            <li v-for="document in recentDocuments" :key="document.id">
              <button type="button" class="home-entry" @click="emit('openDocument', document.id)">
                <span class="home-entry-icon"><AppIcon :name="document.favorite ? 'star' : 'file'" :size="16" /></span>
                <span class="home-entry-copy">
                  <strong>{{ document.title }}</strong>
                  <small>{{ updatedAt(document.updatedAt) }}</small>
                </span>
              </button>
            </li>
          </ul>
          <p v-else class="home-empty-note">{{ t('home.recent.empty') }}</p>
        </section>

        <section class="home-column" aria-labelledby="home-journal-heading">
          <header class="home-column-heading">
            <h2 id="home-journal-heading">{{ t('home.journals.heading') }}</h2>
            <button type="button" @click="emit('goToJournal')">{{ t('home.journals.viewAll') }}</button>
          </header>
          <ul v-if="recentJournals.length" class="home-list">
            <li v-for="journal in recentJournals" :key="journal.id">
              <button type="button" class="home-entry" @click="emit('openJournal', journal.id)">
                <span class="home-entry-icon journal"><AppIcon name="journal" :size="16" /></span>
                <span class="home-entry-copy">
                  <strong>{{ journal.title }}</strong>
                  <small>{{ journalDate(journal.createdAt) }}</small>
                </span>
              </button>
            </li>
          </ul>
          <p v-else class="home-empty-note">{{ t('home.journals.empty') }}</p>
        </section>
      </div>
    </template>
  </section>
</template>

<style scoped>
.home-page {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  overflow: auto;
  padding: 30px clamp(20px, 4vw, 56px) 40px;
  background: var(--panel-bg);
  scrollbar-width: thin;
}

.home-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 22px 26px;
  border: 1px solid var(--border-soft);
  border-radius: 16px;
  background: linear-gradient(135deg, var(--accent-faint), var(--panel-strong) 62%);
  animation: home-rise var(--motion-slow) var(--ease-out) both;
}

.home-hero-copy {
  min-width: 0;
}

.home-eyebrow {
  color: var(--accent);
  font-size: 9px;
  font-weight: 750;
  letter-spacing: 0.2em;
}

.home-hero h1 {
  margin: 8px 0 6px;
  color: var(--text-primary);
  font-size: 25px;
  letter-spacing: -0.02em;
}

.home-hero p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
}

.home-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  margin-top: 16px;
}

.home-primary,
.home-secondary {
  display: inline-flex;
  height: 34px;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  border-radius: 9px;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 620;
  transition: transform var(--motion-fast) var(--ease-out), border-color var(--motion-fast) var(--ease-out);
}

.home-primary:hover,
.home-secondary:hover {
  transform: translateY(-1px);
}

.home-primary {
  border: 1px solid var(--accent);
  background: var(--accent);
  color: white;
}

.home-secondary {
  border: 1px solid var(--border-strong);
  background: var(--panel-strong);
  color: var(--text-secondary);
}

.home-secondary:hover {
  color: var(--text-primary);
  border-color: var(--accent);
}

.home-companion {
  display: flex;
  width: 190px;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 12px 12px;
  border: 1px solid var(--accent-soft-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--panel-strong) 86%, transparent);
  cursor: pointer;
  text-align: center;
}

.home-companion :deep(.shizhi-mascot) {
  width: 118px;
}

.home-companion-bubble {
  color: var(--text-primary);
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1.4;
}

.home-companion small {
  color: var(--text-tertiary);
  font-size: 9px;
  line-height: 1.4;
}

.home-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
}

.home-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 14px;
  border: 1px solid var(--border-soft);
  border-radius: 11px;
  background: var(--panel-strong);
  transition: border-color var(--motion-fast) var(--ease-out);
}

.home-stat:hover {
  border-color: var(--accent-soft-border);
}

.home-stat span {
  color: var(--text-secondary);
  font-size: 10px;
}

.home-stat strong {
  color: var(--text-primary);
  font-size: 20px;
  font-variant-numeric: tabular-nums;
}

.home-stat small {
  color: var(--text-tertiary);
  font-size: 9.5px;
}

.home-heatmap {
  animation: home-rise var(--motion-slow) var(--ease-out) 60ms both;
}

.home-columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 14px;
  animation: home-rise var(--motion-slow) var(--ease-out) 120ms both;
}

.home-column {
  padding: 14px 16px;
  border: 1px solid var(--border-soft);
  border-radius: 13px;
  background: var(--panel-strong);
}

.home-column-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.home-column-heading h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 12.5px;
}

.home-column-heading button {
  border: 0;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font: inherit;
  font-size: 10px;
}

.home-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.home-entry {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background var(--motion-fast) var(--ease-out);
}

.home-entry:hover {
  background: var(--panel-muted);
}

.home-entry-icon {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 8px;
  background: var(--accent-faint);
  color: var(--accent);
}

.home-entry-icon.journal {
  background: var(--state-success-bg);
  color: var(--state-success-fg);
}

.home-entry-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.home-entry-copy strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 11.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-entry-copy small {
  color: var(--text-tertiary);
  font-size: 9.5px;
}

.home-empty-note {
  margin: 4px 0 0;
  color: var(--text-tertiary);
  font-size: 10.5px;
}

.home-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: var(--text-secondary);
  font-size: 11px;
}

.home-empty-mark {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 12px;
  background: var(--accent-faint);
  color: var(--accent);
  font-size: 18px;
  font-weight: 700;
}

.home-empty strong {
  color: var(--text-primary);
  font-size: 14px;
}

@keyframes home-rise {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .home-hero,
  .home-heatmap,
  .home-columns {
    animation: none;
  }
}

@media (max-width: 820px) {
  .home-hero {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
