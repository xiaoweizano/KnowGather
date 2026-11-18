<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import ShizhiMascot from './ShizhiMascot.vue'
import { useUiStore, ACCENT_OPTIONS, CODE_FONT_OPTIONS, COMPANION_STYLES, FONT_OPTIONS, MOTION_OPTIONS, type AccentColor, type CompanionStyle, type MotionPreference, type ThemePreference } from '../stores/ui'
import { useDocumentStore } from '../stores/document'
import { useSettingsStore } from '../stores/settings'
import { useI18n } from '../i18n/useI18n'
import { SUPPORTED_LOCALES } from '../i18n'
import { getShizhiApi } from '../services/api'
import {
  EDITOR_SHORTCUTS,
  SHORTCUT_DEFINITIONS,
  bindingFromEvent,
  defaultShortcuts,
  findConflict,
  normalizeBinding,
  readShortcuts,
  shortcutLabelKey,
  writeShortcuts,
  type AppCommandId,
  type ShortcutMap,
} from '../app/shortcuts'
import type { UpdateCheckResult } from '../../../shared/settings'

const ui = useUiStore()
const documentStore = useDocumentStore()
const settingsStore = useSettingsStore()
const { t, locale } = useI18n()
const api = getShizhiApi()

type Section = 'general' | 'editor' | 'appearance' | 'shortcuts' | 'data' | 'about'
const section = ref<Section>('general')
const sections: ReadonlyArray<{ id: Section; labelKey: string; icon: string }> = [
  { id: 'general', labelKey: 'settings.nav.general', icon: 'settings' },
  { id: 'editor', labelKey: 'settings.nav.editor', icon: 'edit' },
  { id: 'appearance', labelKey: 'settings.nav.appearance', icon: 'palette' },
  { id: 'shortcuts', labelKey: 'settings.nav.shortcuts', icon: 'keyboard' },
  { id: 'data', labelKey: 'settings.nav.data', icon: 'library' },
  { id: 'about', labelKey: 'settings.nav.about', icon: 'info' },
]

const shortcuts = ref<ShortcutMap>(defaultShortcuts())
const capturing = ref<AppCommandId | null>(null)
const shortcutError = ref<string | null>(null)
const shortcutQuery = ref('')
const updateBusy = ref(false)
const updateResult = ref<UpdateCheckResult | null>(null)
const feedDraft = ref('')
const companionBusy = ref(false)
const companionError = ref<string | null>(null)
const exportBusy = ref(false)
const actionMessage = ref<string | null>(null)

const appInfo = computed(() => settingsStore.appInfo)
const settings = computed(() => settingsStore.settings)

const filteredShortcuts = computed(() => {
  const query = shortcutQuery.value.trim().toLocaleLowerCase()
  if (!query) return SHORTCUT_DEFINITIONS
  return SHORTCUT_DEFINITIONS.filter((definition) =>
    t(definition.labelKey).toLocaleLowerCase().includes(query)
    || shortcuts.value[definition.id].toLocaleLowerCase().includes(query))
})

const editorShortcuts = computed(() => {
  const query = shortcutQuery.value.trim().toLocaleLowerCase()
  if (!query) return EDITOR_SHORTCUTS
  return EDITOR_SHORTCUTS.filter((entry) =>
    t(entry.labelKey).toLocaleLowerCase().includes(query) || entry.binding.toLocaleLowerCase().includes(query))
})

const runtimeLabel = computed(() => appInfo.value
  ? t('settings.aboutRuntime', { electron: appInfo.value.electron || '—', chrome: appInfo.value.chrome || '—' })
  : '—')

onMounted(async () => {
  shortcuts.value = readShortcuts()
  await settingsStore.load()
  feedDraft.value = settings.value.updateFeedUrl
})

function toggle(value: boolean, setter: (next: boolean) => void): void {
  setter(!value)
}

async function updateSetting<K extends keyof typeof settings.value>(key: K, value: (typeof settings.value)[K]): Promise<void> {
  await settingsStore.update({ [key]: value } as never)
}

async function changeLocale(next: 'zh-CN' | 'en-US'): Promise<void> {
  await settingsStore.setLocalePreference(next)
}

async function saveFeed(): Promise<void> {
  const normalized = feedDraft.value.trim()
  const ok = await settingsStore.update({ updateFeedUrl: normalized })
  if (ok) feedDraft.value = settings.value.updateFeedUrl
}

