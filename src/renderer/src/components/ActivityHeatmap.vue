<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from '../i18n/useI18n'
import {
  WEEKDAY_LABELS_EN,
  WEEKDAY_LABELS_ZH,
  activityYears,
  buildHeatmap,
  buildYearHeatmap,
  heatLegend,
  type HeatmapCell,
  type HeatmapModel,
} from '../app/heatmap'
import type { ActivityDay } from '../../../shared/settings'

const props = defineProps<{
  days: Record<string, ActivityDay>
  weeks?: number
  /** Days the journal already has an entry for; empty keys stay plain cells. */
  journalDays?: Record<string, true>
}>()

const emit = defineEmits<{ selectDay: [dayKey: string] }>()

const { t, locale } = useI18n()

/** `null` is the trailing twelve months; a number is a single calendar year. */
const selectedYear = ref<number | null>(null)
const years = computed(() => activityYears(props.days, new Date()))

const model = computed<HeatmapModel>(() => {
  const year = selectedYear.value
  if (year === null) return buildHeatmap(props.days, new Date(), props.weeks ?? 53)
  return buildYearHeatmap(props.days, year, new Date())
})
const legend = computed(() => heatLegend(model.value.max || 4))
const weekdayLabels = computed(() => (locale.value === 'en-US' ? WEEKDAY_LABELS_EN : WEEKDAY_LABELS_ZH))
const isEmpty = computed(() => model.value.totalEdits === 0)

/** A past year has no "this week", so the cards show its own span instead. */
const stats = computed(() => {
  const year = selectedYear.value
  if (year === null) {
    return [
      { label: t('home.heatmap.streak'), value: t('home.heatmap.streakUnit', { count: model.value.streak }) },
      { label: t('home.heatmap.activeDays'), value: String(model.value.activeDays) },
      { label: t('home.heatmap.thisWeek'), value: t('home.heatmap.timesUnit', { count: model.value.thisWeek }) },
    ]
  }
  const running = year === new Date().getFullYear()
  return [
    {
      label: running ? t('home.heatmap.streak') : t('home.heatmap.bestStreak'),
      value: t('home.heatmap.streakUnit', { count: running ? model.value.streak : model.value.bestStreak }),
    },
    { label: t('home.heatmap.activeDays'), value: String(model.value.activeDays) },
    { label: t('home.heatmap.total'), value: t('home.heatmap.timesUnit', { count: model.value.totalEdits }) },
  ]
})

function selectYear(event: Event): void {
  const value = Number((event.target as HTMLSelectElement).value)
  selectedYear.value = Number.isFinite(value) && value > 0 ? value : null
}

function cellTitle(date: Date | null, count: number): string {
  if (!date) return ''
  const label = new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'short', day: 'numeric' }).format(date)
  return count > 0
    ? t('home.heatmap.tooltip', { date: label, count })
    : t('home.heatmap.tooltipEmpty', { date: label })
}

/** Screen-reader label for a cell; also tells whether it opens or creates. */
function cellActionLabel(cell: HeatmapCell): string {
  if (!cell.date) return ''
  const label = new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'short', day: 'numeric' }).format(cell.date)
  return props.journalDays?.[cell.key]
    ? t('journal.openDay', { date: label })
    : t('journal.createDay', { date: label })
}

function selectCell(cell: HeatmapCell): void {
  if (cell.date === null) return
  emit('selectDay', cell.key)
}

/**
 * One caption per month now that the builder no longer repeats a month across
 * adjacent columns. Months are at least four columns apart, so they do not
 * overlap even in a narrow window.
 */
const captionWeeks = computed(() => new Set(model.value.monthCaptions.map((caption) => caption.week)))

function monthText(index: number): string {
  const caption = model.value.monthCaptions.find((item) => item.week === index)
  if (!caption) return ''
  // The caption marks the column that holds the 1st of the month, while the
  // column's own first cell often belongs to the previous month. Format the
  // caption's month number rather than reading a date out of the column.
  const month = Number(caption.label)
  if (!Number.isFinite(month) || month < 1 || month > 12) return caption.label
  return new Intl.DateTimeFormat(locale.value, { month: 'short' }).format(new Date(2000, month - 1, 1))
}
</script>

