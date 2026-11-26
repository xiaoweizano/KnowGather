<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import ShizhiMascot from './ShizhiMascot.vue'
import { useUiStore, ACCENT_OPTIONS, CODE_FONT_OPTIONS, COMPANION_STYLES, FONT_OPTIONS, MOTION_OPTIONS, type AccentColor, type CompanionStyle, type MotionPreference, type ThemePreference } from '../stores/ui'
import { useDocumentStore } from '../stores/document'
import { useSettingsStore } from '../stores/settings'
import { useAiStore } from '../stores/ai'
import { useI18n } from '../i18n/useI18n'
import { SUPPORTED_LOCALES } from '../i18n'
import { AI_PROTOCOLS, type AiProtocol, type AiTestFailureCode } from '../../../shared/ai'
import {
  AI_PERMISSION_MODES,
  DANGEROUS_COMMAND_PATTERNS,
  MAX_AI_MAX_STEPS,
  MAX_COMMAND_TIMEOUT_MS,
  MIN_AI_MAX_STEPS,
  MIN_COMMAND_TIMEOUT_MS,
  type AiPermissionMode,
} from '../../../shared/aiTools'
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
const ai = useAiStore()

type Section = 'general' | 'editor' | 'appearance' | 'assistant' | 'shortcuts' | 'data' | 'about'
const section = ref<Section>('general')
const sections: ReadonlyArray<{ id: Section; labelKey: string; hintKey: string; icon: string }> = [
  { id: 'general', labelKey: 'settings.nav.general', hintKey: 'settings.navHint.general', icon: 'settings' },
  { id: 'editor', labelKey: 'settings.nav.editor', hintKey: 'settings.navHint.editor', icon: 'edit' },
  { id: 'appearance', labelKey: 'settings.nav.appearance', hintKey: 'settings.navHint.appearance', icon: 'palette' },
  { id: 'assistant', labelKey: 'settings.nav.assistant', hintKey: 'settings.navHint.assistant', icon: 'sparkles' },
  { id: 'shortcuts', labelKey: 'settings.nav.shortcuts', hintKey: 'settings.navHint.shortcuts', icon: 'keyboard' },
  { id: 'data', labelKey: 'settings.nav.data', hintKey: 'settings.navHint.data', icon: 'library' },
  { id: 'about', labelKey: 'settings.nav.about', hintKey: 'settings.navHint.about', icon: 'info' },
]

const activeEntry = computed(() => sections.find((entry) => entry.id === section.value) ?? sections[0])

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
  await ai.loadConfig()
  syncAiDraft()
})

// A conversation may have saved the config from the assistant page while this
// page was mounted; keep the form in step with whatever the store holds.
watch(() => ai.config, () => {
  if (!aiDirty.value) syncAiDraft()
}, { deep: true })

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

/* ------------------------------------------------------------------- AI */

interface AiDraft {
  protocol: AiProtocol
  baseUrl: string
  model: string
  temperature: number
  maxTokens: number
  systemPrompt: string
}

function aiDraftFromConfig(): AiDraft {
  return {
    protocol: ai.config.protocol,
    baseUrl: ai.config.baseUrl,
    model: ai.config.model,
    temperature: ai.config.temperature,
    maxTokens: ai.config.maxTokens,
    systemPrompt: ai.config.systemPrompt,
  }
}

// The form edits a draft; nothing is written until the user presses save, so a
// half-typed URL never becomes the active endpoint of an in-flight feature.
const originalAiDraft = ref<AiDraft>(aiDraftFromConfig())
const aiDraft = ref<AiDraft>({ ...originalAiDraft.value })
const aiKeyDraft = ref('')
const aiBusy = ref(false)
const aiTestMessage = ref<{ ok: boolean; text: string } | null>(null)
const aiSavedAt = ref<string | null>(null)

