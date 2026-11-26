/**
 * Main-process strings that reach the user outside the renderer: native dialog
 * titles and filters, the tray menu, and the window title.
 *
 * Everything inside the app is translated by the renderer's i18n module; this
 * dictionary is intentionally small and only covers OS-level chrome.
 */
import type { AppLocale } from '../shared/settings.js'

interface MainMessages {
  windowTitle: string
  dialogImportFile: string
  dialogImportArchive: string
  dialogImportFolder: string
  filterSupported: string
  filterAllFiles: string
  filterArchives: string
  filterImages: string
  filterAttachments: string
  dialogPickImages: string
  dialogPickFiles: string
  dialogSaveExport: string
  filterJson: string
  dialogChooseWorkspace: string
  trayShow: string
  traySettings: string
  trayQuit: string
  errorAttachmentUnavailable: string
  errorInvalidImportMode: string
  errorInvalidImagePayload: string
  errorEmptyImage: string
  errorImageTooLarge: string
  errorInvalidImageType: string
  defaultImportedImageName: string
  exportFailed: string
}

const zh: MainMessages = {
  windowTitle: '拾知 · 文档编辑',
  dialogImportFile: '选择要导入的文件',
  dialogImportArchive: '选择要导入的压缩包',
  dialogImportFolder: '选择要导入的文件夹',
  filterSupported: '支持的文档',
  filterAllFiles: '所有文件',
  filterArchives: '压缩包',
  filterImages: '图片',
  filterAttachments: '附件',
  dialogPickImages: '选择图片',
  dialogPickFiles: '选择附件',
  dialogSaveExport: '导出全部数据',
  filterJson: 'JSON 文件',
  dialogChooseWorkspace: '选择工作区目录',
  trayShow: '显示主窗口',
  traySettings: '打开设置',
  trayQuit: '退出拾知',
  errorAttachmentUnavailable: '附件存储不可用',
  errorInvalidImportMode: '导入模式无效',
  errorInvalidImagePayload: '图片载荷无效',
  errorEmptyImage: '图片数据为空',
  errorImageTooLarge: '图片过大',
  errorInvalidImageType: '图片类型无效',
  defaultImportedImageName: '导入的图片',
  exportFailed: '导出失败',
}

const en: MainMessages = {
  windowTitle: 'Shizhi · Document editor',
  dialogImportFile: 'Choose files to import',
  dialogImportArchive: 'Choose an archive to import',
  dialogImportFolder: 'Choose a folder to import',
  filterSupported: 'Supported documents',
  filterAllFiles: 'All files',
  filterArchives: 'Archives',
  filterImages: 'Images',
  filterAttachments: 'Attachments',
  dialogPickImages: 'Choose images',
  dialogPickFiles: 'Choose files',
  dialogSaveExport: 'Export all data',
  filterJson: 'JSON file',
  dialogChooseWorkspace: 'Choose workspace folder',
  trayShow: 'Show main window',
  traySettings: 'Open settings',
  trayQuit: 'Quit Shizhi',
  errorAttachmentUnavailable: 'Attachment storage is unavailable',
  errorInvalidImportMode: 'Invalid import mode',
  errorInvalidImagePayload: 'Invalid image payload',
  errorEmptyImage: 'Image data is empty',
  errorImageTooLarge: 'Image is too large',
  errorInvalidImageType: 'Invalid image type',
  defaultImportedImageName: 'Imported image',
  exportFailed: 'Export failed',
}

const dictionaries: Record<AppLocale, MainMessages> = { 'zh-CN': zh, 'en-US': en }

let activeLocale: AppLocale = 'zh-CN'

export function setMainLocale(next: AppLocale): void {
  activeLocale = next === 'en-US' ? 'en-US' : 'zh-CN'
}

export function mainLocale(): AppLocale {
  return activeLocale
}

export function tm(key: keyof MainMessages): string {
  return dictionaries[activeLocale][key]
}