async function checkUpdates(): Promise<void> {
  if (updateBusy.value) return
  updateBusy.value = true
  updateResult.value = null
  try {
    updateResult.value = await api.update.check(settings.value.updateFeedUrl || null)
    if (updateResult.value.status === 'available' && updateResult.value.url) {
      // Surfaced, never auto-opened: the user decides whether to download.
      actionMessage.value = updateResult.value.url
    }
  } catch (cause) {
    updateResult.value = {
      status: 'error',
      currentVersion: appInfo.value?.version ?? '—',
      message: cause instanceof Error ? cause.message : String(cause),
    }
  } finally {
    updateBusy.value = false
  }
}

async function openDownload(): Promise<void> {
  const url = updateResult.value?.url
  if (!url) return
  await api.app.openExternal(url)
}

async function exportAll(): Promise<void> {
  if (exportBusy.value) return
  exportBusy.value = true
  try {
    const result = await settingsStore.exportAll()
    actionMessage.value = result.saved ? t('settings.exportDone') : null
  } catch {
    actionMessage.value = t('settings.exportFailed')
  } finally {
    exportBusy.value = false
  }
}

async function pickCompanionImage(): Promise<void> {
  if (companionBusy.value) return
  companionBusy.value = true
  companionError.value = null
  try {
    const references = await api.attachments.pickImages()
    const first = references[0]
    if (first) ui.setCustomCompanion(first.url)
  } catch {
    companionError.value = t('settings.companion.uploadFailed')
  } finally {
    companionBusy.value = false
  }
}

function startCapture(id: AppCommandId): void {
  capturing.value = id
  shortcutError.value = null
}

function handleCapture(event: KeyboardEvent): void {
  if (!capturing.value) return
  event.preventDefault()
  event.stopPropagation()
  if (event.key === 'Escape') {
    capturing.value = null
    return
  }
  const binding = bindingFromEvent(event)
  if (!binding) return
  const conflict = findConflict(shortcuts.value, capturing.value, binding)
  if (conflict.conflictingId) {
    shortcutError.value = t('shortcuts.conflict', { name: t(shortcutLabelKey(conflict.conflictingId)) })
    return
  }
  shortcuts.value = { ...shortcuts.value, [capturing.value]: normalizeBinding(binding) }
  writeShortcuts(shortcuts.value)
  shortcutError.value = null
  capturing.value = null
}

function resetShortcut(id: AppCommandId): void {
  const definition = SHORTCUT_DEFINITIONS.find((item) => item.id === id)
  if (!definition) return
  shortcuts.value = { ...shortcuts.value, [id]: definition.defaultBinding }
  writeShortcuts(shortcuts.value)
}

function resetAllShortcuts(): void {
  shortcuts.value = defaultShortcuts()
  writeShortcuts(shortcuts.value)
}

function accentStyle(value: AccentColor): Record<string, string> {
  const presets: Record<AccentColor, string> = {
    violet: '#7969e8',
    mint: '#2fa581',
    cream: '#d19a3c',
    sakura: '#e07098',
    ocean: '#3b86c9',
  }
  return { '--swatch': presets[value] }
}

function setAccent(value: AccentColor): void {
  ui.setAccent(value)
}

function setTheme(next: ThemePreference): void {
  ui.setThemePreference(next)
}

function setMotion(next: MotionPreference): void {
  ui.setMotion(next)
}

function setCompanionStyle(next: CompanionStyle): void {
  ui.setCompanionStyle(next)
}

function platformLabel(): string {
  const platform = appInfo.value?.platform ?? api.platform
  return platform === 'darwin' ? 'macOS' : platform === 'win32' ? 'Windows' : platform
}
</script>