<template>
  <section class="heatmap-card" :aria-label="t('home.heatmap.title')">
    <header class="heatmap-header">
      <div class="heatmap-heading">
        <h2>{{ t('home.heatmap.title') }}</h2>
        <p>{{ selectedYear === null ? t('home.heatmap.subtitle') : t('home.heatmap.subtitleYear', { year: selectedYear }) }}</p>
      </div>
      <div class="heatmap-header-side">
        <div class="heatmap-stats">
          <div v-for="stat in stats" :key="stat.label" class="heatmap-stat">
            <span>{{ stat.label }}</span>
            <strong>{{ stat.value }}</strong>
          </div>
        </div>
        <label class="heatmap-year">
          <span class="sr-only">{{ t('home.heatmap.yearLabel') }}</span>
          <select :value="selectedYear ?? 0" @change="selectYear">
            <option :value="0">{{ t('home.heatmap.yearRecent') }}</option>
            <option v-for="year in years" :key="year" :value="year">{{ year }}</option>
          </select>
        </label>
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
            >{{ captionWeeks.has(index) ? monthText(index) : '' }}</span>
          </div>
          <div class="heatmap-columns">
            <div v-for="(week, weekIndex) in model.weeks" :key="weekIndex" class="heatmap-column">
              <button
                v-for="cell in week.cells"
                :key="`${weekIndex}-${cell.weekday}`"
                type="button"
                class="heatmap-cell"
                :class="[`level-${cell.level}`, { 'is-placeholder': cell.date === null }]"
                :style="{ animationDelay: `${Math.min(weekIndex * 6, 300)}ms` }"
                :title="cellTitle(cell.date, cell.count)"
                :aria-label="cellActionLabel(cell)"
                :tabindex="cell.date === null ? -1 : 0"
                :disabled="cell.date === null"
                @click="selectCell(cell)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <footer class="heatmap-legend">
      <span>{{ t('home.heatmap.legendLess') }}</span>
      <span v-for="entry in legend" :key="entry.level" class="heatmap-cell" :class="`level-${entry.level}`" :title="t('home.heatmap.legendCount', { count: entry.count })" />
      <span>{{ t('home.heatmap.legendMore') }}</span>
      <span class="heatmap-total">
        {{ t('home.heatmap.timesUnit', { count: model.totalEdits }) }}
      </span>
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

.heatmap-heading {
  min-width: 0;
}

.heatmap-header-side {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 16px;
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

.heatmap-year {
  position: relative;
  display: flex;
}

.heatmap-year select {
  height: 26px;
  padding: 0 24px 0 9px;
  border: 1px solid var(--border-soft);
  border-radius: 7px;
  background-color: var(--panel-strong);
  background-image: linear-gradient(45deg, transparent 50%, var(--text-tertiary) 50%),
    linear-gradient(135deg, var(--text-tertiary) 50%, transparent 50%);
  background-position: right 12px center, right 8px center;
  background-repeat: no-repeat;
  background-size: 4px 4px, 4px 4px;
  color: var(--text-primary);
  font: inherit;
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  appearance: none;
  transition: border-color var(--motion-fast) var(--ease-out), background-color var(--motion-fast) var(--ease-out);
}

.heatmap-year select:hover {
  border-color: var(--border-strong);
  background-color: var(--surface-hover);
}

.heatmap-year select:focus-visible {
  outline: 2px solid var(--accent-soft-border);
  outline-offset: 1px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
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
  padding: 0;
  border: 0;
  border-radius: 2.5px;
  background: var(--heat-0);
  animation: heat-in 320ms var(--ease-out) both;
}

button.heatmap-cell {
  cursor: pointer;
  transition: transform var(--motion-fast) var(--ease-out), box-shadow var(--motion-fast) var(--ease-out);
}

button.heatmap-cell:hover {
  transform: scale(1.35);
  box-shadow: 0 0 0 1px var(--accent-soft-border);
}

button.heatmap-cell:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

button.heatmap-cell:disabled {
  cursor: default;
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