function syncAiDraft(): void {
  originalAiDraft.value = aiDraftFromConfig()
  aiDraft.value = { ...originalAiDraft.value }
  aiKeyDraft.value = ''
  aiSavedAt.value = null
  aiTestMessage.value = null
}

const aiDirty = computed(() =>
  aiKeyDraft.value.length > 0
  || aiDraft.value.protocol !== originalAiDraft.value.protocol
  || aiDraft.value.baseUrl !== originalAiDraft.value.baseUrl
  || aiDraft.value.model !== originalAiDraft.value.model
  || aiDraft.value.temperature !== originalAiDraft.value.temperature
  || aiDraft.value.maxTokens !== originalAiDraft.value.maxTokens
  || aiDraft.value.systemPrompt !== originalAiDraft.value.systemPrompt)

async function saveAi(): Promise<void> {
  if (aiBusy.value) return
  aiBusy.value = true
  aiTestMessage.value = null
  const ok = await ai.saveConfig({
    protocol: aiDraft.value.protocol,
    baseUrl: aiDraft.value.baseUrl.trim(),
    model: aiDraft.value.model.trim(),
    temperature: aiDraft.value.temperature,
    maxTokens: aiDraft.value.maxTokens,
    systemPrompt: aiDraft.value.systemPrompt,
    ...(aiKeyDraft.value ? { apiKey: aiKeyDraft.value } : {}),
  })
  if (ok) {
    originalAiDraft.value = { ...aiDraft.value, baseUrl: aiDraft.value.baseUrl.trim(), model: aiDraft.value.model.trim() }
    aiKeyDraft.value = ''
    aiSavedAt.value = new Date().toLocaleTimeString()
    actionMessage.value = t('settings.aiSaved')
  }
  aiBusy.value = false
}

/** Tool-permission settings live in `AppSettings`, not the AI config. */
async function setPermissionMode(mode: AiPermissionMode): Promise<void> {
  if (mode === settingsStore.settings.aiPermissionMode) return
  await settingsStore.update({ aiPermissionMode: mode })
}

async function pickWorkspace(): Promise<void> {
  const picked = await api.workspace.pick().catch(() => null)
  if (!picked) return
  await settingsStore.update({ workspaceRoot: picked })
}

async function clearWorkspace(): Promise<void> {
  await settingsStore.update({ workspaceRoot: '' })
}

async function testAi(): Promise<void> {  if (aiBusy.value) return
  // The test runs against the stored config, so unsaved edits are saved first.
  if (aiDirty.value) {
    await saveAi()
    if (aiDirty.value) return
  }
  aiBusy.value = true
  try {
    const result = await ai.testConnection()
    aiTestMessage.value = result.ok
      ? { ok: true, text: t('settings.aiTestOk') }
      : { ok: false, text: testFailureText(result) }
  } finally {
    aiBusy.value = false
  }
}

function clearAiKey(): void {
  if (aiBusy.value) return
  aiKeyDraft.value = ''
  aiBusy.value = true
  void ai.saveConfig({ apiKey: null }).then(() => {
    syncAiDraft()
    aiBusy.value = false
  })
}

/** Codes with no provider message still need a sentence the user can act on. */
function testFailureText(result: { message?: string; code?: AiTestFailureCode }): string {
  switch (result.code) {
    case 'notConfigured': return t('settings.aiTestNeedsConfig')
    case 'desktopOnly': return t('assistant.browserOnly')
    case 'emptyReply': return t('settings.aiTestEmpty')
    case 'timeout': return t('settings.aiTestTimeout')
    case 'unauthorized': return t('settings.aiTestUnauthorized')
    default: return t('settings.aiTestFailed', { message: result.message ?? '' })
  }
}
</script>