<template>
  <section class="settings-page" tabindex="-1" @keydown="handleCapture">
    <header class="settings-header">
      <div>
        <span class="settings-eyebrow">SETTINGS</span>
        <h1>{{ t('settings.title') }}</h1>
        <p>{{ t('settings.subtitle') }}</p>
      </div>
    </header>

    <div class="settings-body">
      <nav class="settings-nav" :aria-label="t('settings.title')">
        <button
          v-for="entry in sections"
          :key="entry.id"
          type="button"
          class="settings-nav-item"
          :class="{ active: section === entry.id }"
          :data-settings-section="entry.id"
          @click="section = entry.id"
        >
          <AppIcon :name="entry.icon" :size="16" />
          <span>{{ t(entry.labelKey) }}</span>
        </button>
      </nav>

      <div class="settings-content">
        <!-- ------------------------------------------------------------ general -->
        <section v-if="section === 'general'" class="settings-group" :aria-label="t('settings.section.general')">
          <h2>{{ t('settings.section.general') }}</h2>

          <div class="settings-row">
            <div class="settings-copy">
              <strong>{{ t('settings.language') }}</strong>
              <small>{{ t('settings.languageHint') }}</small>
            </div>
            <div class="segmented">
              <button
                v-for="option in SUPPORTED_LOCALES"
                :key="option.value"
                type="button"
                :class="{ active: locale === option.value }"
                @click="changeLocale(option.value)"
              >{{ option.label }}</button>
            </div>
          </div>

          <div class="settings-row">
            <div class="settings-copy">
              <strong>{{ t('settings.autoLaunch') }}</strong>
              <small>{{ settingsStore.autoLaunchSupported ? t('settings.autoLaunchHint') : t('settings.installedOnly') }}</small>
            </div>
            <button
              type="button"
              class="toggle"
              role="switch"
              :aria-checked="settings.autoLaunch"
              :class="{ on: settings.autoLaunch }"
              @click="settingsStore.setAutoLaunch(!settings.autoLaunch)"
            ><span /></button>
          </div>

          <div class="settings-row">
            <div class="settings-copy">
              <strong>{{ t('settings.silentStart') }}</strong>
              <small>{{ t('settings.silentStartHint') }}</small>
            </div>
            <button
              type="button"
              class="toggle"
              role="switch"
              :aria-checked="settings.silentStart"
              :class="{ on: settings.silentStart }"
              @click="updateSetting('silentStart', !settings.silentStart)"
            ><span /></button>
          </div>

          <div class="settings-row">
            <div class="settings-copy">
              <strong>{{ t('settings.hideFromTaskbar') }}</strong>
              <small>{{ t('settings.hideFromTaskbarHint') }}</small>
            </div>
            <button
              type="button"
              class="toggle"
              role="switch"
              :aria-checked="settings.hideFromTaskbar"
              :class="{ on: settings.hideFromTaskbar }"
              @click="settingsStore.setTaskbarVisible(settings.hideFromTaskbar)"
            ><span /></button>
          </div>

          <div class="settings-row">
            <div class="settings-copy">
              <strong>{{ t('settings.closeToTray') }}</strong>
              <small>{{ t('settings.closeToTrayHint') }}</small>
            </div>
            <button
              type="button"
              class="toggle"
              role="switch"
              :aria-checked="settings.closeToTray"
              :class="{ on: settings.closeToTray }"
              @click="updateSetting('closeToTray', !settings.closeToTray)"
            ><span /></button>
          </div>

          <div class="settings-row">
            <div class="settings-copy">
              <strong>{{ t('settings.minimizeToTray') }}</strong>
              <small>{{ t('settings.minimizeToTrayHint') }}</small>
            </div>
            <button
              type="button"
              class="toggle"
              role="switch"
              :aria-checked="settings.minimizeToTray"
              :class="{ on: settings.minimizeToTray }"
              @click="updateSetting('minimizeToTray', !settings.minimizeToTray)"
            ><span /></button>
          </div>

          <div class="settings-row">
            <div class="settings-copy">
              <strong>{{ t('settings.autoUpdate') }}</strong>
              <small>{{ t('settings.autoUpdateHint') }}</small>
            </div>
            <button
              type="button"
              class="toggle"
              role="switch"
              :aria-checked="settings.autoCheckUpdates"
              :class="{ on: settings.autoCheckUpdates }"
              @click="updateSetting('autoCheckUpdates', !settings.autoCheckUpdates)"
            ><span /></button>
          </div>

          <div class="settings-row stacked">
            <div class="settings-copy">
              <strong>{{ t('settings.updateFeed') }}</strong>
              <small>{{ t('settings.updateFeedHint') }}</small>
            </div>
            <div class="settings-inline">
              <input
                v-model="feedDraft"
                class="settings-input"
                type="url"
                :placeholder="t('settings.updateFeedPlaceholder')"
                @blur="saveFeed"
                @keydown.enter.prevent="saveFeed"
              />
              <button type="button" class="settings-small primary" :disabled="updateBusy" @click="checkUpdates">
                {{ updateBusy ? t('settings.checking') : t('settings.checkUpdate') }}
              </button>
            </div>
            <p v-if="updateResult" class="settings-note" :class="updateResult.status">
              <template v-if="updateResult.status === 'not-configured'">{{ t('update.notConfigured') }}</template>
              <template v-else-if="updateResult.status === 'up-to-date'">{{ t('update.upToDate', { version: updateResult.latestVersion ?? updateResult.currentVersion }) }}</template>
              <template v-else-if="updateResult.status === 'available'">
                {{ t('update.available', { version: updateResult.latestVersion ?? '' }) }}
                <button v-if="updateResult.url" type="button" class="settings-link" @click="openDownload">{{ t('update.download') }}</button>
              </template>
              <template v-else>{{ t('update.error', { message: updateResult.message ?? '' }) }}</template>
            </p>
          </div>
        </section>

        <!-- ------------------------------------------------------------- editor -->
        <section v-if="section === 'editor'" class="settings-group" :aria-label="t('settings.section.editor')">
          <h2>{{ t('settings.section.editor') }}</h2>

          <div v-for="option in [
            { key: 'outline', label: 'settings.outline', hint: 'settings.outlineHint', get: ui.outlineVisible, set: ui.setOutlineVisible },
            { key: 'fold', label: 'settings.foldHeadings', hint: 'settings.foldHeadingsHint', get: ui.foldHeadings, set: ui.setFoldHeadings },
            { key: 'lines', label: 'settings.lineNumbers', hint: 'settings.lineNumbersHint', get: ui.showLineNumbers, set: ui.setShowLineNumbers },
            { key: 'guides', label: 'settings.indentGuides', hint: 'settings.indentGuidesHint', get: ui.indentGuides, set: ui.setIndentGuides },
            { key: 'hanging', label: 'settings.hangingIndent', hint: 'settings.hangingIndentHint', get: ui.hangingIndent, set: ui.setHangingIndent },
          ]" :key="option.key" class="settings-row">
            <div class="settings-copy">
              <strong>{{ t(option.label) }}</strong>
              <small>{{ t(option.hint) }}</small>
            </div>
            <button
              type="button"
              class="toggle"
              role="switch"
              :aria-checked="option.get"
              :class="{ on: option.get }"
              @click="toggle(option.get, option.set)"
            ><span /></button>
          </div>

          <div class="settings-row">
            <div class="settings-copy">
              <strong>{{ t('settings.lineHeight') }}</strong>
              <small>{{ t('settings.lineHeightHint') }} · {{ ui.lineHeight.toFixed(2) }}</small>
            </div>
            <input class="settings-range" type="range" min="1.3" max="2.2" step="0.02" :value="ui.lineHeight" @input="ui.setLineHeight(Number(($event.target as HTMLInputElement).value))" />
          </div>

          <div class="settings-row">
            <div class="settings-copy">
              <strong>{{ t('settings.paragraphSpacing') }}</strong>
              <small>{{ t('settings.paragraphSpacingHint') }} · {{ ui.paragraphSpacing.toFixed(2) }}em</small>
            </div>
            <input class="settings-range" type="range" min="0" max="1.2" step="0.02" :value="ui.paragraphSpacing" @input="ui.setParagraphSpacing(Number(($event.target as HTMLInputElement).value))" />
          </div>

          <div class="settings-row">
            <div class="settings-copy">
              <strong>{{ t('settings.contentWidth') }}</strong>
              <small>{{ t('settings.contentWidthHint') }}</small>
            </div>
            <div class="segmented">
              <button type="button" :class="{ active: ui.contentWidth === 'comfortable' }" @click="ui.setContentWidth('comfortable')">{{ t('settings.widthComfortable') }}</button>
              <button type="button" :class="{ active: ui.contentWidth === 'wide' }" @click="ui.setContentWidth('wide')">{{ t('settings.widthWide') }}</button>
            </div>
          </div>

          <div class="settings-row">
            <div class="settings-copy">
              <strong>{{ t('settings.zoom') }}</strong>
              <small>{{ t('settings.zoomHint', { value: ui.zoom }) }}</small>
            </div>
            <div class="settings-controls">
              <button type="button" class="settings-small" @click="ui.adjustZoom(-10)">{{ t('settings.zoomOut') }}</button>
              <button type="button" class="settings-small" @click="ui.resetZoom()">{{ t('settings.zoomReset') }}</button>
              <button type="button" class="settings-small" @click="ui.adjustZoom(10)">{{ t('settings.zoomIn') }}</button>
            </div>
          </div>
        </section>

        <!-- --------------------------------------------------------- appearance -->
        <section v-if="section === 'appearance'" class="settings-group" :aria-label="t('settings.section.appearance')">
          <h2>{{ t('settings.section.appearance') }}</h2>

          <div class="settings-row">
            <div class="settings-copy">
              <strong>{{ t('settings.theme') }}</strong>
              <small>{{ t('settings.themeHint', { name: t(`settings.theme.${ui.themePreference}`) }) }}</small>
            </div>
            <div class="segmented">
              <button type="button" :class="{ active: ui.themePreference === 'light' }" @click="setTheme('light')">{{ t('settings.theme.light') }}</button>
              <button type="button" :class="{ active: ui.themePreference === 'dark' }" @click="setTheme('dark')">{{ t('settings.theme.dark') }}</button>
              <button type="button" :class="{ active: ui.themePreference === 'system' }" @click="setTheme('system')">{{ t('settings.theme.system') }}</button>
            </div>
          </div>

          <div class="settings-row">
            <div class="settings-copy">
              <strong>{{ t('settings.accent') }}</strong>
              <small>{{ t('settings.accentHint') }}</small>
            </div>
            <div class="swatch-row">
              <button
                v-for="value in ACCENT_OPTIONS"
                :key="value"
                type="button"
                class="accent-swatch"
                :class="{ active: ui.accent === value }"
                :style="accentStyle(value)"
                :title="t(`settings.accent.${value}`)"
                :aria-label="t(`settings.accent.${value}`)"
                @click="setAccent(value)"
              />
            </div>
          </div>

          <div class="settings-row">
            <div class="settings-copy">
              <strong>{{ t('settings.font.ui') }}</strong>
            </div>
            <select class="settings-select" :value="ui.uiFont" @change="ui.setUiFont(($event.target as HTMLSelectElement).value)">
              <option v-for="option in FONT_OPTIONS" :key="option.value" :value="option.value">{{ option.value === 'system' ? t('settings.font.system') : option.label }}</option>
            </select>
          </div>

          <div class="settings-row">
            <div class="settings-copy">
              <strong>{{ t('settings.font.body') }}</strong>
            </div>
            <select class="settings-select" :value="ui.bodyFont" @change="ui.setBodyFont(($event.target as HTMLSelectElement).value)">
              <option v-for="option in FONT_OPTIONS" :key="option.value" :value="option.value">{{ option.value === 'system' ? t('settings.font.system') : option.label }}</option>
            </select>
          </div>

          <div class="settings-row">
            <div class="settings-copy">
              <strong>{{ t('settings.font.code') }}</strong>
            </div>
            <select class="settings-select" :value="ui.codeFont" @change="ui.setCodeFont(($event.target as HTMLSelectElement).value)">
              <option v-for="option in CODE_FONT_OPTIONS" :key="option.value" :value="option.value">{{ option.value === 'system' ? t('settings.font.system') : option.label }}</option>
            </select>
          </div>

          <div class="settings-row">
            <div class="settings-copy">
              <strong>{{ t('settings.fontSize.ui') }}</strong>
              <small>{{ ui.uiFontSize }}px</small>
            </div>
            <input class="settings-range" type="range" min="10" max="20" step="1" :value="ui.uiFontSize" @input="ui.setUiFontSize(Number(($event.target as HTMLInputElement).value))" />
          </div>

          <div class="settings-row">
            <div class="settings-copy">
              <strong>{{ t('settings.fontSize.body') }}</strong>
              <small>{{ ui.bodyFontSize }}px</small>
            </div>
            <input class="settings-range" type="range" min="12" max="24" step="1" :value="ui.bodyFontSize" @input="ui.setBodyFontSize(Number(($event.target as HTMLInputElement).value))" />
          </div>

          <div class="settings-row">
            <div class="settings-copy">
              <strong>{{ t('settings.motion') }}</strong>
              <small>{{ t('settings.motionHint') }}</small>
            </div>
            <div class="segmented">
              <button
                v-for="value in MOTION_OPTIONS"
                :key="value"
                type="button"
                :class="{ active: ui.motion === value }"
                @click="setMotion(value)"
              >{{ t(`settings.motion.${value}`) }}</button>
            </div>
          </div>

          <div class="settings-row">
            <div class="settings-copy">
              <strong>{{ t('settings.companion') }}</strong>
              <small>{{ t('settings.companionHint') }}</small>
            </div>
            <button
              type="button"
              class="toggle"
              role="switch"
              :aria-checked="ui.companionVisible"
              :class="{ on: ui.companionVisible }"
              @click="ui.toggleCompanion()"
            ><span /></button>
          </div>

          <div class="settings-row stacked">
            <div class="settings-copy">
              <strong>{{ t('settings.companionStyle') }}</strong>
              <small>{{ t('settings.companion.uploadHint') }}</small>
            </div>
            <div class="companion-grid">
              <button
                v-for="style in COMPANION_STYLES"
                :key="style"
                type="button"
                class="companion-option"
                :class="{ active: ui.companionStyle === style }"
                :title="t(`settings.companion.style.${style}`)"
                @click="setCompanionStyle(style)"
              >
                <ShizhiMascot :variant="style" compact />
                <span>{{ t(`settings.companion.style.${style}`) }}</span>
              </button>
              <button
                type="button"
                class="companion-option custom"
                :class="{ active: ui.companionStyle === 'custom' }"
                :title="t('settings.companion.style.custom')"
                @click="pickCompanionImage"
              >
                <ShizhiMascot v-if="ui.customCompanionUrl" variant="custom" :src="ui.customCompanionUrl" compact />
                <span v-else class="companion-placeholder"><AppIcon name="image" :size="18" /></span>
                <span>{{ companionBusy ? t('settings.companion.uploading') : t('settings.companion.style.custom') }}</span>
              </button>
            </div>
            <p v-if="companionError" class="settings-note error">{{ companionError }}</p>
            <button v-if="ui.customCompanionUrl" type="button" class="settings-small" @click="ui.clearCustomCompanion()">{{ t('settings.companion.reset') }}</button>
          </div>

          <div class="settings-row">
            <div class="settings-copy">
              <strong>{{ t('settings.focusMode') }}</strong>
              <small>{{ t('settings.focusModeHint') }}</small>
            </div>
            <button
              type="button"
              class="toggle"
              role="switch"
              :aria-checked="ui.focusMode"
              :class="{ on: ui.focusMode }"
              @click="ui.toggleFocusMode()"
            ><span /></button>
          </div>
        </section>

        <!-- ---------------------------------------------------------- shortcuts -->
        <section v-if="section === 'shortcuts'" class="settings-group" :aria-label="t('settings.section.shortcuts')">
          <h2>{{ t('settings.section.shortcuts') }}</h2>
          <div class="settings-inline spread">
            <input v-model="shortcutQuery" class="settings-input" type="search" :placeholder="t('shortcuts.searchPlaceholder')" />
            <button type="button" class="settings-small" @click="resetAllShortcuts">{{ t('shortcuts.resetAll') }}</button>
          </div>
          <p class="settings-note">{{ t('settings.shortcutsHint') }}</p>

          <div
            v-for="definition in filteredShortcuts"
            :key="definition.id"
            class="settings-row"
          >
            <div class="settings-copy">
              <strong>{{ t(definition.labelKey) }}</strong>
            </div>
            <div class="shortcut-row">
              <button
                type="button"
                class="shortcut-key"
                :class="{ capturing: capturing === definition.id }"
                @click="startCapture(definition.id)"
              >{{ capturing === definition.id ? t('shortcuts.pressToRecord') : shortcuts[definition.id] }}</button>
              <button type="button" class="settings-small" :title="t('shortcuts.reset')" @click="resetShortcut(definition.id)">{{ t('shortcuts.reset') }}</button>
            </div>
          </div>

          <p v-if="shortcutError" class="settings-note error">{{ shortcutError }}</p>

          <h3 class="settings-subheading">{{ t('shortcuts.group.text') }} · {{ t('settings.shortcutEditorHint') }}</h3>
          <div class="editor-shortcuts">
            <div v-for="entry in editorShortcuts" :key="`${entry.labelKey}-${entry.binding}`" class="editor-shortcut">
              <span>{{ t(entry.labelKey) }}</span>
              <kbd>{{ entry.binding }}</kbd>
            </div>
          </div>
        </section>

        <!-- --------------------------------------------------------------- data -->
        <section v-if="section === 'data'" class="settings-group" :aria-label="t('settings.section.data')">
          <h2>{{ t('settings.section.data') }}</h2>

          <div class="settings-row readonly">
            <div class="settings-copy">
              <strong>{{ t('settings.storage') }}</strong>
              <small>{{ t('settings.storageHint') }}</small>
            </div>
            <span class="settings-value">{{ t('settings.storageFile') }}</span>
          </div>

          <div class="settings-row">
            <div class="settings-copy">
              <strong>{{ t('settings.contentCount') }}</strong>
              <small>{{ t('settings.contentCountHint') }}</small>
            </div>
            <span class="settings-value">
              {{ t('settings.contentCountValue', {
                documents: documentStore.documents.length,
                journals: documentStore.journals.length,
                categories: documentStore.categories.length,
              }) }}
            </span>
          </div>

          <div class="settings-row">
            <div class="settings-copy">
              <strong>{{ t('settings.openDataFolder') }}</strong>
            </div>
            <button type="button" class="settings-small" @click="settingsStore.openDataFolder()">{{ t('settings.openDataFolder') }}</button>
          </div>

          <div class="settings-row">
            <div class="settings-copy">
              <strong>{{ t('settings.exportAll') }}</strong>
              <small>{{ t('settings.exportHint') }}</small>
            </div>
            <button type="button" class="settings-small" :disabled="exportBusy" @click="exportAll">
              {{ exportBusy ? t('settings.exporting') : t('settings.exportAll') }}
            </button>
          </div>
          <p v-if="actionMessage" class="settings-note">{{ actionMessage }}</p>
        </section>

        <!-- -------------------------------------------------------------- about -->
        <section v-if="section === 'about'" class="settings-group" :aria-label="t('settings.section.about')">
          <h2>{{ t('settings.section.about') }}</h2>

          <div class="about-card">
            <span class="about-mark">{{ t('document.brandLetter') }}</span>
            <div>
              <strong>{{ t('settings.aboutName') }}</strong>
              <small>{{ t('settings.aboutDesc') }}</small>
            </div>
            <span class="settings-value">{{ appInfo?.version ?? '0.1.0' }}</span>
          </div>

          <div class="settings-row readonly">
            <div class="settings-copy"><strong>{{ t('settings.platform') }}</strong></div>
            <span class="settings-value">{{ platformLabel() }}</span>
          </div>

          <div class="settings-row readonly">
            <div class="settings-copy"><strong>{{ t('settings.aboutPlatform') }}</strong></div>
            <span class="settings-value">{{ runtimeLabel }}</span>
          </div>

          <div class="settings-row readonly">
            <div class="settings-copy">
              <strong>{{ t('settings.ai') }}</strong>
              <small>{{ t('settings.aiHint') }}</small>
            </div>
            <span class="settings-value muted"><AppIcon name="info" :size="14" /> {{ t('settings.aiDisabled') }}</span>
          </div>
        </section>
      </div>
    </div>
  </section>
