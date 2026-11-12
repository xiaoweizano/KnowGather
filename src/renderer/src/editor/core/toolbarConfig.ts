import type { EditorCommand } from './editorCommands'
import type { ToolbarLayoutItem } from './toolbarLayout'

export interface ToolbarActionItem extends ToolbarLayoutItem {
  key: EditorCommand | 'color' | 'link' | 'image' | 'table' | 'attachment'
  label: string
  shortcut?: string
  icon: string
  command?: EditorCommand
}

export const PRIMARY_TOOLBAR_ITEMS: readonly ToolbarActionItem[] = [
  { key: 'bold', label: '粗体', shortcut: 'Ctrl+B', icon: 'bold', command: 'bold', width: 30, priority: 100 },
  { key: 'italic', label: '斜体', shortcut: 'Ctrl+I', icon: 'italic', command: 'italic', width: 30, priority: 95 },
  { key: 'link', label: '链接', shortcut: 'Ctrl+K', icon: 'link', width: 30, priority: 92 },
  { key: 'underline', label: '下划线', shortcut: 'Ctrl+U', icon: 'underline', command: 'underline', width: 30, priority: 90 },
  { key: 'color', label: '文字颜色', icon: 'palette', width: 32, priority: 75 },
  { key: 'highlight', label: '背景高亮', icon: 'separator', command: 'highlight', width: 30, priority: 72 },
  { key: 'bulletList', label: '无序列表', shortcut: 'Ctrl+Shift+8', icon: 'list', command: 'bulletList', width: 30, priority: 70 },
  { key: 'taskList', label: '任务列表', shortcut: 'Ctrl+Shift+9', icon: 'check', command: 'taskList', width: 30, priority: 68 },
  { key: 'orderedList', label: '有序列表', shortcut: 'Ctrl+Shift+7', icon: 'orderedList', command: 'orderedList', width: 30, priority: 65 },
  { key: 'code', label: '行内代码', shortcut: 'Ctrl+E', icon: 'code', command: 'code', width: 30, priority: 60 },
  { key: 'strike', label: '删除线', shortcut: 'Ctrl+Shift+S', icon: 'strike', command: 'strike', width: 30, priority: 55 },
  { key: 'image', label: '图片', icon: 'image', width: 30, priority: 50 },
  { key: 'table', label: '插入表格', icon: 'table', width: 30, priority: 48 },
  { key: 'blockquote', label: '引用', shortcut: 'Ctrl+Shift+B', icon: 'quote', command: 'blockquote', width: 30, priority: 45 },
  { key: 'codeBlock', label: '代码块', shortcut: 'Ctrl+Alt+C', icon: 'code', command: 'codeBlock', width: 30, priority: 40 },
  { key: 'attachment', label: '附件', icon: 'attachment', width: 30, priority: 35 },
]

export const MORE_TOOLBAR_ITEMS: readonly ToolbarActionItem[] = [
  { key: 'alignLeft', label: '左对齐', shortcut: 'Ctrl+Shift+L', icon: 'alignLeft', command: 'alignLeft', width: 160, priority: 30 },
  { key: 'alignCenter', label: '居中对齐', shortcut: 'Ctrl+Shift+E', icon: 'alignCenter', command: 'alignCenter', width: 160, priority: 29 },
  { key: 'alignRight', label: '右对齐', shortcut: 'Ctrl+Shift+R', icon: 'alignRight', command: 'alignRight', width: 160, priority: 28 },
  { key: 'alignJustify', label: '两端对齐', icon: 'alignJustify', command: 'alignJustify', width: 160, priority: 27 },
  { key: 'indent', label: '增加缩进', shortcut: 'Tab', icon: 'chevronRight', command: 'indent', width: 160, priority: 26 },
  { key: 'outdent', label: '减少缩进', shortcut: 'Shift+Tab', icon: 'chevronLeft', command: 'outdent', width: 160, priority: 25 },
  { key: 'horizontalRule', label: '分割线', shortcut: '---', icon: 'separator', command: 'horizontalRule', width: 160, priority: 20 },
  { key: 'clearFormatting', label: '清除格式', shortcut: 'Ctrl+\\', icon: 'x', command: 'clearFormatting', width: 160, priority: 15 },
]

export const TEXT_COLORS = [
  { label: '默认', value: null },
  { label: '紫色', value: '#6654dc' },
  { label: '蓝色', value: '#3278c7' },
  { label: '绿色', value: '#2b8a64' },
  { label: '橙色', value: '#c56a2d' },
  { label: '红色', value: '#c84b55' },
  { label: '灰色', value: '#6f6a79' },
] as const

export const HIGHLIGHT_COLORS = [
  { label: '无', value: null },
  { label: '柔紫', value: '#e7e1ff' },
  { label: '淡黄', value: '#fff0a8' },
  { label: '浅蓝', value: '#dceeff' },
  { label: '薄荷', value: '#dff4e8' },
  { label: '杏色', value: '#ffe4cf' },
  { label: '浅粉', value: '#ffdce5' },
] as const