<template>
  <section class="settings-page" tabindex="-1" @keydown="handleCapture">
    <nav class="settings-nav" :aria-label="t('settings.title')">
      <div class="settings-nav-label">{{ t('settings.title') }}</div>
      <button
        v-for="entry in sections"
        :key="entry.id"
        type="button"
        class="settings-nav-item"
        :class="{ active: section === entry.id }"
        :data-settings-section="entry.id"
        @click="section = entry.id"
      >
        <span class="nav-icon"><AppIcon :name="entry.icon" :size="14" /></span>
        <span class="nav-copy">
          <strong>{{ t(entry.labelKey) }}</strong>
          <small>{{ t(entry.hintKey) }}</small>
        </span>
      </button>
    </nav>

    <div class="settings-body">
      <header class="settings-header">
        <h1>{{ t(activeEntry.labelKey) }}</h1>
        <span class="header-dot" />
        <p>{{ t(activeEntry.hintKey) }}</p>
      </header>

      <div class="settings-content">
        <!-- ------------------------------------------------------------ general -->
        <section v-if="section === 'general'" class="settings-panel" :aria-label="t('settings.section.general')">

          <div class="settings-sect">
            <div class="sect-head"><h2>{{ t('settings.card.startup') }}</h2></div>
            <div class="sect-rows">
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
            </div>
          </div>

          <div class="settings-sect">
            <div class="sect-head"><h2>{{ t('settings.card.updates') }}</h2></div>
            <div class="sect-rows">
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
            </div>
          </div>
        </section>

        <!-- ------------------------------------------------------------- editor -->
        <section v-if="section === 'editor'" class="settings-panel" :aria-label="t('settings.section.editor')">

          <div class="settings-sect">
            <div class="sect-head"><h2>{{ t('settings.card.editing') }}</h2></div>
            <div class="sect-rows">
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
            </div>
          </div>

          <div class="settings-sect">
            <div class="sect-head"><h2>{{ t('settings.card.typography') }}</h2></div>
            <div class="sect-rows">
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
            </div>
          </div>
        </section>

        <!-- --------------------------------------------------------- appearance -->
        <section v-if="section === 'appearance'" class="settings-panel" :aria-label="t('settings.section.appearance')">

          <div class="settings-sect">
            <div class="sect-head"><h2>{{ t('settings.card.display') }}</h2></div>
            <div class="sect-rows">
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
                  <strong>{{ t('settings.fontSize.ui') }}</strong>
                  <small>{{ ui.uiFontSize }}px</small>
                </div>
                <input class="settings-range" type="range" min="10" max="20" step="1" :value="ui.uiFontSize" @input="ui.setUiFontSize(Number(($event.target as HTMLInputElement).value))" />
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
            </div>
          </div>

          <div class="settings-sect">
            <div class="sect-head"><h2>{{ t('settings.card.typography') }}</h2></div>
            <div class="sect-rows">
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
                  <strong>{{ t('settings.fontSize.body') }}</strong>
                  <small>{{ ui.bodyFontSize }}px</small>
                </div>
                <input class="settings-range" type="range" min="12" max="24" step="1" :value="ui.bodyFontSize" @input="ui.setBodyFontSize(Number(($event.target as HTMLInputElement).value))" />
              </div>
            </div>
          </div>

          <div class="settings-sect">
            <div class="sect-head"><h2>{{ t('settings.card.extras') }}</h2></div>
            <div class="sect-rows">
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
            </div>
          </div>
        </section>

        <!-- ---------------------------------------------------------- assistant -->
        <section v-if="section === 'assistant'" class="settings-panel" :aria-label="t('settings.nav.assistant')">

          <div class="settings-sect">
            <div class="sect-head"><h2>{{ t('settings.card.aiConnection') }}</h2></div>
            <div class="sect-rows">
              <div class="settings-row stacked">
                <div class="settings-copy">
                  <strong>{{ t('settings.aiProtocol') }}</strong>
                  <small>{{ t('settings.aiProtocolHint') }}</small>
                </div>
                <div class="segmented">
                  <button
                    v-for="protocol in AI_PROTOCOLS"
                    :key="protocol"
                    type="button"
                    :class="{ active: aiDraft.protocol === protocol }"
                    @click="aiDraft.protocol = protocol"
                  >{{ t(`settings.aiProtocol.${protocol}`) }}</button>
                </div>
              </div>

              <div class="settings-row stacked">
                <div class="settings-copy">
                  <strong>{{ t('settings.aiBaseUrl') }}</strong>
                  <small>{{ t('settings.aiBaseUrlHint') }}</small>
                </div>
                <input
                  v-model="aiDraft.baseUrl"
                  class="settings-input"
                  type="url"
                  spellcheck="false"
                  :placeholder="aiDraft.protocol === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1'"
                />
              </div>

              <div class="settings-row stacked">
                <div class="settings-copy">
                  <strong>{{ t('settings.aiApiKey') }}</strong>
                  <small>{{ ai.config.hasApiKey ? t('settings.aiApiKeyStored') : t('settings.aiApiKeyHint') }}</small>
                </div>
                <div class="settings-inline">
                  <input
                    v-model="aiKeyDraft"
                    class="settings-input"
                    type="password"
                    autocomplete="off"
                    spellcheck="false"
                    :placeholder="ai.config.hasApiKey ? '••••••••' : t('settings.aiApiKeyPlaceholder')"
                    @keydown.enter.prevent="saveAi"
                  />
                  <button
                    v-if="ai.config.hasApiKey"
                    type="button"
                    class="settings-small"
                    :disabled="aiBusy"
                    @click="clearAiKey"
                  >{{ t('common.delete') }}</button>
                </div>
              </div>

              <div class="settings-row stacked">
                <div class="settings-copy">
                  <strong>{{ t('settings.aiModel') }}</strong>
                  <small>{{ t('settings.aiModelHint') }}</small>
                </div>
                <input
                  v-model="aiDraft.model"
                  class="settings-input"
                  type="text"
                  spellcheck="false"
                  :placeholder="aiDraft.protocol === 'anthropic' ? 'claude-opus-5' : 'gpt-4.1'"
                />
              </div>
            </div>
          </div>

          <div class="settings-sect">
            <div class="sect-head"><h2>{{ t('settings.card.aiBehaviour') }}</h2></div>
            <div class="sect-rows">
              <div class="settings-row">
                <div class="settings-copy">
                  <strong>{{ t('settings.aiTemperature') }}</strong>
                  <small>
                    {{ aiDraft.protocol === 'anthropic' ? t('settings.aiTemperatureUnsupported') : t('settings.aiTemperatureHint') }}
                    <template v-if="aiDraft.protocol !== 'anthropic'"> · {{ aiDraft.temperature.toFixed(1) }}</template>
                  </small>
                </div>
                <input
                  class="settings-range"
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  :value="aiDraft.temperature"
                  :disabled="aiDraft.protocol === 'anthropic'"
                  @input="aiDraft.temperature = Number(($event.target as HTMLInputElement).value)"
                />
              </div>

              <div class="settings-row">
                <div class="settings-copy">
                  <strong>{{ t('settings.aiMaxTokens') }}</strong>
                  <small>{{ t('settings.aiMaxTokensHint') }} · {{ aiDraft.maxTokens }}</small>
                </div>
                <input
                  class="settings-range"
                  type="range"
                  min="256"
                  max="8192"
                  step="256"
                  :value="aiDraft.maxTokens"
                  @input="aiDraft.maxTokens = Number(($event.target as HTMLInputElement).value)"
                />
              </div>

              <div class="settings-row stacked">
                <div class="settings-copy">
                  <strong>{{ t('settings.aiSystemPrompt') }}</strong>
                  <small>{{ t('settings.aiSystemPromptHint') }}</small>
                </div>
                <textarea
                  v-model="aiDraft.systemPrompt"
                  class="settings-textarea"
                  rows="3"
                  :placeholder="t('settings.aiSystemPromptPlaceholder')"
                />
              </div>

              <div class="settings-row stacked">
                <div class="ai-actions">
                  <button type="button" class="settings-small primary" :disabled="aiBusy || !aiDirty" @click="saveAi">
                    {{ aiBusy ? t('common.loading') : t('common.save') }}
                  </button>
                  <button type="button" class="settings-small" :disabled="aiBusy" @click="testAi">
                    {{ aiBusy ? t('settings.aiTesting') : t('settings.aiTest') }}
                  </button>
                  <span v-if="aiSavedAt" class="settings-note">{{ t('settings.aiSaved') }}</span>
                </div>
                <p v-if="aiTestMessage" class="settings-note" :class="aiTestMessage.ok ? 'up-to-date' : 'error'">
                  {{ aiTestMessage.text }}
                </p>
                <p v-else-if="ai.error" class="settings-note error">{{ ai.error }}</p>
              </div>
            </div>
          </div>

          <div class="settings-sect">
            <div class="sect-head"><h2>{{ t('settings.card.aiTools') }}</h2></div>
            <div class="sect-rows">
              <div class="settings-row stacked">
                <div class="settings-copy">
                  <strong>{{ t('settings.aiPermissionMode') }}</strong>
                  <small>{{ t(`aiPermission.${settingsStore.settings.aiPermissionMode}Hint`) }}</small>
                </div>
                <div class="segmented">
                  <button
                    v-for="mode in AI_PERMISSION_MODES"
                    :key="mode"
                    type="button"
                    :class="{ active: settingsStore.settings.aiPermissionMode === mode }"
                    @click="setPermissionMode(mode)"
                  >{{ t(`aiPermission.${mode}`) }}</button>
                </div>
              </div>

              <div class="settings-row stacked">
                <div class="settings-copy">
                  <strong>{{ t('settings.aiWorkspace') }}</strong>
                  <small>{{ settingsStore.settings.workspaceRoot || t('settings.aiWorkspaceHint') }}</small>
                </div>
                <div class="settings-inline">
                  <button type="button" class="settings-small" @click="pickWorkspace">
                    {{ t('settings.aiWorkspacePick') }}
                  </button>
                  <button
                    v-if="settingsStore.settings.workspaceRoot"
                    type="button"
                    class="settings-small"
                    @click="clearWorkspace"
                  >{{ t('common.delete') }}</button>
                </div>
              </div>

              <div class="settings-row">
                <div class="settings-copy">
                  <strong>{{ t('settings.aiMaxSteps') }}</strong>
                  <small>{{ t('settings.aiMaxStepsHint') }} · {{ settingsStore.settings.aiMaxSteps }}</small>
                </div>
                <input
                  class="settings-range"
                  type="range"
                  :min="MIN_AI_MAX_STEPS"
                  :max="MAX_AI_MAX_STEPS"
                  step="1"
                  :value="settingsStore.settings.aiMaxSteps"
                  @input="updateSetting('aiMaxSteps', Number(($event.target as HTMLInputElement).value))"
                />
              </div>

              <div class="settings-row">
                <div class="settings-copy">
                  <strong>{{ t('settings.aiCommandTimeout') }}</strong>
                  <small>{{ t('settings.aiCommandTimeoutHint') }} · {{ Math.round(settingsStore.settings.commandTimeoutMs / 1000) }}s</small>
                </div>
                <input
                  class="settings-range"
                  type="range"
                  :min="MIN_COMMAND_TIMEOUT_MS"
                  :max="MAX_COMMAND_TIMEOUT_MS"
                  step="5000"
                  :value="settingsStore.settings.commandTimeoutMs"
                  @input="updateSetting('commandTimeoutMs', Number(($event.target as HTMLInputElement).value))"
                />
              </div>

              <div class="settings-row stacked">
                <div class="settings-copy">
                  <strong>{{ t('settings.aiDangerousCommands') }}</strong>
                  <small>{{ t('settings.aiDangerousCommandsHint') }}</small>
                </div>
                <ul class="ai-danger-list">
                  <li v-for="entry in DANGEROUS_COMMAND_PATTERNS" :key="entry.labelKey">
                    {{ t(entry.labelKey) }}
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <!-- ---------------------------------------------------------- shortcuts -->
        <section v-if="section === 'shortcuts'" class="settings-panel" :aria-label="t('settings.section.shortcuts')">
          <div class="settings-sect settings-sect--list">
            <div class="sect-rows">
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
            </div>
          </div>
        </section>

        <!-- --------------------------------------------------------------- data -->
        <section v-if="section === 'data'" class="settings-panel" :aria-label="t('settings.section.data')">

          <div class="settings-sect settings-sect--list">
            <div class="sect-rows">
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
            </div>
          </div>
        </section>

        <!-- -------------------------------------------------------------- about -->
        <section v-if="section === 'about'" class="settings-panel" :aria-label="t('settings.section.about')">

          <div class="settings-sect">
            <div class="about-card">
              <span class="about-mark">{{ t('document.brandLetter') }}</span>
              <div>
                <strong>{{ t('settings.aboutName') }}</strong>
                <small>{{ t('settings.aboutDesc') }}</small>
              </div>
              <span class="settings-value">{{ appInfo?.version ?? '0.1.0' }}</span>
            </div>
          </div>

          <div class="settings-sect settings-sect--list">
            <div class="sect-rows">
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
              <small>{{ ai.config.model || t('settings.aiHint') }}</small>
            </div>
            <span class="settings-value" :class="{ muted: !ai.configured }">
              <AppIcon :name="ai.configured ? 'check' : 'info'" :size="14" />
              {{ ai.configured ? t('settings.aiTestOk') : t('settings.aiDisabled') }}
            </span>
          </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ------------------------------------------------------------------ shell */