</template>

<style scoped>
.settings-page {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  background: var(--panel-bg);
  outline: none;
}

.settings-header {
  flex: 0 0 auto;
  padding: 26px clamp(20px, 4vw, 48px) 16px;
  border-bottom: 1px solid var(--border-soft);
}

.settings-eyebrow {
  color: var(--accent);
  font-size: 9px;
  font-weight: 750;
  letter-spacing: 0.2em;
}

.settings-header h1 {
  margin: 5px 0 6px;
  color: var(--text-primary);
  font-size: 24px;
}

.settings-header p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 11px;
}

.settings-body {
  display: flex;
  min-height: 0;
  flex: 1;
}

.settings-nav {
  display: flex;
  width: 176px;
  flex: 0 0 176px;
  flex-direction: column;
  gap: 2px;
  padding: 14px 10px;
  border-right: 1px solid var(--divider-soft);
}

.settings-nav-item {
  display: flex;
  height: 34px;
  align-items: center;
  gap: 9px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 11.5px;
  text-align: left;
  transition: background var(--motion-fast) var(--ease-out), color var(--motion-fast) var(--ease-out);
}

.settings-nav-item:hover {
  background: var(--panel-muted);
  color: var(--text-primary);
}

.settings-nav-item.active {
  background: var(--accent-faint);
  color: var(--accent-strong);
  font-weight: 650;
}

