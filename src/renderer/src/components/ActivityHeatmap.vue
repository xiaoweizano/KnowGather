<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '../i18n/useI18n'
import { WEEKDAY_LABELS_EN, WEEKDAY_LABELS_ZH, buildHeatmap, heatLegend, type HeatmapModel } from '../app/heatmap'
import type { ActivityDay } from '../../../shared/settings'

const props = defineProps<{
  days: Record<string, ActivityDay>
  weeks?: number
}>()

const { t, locale } = useI18n()

const model = computed<HeatmapModel>(() => buildHeatmap(props.days, new Date(), props.weeks ?? 53))
const legend = computed(() => heatLegend(model.value.max || 4))
const weekdayLabels = computed(() => (locale.value === 'en-US' ? WEEKDAY_LABELS_EN : WEEKDAY_LABELS_ZH))
const isEmpty = computed(() => model.value.totalEdits === 0)

function cellTitle(date: Date | null, count: number): string {
  if (!date) return ''
  const label = new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'short', day: 'numeric' }).format(date)
  return count > 0
    ? t('home.heatmap.tooltip', { date: label, count })
    : t('home.heatmap.tooltipEmpty', { date: label })
}

/** Only the first, middle and last month captions stay legible in a narrow card. */
function shouldShowCaption(index: number): boolean {
  const captions = model.value.monthCaptions
  return captions.some((caption, captionIndex) =>
    caption.week === index && (captionIndex === 0 || captionIndex % 2 === 0))
}

function monthText(index: number): string {
  const caption = model.value.monthCaptions.find((item) => item.week === index)
  if (!caption) return ''
  const date = model.value.weeks[index]?.cells.find((cell) => cell.date)?.date
  if (!date) return caption.label
  return new Intl.DateTimeFormat(locale.value, { month: 'short' }).format(date)
}
</script>

<template>
  <section class="heatmap-card" :aria-label="t('home.heatmap.title')">
    <header class="heatmap-header">
      <div>
        <h2>{{ t('home.heatmap.title') }}</h2>
        <p>{{ t('home.heatmap.subtitle') }}</p>
      </div>
      <div class="heatmap-stats">
        <div class="heatmap-stat">
          <span>{{ t('home.heatmap.streak') }}</span>
          <strong>{{ t('home.heatmap.streakUnit', { count: model.streak }) }}</strong>
        </div>
        <div class="heatmap-stat">
          <span>{{ t('home.heatmap.activeDays') }}</span>
          <strong>{{ model.activeDays }}</strong>
        </div>
        <div class="heatmap-stat">
          <span>{{ t('home.heatmap.thisWeek') }}</span>
          <strong>{{ t('home.heatmap.timesUnit', { count: model.thisWeek }) }}</strong>
        </div>
      </div>
    </header>

    <p v-if="isEmpty" class="heatmap-empty">{{ t('home.heatmap.empty') }}</p>

    <div class="heatmap-scroll">
      <div class="heatmap-grid" :class="{ 'is-empty': isEmpty }">
        <div class="heatmap-weekdays" aria-hidden="true">
          <span v-for="(label, index) in weekdayLabels" :key="label" :class="{ hidden: index % 2 === 1 }">{{ label }}</span>
        </div>
        <div class="heatmap-weeks">
          <div class="heatmap-months" aria-hidden="true">
            <span
              v-for="(week, index) in model.weeks"
              :key="`month-${index}`"
              class="heatmap-month"
            >{{ shouldShowCaption(index) ? monthText(index) : '' }}</span>
          </div>
          <div class="heatmap-columns">
            <div v-for="(week, weekIndex) in model.weeks" :key="weekIndex" class="heatmap-column">
              <span
                v-for="cell in week.cells"
                :key="`${weekIndex}-${cell.weekday}`"
                class="heatmap-cell"
                :class="[`level-${cell.level}`, { 'is-placeholder': cell.date === null }]"
                :style="{ animationDelay: `${Math.min(weekIndex * 6, 300)}ms` }"
                :title="cellTitle(cell.date, cell.count)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <footer class="heatmap-legend">
      <span>{{ t('home.heatmap.legendLess') }}</span>
      <span v-for="entry in legend" :key="entry.level" class="heatmap-cell" :class="`level-${entry.level}`" />
      <span>{{ t('home.heatmap.legendMore') }}</span>
      <span class="heatmap-total">{{ t('home.heatmap.timesUnit', { count: model.totalEdits }) }}</span>
    </footer>
  </section>
</template>

<style scoped>
.heatmap-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px;
  border: 1px solid var(--border-soft);
  border-radius: 14px;
  background: var(--panel-strong);
}

.heatmap-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.heatmap-header h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 13px;
}

.heatmap-header p {
  margin: 3px 0 0;
  color: var(--text-tertiary);
  font-size: 10px;
}

.heatmap-stats {
  display: flex;
  gap: 16px;
}

.heatmap-stat {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.heatmap-stat span {
  color: var(--text-tertiary);
  font-size: 9.5px;
}

.heatmap-stat strong {
  color: var(--text-primary);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.heatmap-empty {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--surface-hover);
  color: var(--text-tertiary);
  font-size: 10.5px;
}

.heatmap-scroll {
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: thin;
}

.heatmap-grid {
  display: flex;
  gap: 6px;
  min-width: max-content;
}

.heatmap-weekdays {
  display: grid;
  grid-template-rows: repeat(7, 11px);
  gap: 3px;
  padding-top: 16px;
  color: var(--text-hint);
  font-size: 8.5px;
}

.heatmap-weekdays span {
  line-height: 11px;
  text-align: right;
}

.heatmap-weekdays .hidden {
  visibility: hidden;
}

.heatmap-weeks {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.heatmap-months {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 11px;
  gap: 3px;
  height: 12px;
  color: var(--text-hint);
  font-size: 8.5px;
}

.heatmap-month {
  overflow: visible;
  white-space: nowrap;
}

.heatmap-columns {
  display: flex;
  gap: 3px;
}

.heatmap-column {
  display: grid;
  grid-template-rows: repeat(7, 11px);
  gap: 3px;
}

.heatmap-cell {
  display: block;
  width: 11px;
  height: 11px;
  border-radius: 2.5px;
  background: var(--heat-0);
  animation: heat-in 320ms var(--ease-out) both;
}

.heatmap-cell.level-1 { background: var(--heat-1); }
.heatmap-cell.level-2 { background: var(--heat-2); }
.heatmap-cell.level-3 { background: var(--heat-3); }
.heatmap-cell.level-4 { background: var(--heat-4); }

.heatmap-cell.is-placeholder {
  background: transparent;
  animation: none;
}

.heatmap-grid.is-empty .heatmap-cell {
  opacity: 0.6;
}

.heatmap-legend {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-tertiary);
  font-size: 9.5px;
}

.heatmap-legend .heatmap-cell {
  width: 10px;
  height: 10px;
  animation: none;
}

.heatmap-total {
  margin-left: auto;
  color: var(--text-meta);
}

@keyframes heat-in {
  from { opacity: 0; transform: scale(0.6); }
  to { opacity: 1; transform: scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .heatmap-cell {
    animation: none;
  }
}
</style>
