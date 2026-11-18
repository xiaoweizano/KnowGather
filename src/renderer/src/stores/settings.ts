import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getShizhiApi } from '../services/api'
import { DEFAULT_APP_SETTINGS, type AppInfo, type AppSettings, type AppSettingsPatch } from '../../../shared/settings'
import { locale, setLocale, type Locale } from '../i18n'

/**
 * Application-level settings live in the main process (tray, auto launch,
 * update feed) so they can be enacted before the renderer loads.
 *
 * Loading is lazy: the store is only touched when the settings page opens or
 * the app is ready, never from `documentStore.initialize()`. Several store
 * tests mock a narrower API surface on purpose.
 */
export const useSettingsStore = defineStore('settings', () => {
  const api = getShizhiApi()
  const settings = ref<AppSettings>({ ...DEFAULT_APP_SETTINGS })
  const appInfo = ref<AppInfo | null>(null)
  const loaded = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)

  const autoLaunchSupported = computed(() => appInfo.value?.packaged ?? false)
  const updateFeedConfigured = computed(() => settings.value.updateFeedUrl.trim().length > 0)

  async function load(): Promise<void> {
    if (loaded.value) return
    try {
      const [next, info] = await Promise.all([api.settings.get(), api.app.getInfo()])
      settings.value = next
      appInfo.value = info
      applyLocale(next.locale)
      loaded.value = true
      error.value = null
    } catch (cause) {
      error.value = message(cause, '无法读取应用设置')
    }
  }

  async function update(patch: AppSettingsPatch): Promise<boolean> {
    if (saving.value) return false
    saving.value = true
    try {
      const next = await api.settings.update(patch)
      settings.value = next
      if (patch.locale) applyLocale(next.locale)
      error.value = null
      return true
    } catch (cause) {
      error.value = message(cause, '保存应用设置失败')
      return false
    } finally {
      saving.value = false
    }
  }

  async function setAutoLaunch(enabled: boolean): Promise<void> {
    settings.value = { ...settings.value, autoLaunch: enabled }
    try {
      const state = await api.app.setAutoLaunch(enabled)
      // The main process refuses to enable it in an unpackaged build; reflect
      // the real state instead of the optimistic one.
      settings.value = { ...settings.value, autoLaunch: state.enabled }
      if (appInfo.value && appInfo.value.packaged !== state.supported) {
        appInfo.value = { ...appInfo.value, packaged: state.supported }
      }
    } catch (cause) {
      settings.value = { ...settings.value, autoLaunch: !enabled }
      error.value = message(cause, '无法设置开机自启')
    }
  }

  async function setTaskbarVisible(visible: boolean): Promise<void> {
    const previous = settings.value.hideFromTaskbar
    settings.value = { ...settings.value, hideFromTaskbar: !visible }
    try {
      await api.app.setTaskbarVisible(visible)
      await update({ hideFromTaskbar: !visible })
    } catch (cause) {
      settings.value = { ...settings.value, hideFromTaskbar: previous }
      error.value = message(cause, '无法修改任务栏显示')
    }
  }

  async function setLocalePreference(next: Locale): Promise<void> {
    applyLocale(next)
    await update({ locale: next })
  }

  async function exportAll(): Promise<{ saved: boolean; path?: string }> {
    return api.app.exportAll()
  }

  async function openDataFolder(): Promise<void> {
    await api.app.openDataFolder()
  }

  return {
    settings,
    appInfo,
    loaded,
    saving,
    error,
    autoLaunchSupported,
    updateFeedConfigured,
    load,
    update,
    setAutoLaunch,
    setTaskbarVisible,
    setLocalePreference,
    exportAll,
    openDataFolder,
  }
})

function applyLocale(next: Locale): void {
  if (locale.value !== next) setLocale(next)
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