.settings-content {
  min-width: 0;
  flex: 1;
  overflow-y: auto;
  padding: 20px clamp(20px, 1.5vw, 28px) 40px clamp(20px, 2vw, 32px);
  scrollbar-width: thin;
}

.settings-group {
  display: flex;
  max-width: 880px;
  flex-direction: column;
  gap: 0;
  padding: 4px 18px 14px;
  border: 1px solid var(--border-soft);
  border-radius: 14px;
  background: var(--panel-strong);
  animation: settings-in var(--motion-base) var(--ease-out) both;
}

.settings-group h2 {
  margin: 12px 0 4px;
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.settings-row {
  display: flex;
  min-height: 52px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-top: 1px solid var(--border-soft);
}

.settings-group h2 + .settings-row {
  border-top: 0;
}

.settings-row.stacked {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding: 12px 0;
}

.settings-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.settings-copy strong {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 620;
}

.settings-copy small {
  color: var(--text-tertiary);
  font-size: 10px;
  line-height: 1.5;
}

.segmented {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--border-soft);
  border-radius: 9px;
  background: var(--panel-muted);
}

.segmented button {
  height: 26px;
  padding: 0 12px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
}

.segmented button.active {
  background: var(--panel-strong);
  color: var(--accent-strong);
  box-shadow: 0 1px 3px rgba(54, 44, 98, 0.12);
}