/* Settings owns its full pane and splits it into a card rail and a content
   column. The rail is a list of cards rather than a text list so each section
   can carry a one-line description of what lives inside it. */
.settings-page {
  display: flex;
  min-width: 0;
  flex: 1;
  overflow: hidden;
  background: var(--panel-strong);
  outline: none;
}

.settings-nav {
  display: flex;
  width: 236px;
  flex: 0 0 236px;
  flex-direction: column;
  gap: 7px;
  padding: 20px 14px;
  overflow-y: auto;
  border-right: 1px solid var(--border-soft);
  scrollbar-width: thin;
}

.settings-nav-label {
  padding: 0 4px 10px;
  color: var(--text-hint);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.settings-nav-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 11px;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: var(--panel-strong);
  cursor: pointer;
  text-align: left;
  transition: border-color var(--motion-fast) var(--ease-out), background var(--motion-fast) var(--ease-out);
}

.nav-icon {
  display: grid;
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 7px;
  background: var(--panel-muted);
  color: var(--text-secondary);
}

.nav-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
  padding-top: 1px;
}

.nav-copy strong {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 580;
  letter-spacing: -0.005em;
}

.nav-copy small {
  color: var(--text-hint);
  font-size: 9.5px;
  line-height: 1.45;
}

.settings-nav-item:hover {
  border-color: var(--border-strong);
}