.settings-controls {
  display: flex;
  gap: 6px;
}

.settings-small {
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border-soft);
  border-radius: 7px;
  background: var(--panel-strong);
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 10.5px;
}

.settings-small:hover {
  border-color: var(--accent);
  color: var(--accent-strong);
}

.settings-small.primary {
  border-color: var(--accent);
  background: var(--accent);
  color: white;
}

.settings-input {
  min-width: 0;
  height: 30px;
  flex: 1;
  padding: 0 9px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: var(--panel-muted);
  color: var(--text-primary);
  font: inherit;
  font-size: 11px;
}

.settings-inline {
  display: flex;
  gap: 8px;
}

.settings-inline.spread {
  align-items: center;
  margin-top: 8px;
}

.settings-select {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--border-soft);
  border-radius: 7px;
  background: var(--panel-strong);
  color: var(--text-primary);
  font: inherit;
  font-size: 11px;
}

.settings-range {
  width: 180px;
  accent-color: var(--accent);
}

.settings-note {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 10.5px;
  line-height: 1.6;
}

.settings-note.error {
  color: var(--state-danger-fg);
}

.settings-note.available,
.settings-note.up-to-date {
  color: var(--text-secondary);
}

.settings-note.not-configured {
  color: var(--state-warning-fg);
}

.settings-link {
  margin-left: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font: inherit;
  text-decoration: underline;
}

.toggle {
  position: relative;
  width: 40px;
  height: 22px;
  flex: 0 0 auto;
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--panel-muted);
  cursor: pointer;
  transition: background var(--motion-fast) var(--ease-out), border-color var(--motion-fast) var(--ease-out);
}

.toggle span {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--panel-strong);
  box-shadow: 0 1px 3px rgba(40, 32, 62, 0.25);
  transition: transform var(--motion-fast) var(--ease-out);
}

.toggle.on {
  border-color: var(--accent);
  background: var(--accent);
}

.toggle.on span {
  transform: translateX(18px);
}

.settings-value {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  color: var(--text-secondary);
  font-size: 11px;
}

.settings-value.muted {
  color: var(--text-tertiary);
}

.swatch-row {
  display: flex;
  gap: 8px;
}

.accent-swatch {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
  background: var(--swatch);
  cursor: pointer;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.06);
  transition: transform var(--motion-fast) var(--ease-out);
}

.accent-swatch:hover {
  transform: scale(1.08);
}

.accent-swatch.active {
  border-color: var(--panel-strong);
  box-shadow: 0 0 0 2px var(--accent);
}

.companion-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.companion-option {
  display: flex;
  width: 84px;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 6px;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: var(--panel-strong);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 10px;
  transition: border-color var(--motion-fast) var(--ease-out), background var(--motion-fast) var(--ease-out);
}