.settings-nav-item.active {
  border-color: color-mix(in srgb, var(--accent) 34%, var(--border-soft));
  background: linear-gradient(180deg, var(--accent-faint), var(--panel-strong));
  box-shadow: 0 3px 12px rgba(121, 105, 232, 0.13);
}

.settings-nav-item.active .nav-icon {
  background: var(--accent);
  color: #fff;
}

.settings-nav-item.active .nav-copy strong {
  color: var(--accent-strong);
  font-weight: 680;
}

.settings-nav-item.active .nav-copy small {
  color: var(--text-secondary);
}

/* ----------------------------------------------------------------- content */

.settings-body {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
}

.settings-header {
  display: flex;
  height: 56px;
  flex: 0 0 auto;
  align-items: center;
  gap: 11px;
  padding: 0 26px;
  border-bottom: 1px solid var(--border-soft);
}

.settings-header h1 {
  margin: 0;
  color: var(--text-primary);
  font-size: 15.5px;
  font-weight: 680;
  letter-spacing: -0.015em;
}

.header-dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--border-strong);
}

.settings-header p {
  margin: 0;
  color: var(--text-hint);
  font-size: 11px;
}

.settings-content {
  min-width: 0;
  flex: 1;
  overflow-y: auto;
  padding: 18px 26px 30px;
  scrollbar-width: thin;
}