.companion-option:hover {
  border-color: var(--accent-soft-border);
}

.companion-option.active {
  border-color: var(--accent);
  background: var(--accent-faint);
  color: var(--accent-strong);
}

.companion-placeholder {
  display: grid;
  width: 64px;
  height: 64px;
  place-items: center;
  border-radius: 10px;
  background: var(--panel-muted);
  color: var(--text-tertiary);
}

.shortcut-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.shortcut-key {
  min-width: 128px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: var(--panel-muted);
  color: var(--text-primary);
  cursor: pointer;
  font-family: var(--editor-code-font, monospace);
  font-size: 10.5px;
}

.shortcut-key.capturing {
  border-color: var(--accent);
  color: var(--accent-strong);
  box-shadow: 0 0 0 2px var(--accent-faint);
}

.settings-subheading {
  margin: 18px 0 8px;
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.editor-shortcuts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 6px 18px;
  padding-bottom: 8px;
}

.editor-shortcut {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 11px;
}

.editor-shortcut kbd {
  padding: 2px 6px;
  border: 1px solid var(--border-soft);
  border-bottom-color: var(--border-strong);
  border-radius: 5px;
  background: var(--panel-muted);
  color: var(--text-row);
  font-family: var(--editor-code-font, monospace);
  font-size: 9.5px;
}

.about-card {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 12px 0 4px;
  padding: 14px;
  border: 1px solid var(--border-soft);
  border-radius: 12px;
  background: linear-gradient(135deg, var(--accent-faint), var(--panel-strong) 70%);
}

.about-mark {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border-radius: 11px;
  background: var(--accent);
  color: white;
  font-size: 17px;
  font-weight: 700;
}

.about-card div {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.about-card strong {
  color: var(--text-primary);
  font-size: 13px;
}

.about-card small {
  color: var(--text-tertiary);
  font-size: 10px;
}

@keyframes settings-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .settings-group {
    animation: none;
  }
}

@media (max-width: 900px) {
  .settings-nav {
    width: 132px;
    flex-basis: 132px;
  }

  .settings-nav-item span {
    font-size: 11px;
  }

  .settings-row {
    flex-wrap: wrap;
    padding: 8px 0;
  }
}
</style>