/* --------------------------------------------------------- sectioned card */

/* One card holds every section, divided by hairlines. Rows flow into two
   columns so each control sits beside its label instead of at the far edge. */
.settings-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-soft);
  border-radius: 12px;
  background: var(--panel-strong);
  box-shadow: 0 1px 2px rgba(50, 42, 90, 0.04);
  animation: settings-in var(--motion-base) var(--ease-out) both;
}

.settings-sect + .settings-sect {
  border-top: 1px solid var(--border-soft);
}

.sect-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 14px 18px 4px;
}

.sect-head h2 {
  margin: 0;
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sect-rows {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: 0 18px 8px;
}

/* Non-row extras (search bar, notes, editor shortcut list) span the card. */
.sect-rows > .settings-inline,
.sect-rows > .settings-note,
.sect-rows > .settings-subheading,
.sect-rows > .editor-shortcuts {
  grid-column: 1 / -1;
}

.sect-rows > .settings-inline.spread {
  padding: 10px 0 4px;
}

/* Sections without a heading (shortcuts, data, about) are lists, not pairs. */
.settings-sect--list .sect-rows {
  display: flex;
  flex-direction: column;
  padding: 6px 18px 12px;
}

.settings-sect--list .settings-row {
  padding-right: 0;
  padding-left: 0;
}

.settings-sect--list .settings-row:nth-child(odd) {
  padding-right: 0;
  border-right: 0;
}

.settings-row {
  display: flex;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 0;
}

/* Two-column rule: the left cell of each pair owns the divider. */
.sect-rows > .settings-row:nth-child(odd) {
  padding-right: 26px;
  border-right: 1px solid var(--border-soft);
}

.sect-rows > .settings-row:nth-child(even) {
  padding-left: 26px;
}

.settings-row.stacked {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding-top: 12px;
  padding-bottom: 12px;
}

/* A stacked row spans both columns; the odd-cell divider would cut through it. */
.sect-rows > .settings-row.stacked {
  grid-column: 1 / -1;
  padding-right: 0;
  padding-left: 0;
  border-right: 0;
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

.settings-textarea {
  min-height: 62px;
  padding: 8px 9px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: var(--panel-muted);
  color: var(--text-primary);
  font: inherit;
  font-size: 11px;
  line-height: 1.6;
  resize: vertical;
}

.ai-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.ai-danger-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 2px 0 0;
  padding: 0;
  list-style: none;
}

.ai-danger-list li {
  padding: 2px 8px;
  border: 1px solid var(--border-soft);
  border-radius: 999px;
  background: var(--panel-muted);
  color: var(--text-tertiary);
  font-size: 10px;
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
  margin: 14px 18px 10px;
  padding: 14px;
  border: 1px solid var(--border-soft);
  border-radius: 11px;
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
  .settings-panel {
    animation: none;
  }
}

@media (max-width: 1080px) {
  .sect-rows {
    grid-template-columns: minmax(0, 1fr);
  }

  .sect-rows > .settings-row:nth-child(odd) {
    padding-right: 0;
    border-right: 0;
  }

  .sect-rows > .settings-row:nth-child(even) {
    padding-left: 0;
  }
}

@media (max-width: 900px) {
  .settings-nav {
    width: 190px;
    flex-basis: 190px;
    padding: 16px 10px;
  }

  .nav-copy small {
    display: none;
  }

  .settings-row {
    flex-wrap: wrap;
  }
}
</style>
