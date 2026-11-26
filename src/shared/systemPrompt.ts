import { localDayKey } from './settings.js'

export interface SystemPromptContext {
  now: Date
  locale: 'zh-CN' | 'en-US'
  workspaceRoot: string
  platform: string
  /** Names of the tools actually offered this run. */
  toolNames: readonly string[]
  /** The user's own standing instructions, appended last. */
  userPrompt: string
}

const WEEKDAYS_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/**
 * Builds the assistant's system prompt for one run.
 *
 * The date block is not decoration: without a concrete "today" the model cannot
 * turn "本周" into two ISO dates, and it will either guess or ask. That was
 * observed directly against this gateway, so the date, weekday and week bounds
 * are spelled out rather than left to inference.
 */
export function buildSystemPrompt(context: SystemPromptContext): string {
  const { now, locale } = context
  const today = localDayKey(now)
  const weekday = WEEKDAYS_ZH[now.getDay()] ?? ''
  const monday = mondayOf(now)
  const sunday = addDays(monday, 6)
  const lastMonday = addDays(monday, -7)
  const lastSunday = addDays(monday, -1)

  const lines: string[] = []
  if (locale === 'en-US') {
    lines.push(
      'You are the built-in assistant of Shizhi, a personal knowledge app.',
      `Today is ${today} (${weekday.replace('周', 'weekday ')}). The user's local time zone is ${timeZoneName()}.`,
      `This week runs ${localDayKey(monday)} to ${localDayKey(sunday)}; last week ran ${localDayKey(lastMonday)} to ${localDayKey(lastSunday)}.`,
      'Use these dates whenever the user says "this week", "last week" or "yesterday" — do not ask them to repeat the range.',
      'You have tools for the local knowledge base, the workspace files, the shell and the public web. Prefer calling them over guessing.',
      'Workflow: list first, then read only what you need. Batch reads when a range is involved.',
      'When the user asks for a summary/report, write the finished text in your reply first, then call create_document to save it if they asked you to file it.',
    )
  } else {
    lines.push(
      '你是「拾知」个人知识管理应用内置的助手。',
      `今天是 ${today}（${weekday}），用户所在时区是 ${timeZoneName()}。`,
      `本周范围是 ${localDayKey(monday)} 至 ${localDayKey(sunday)}；上周是 ${localDayKey(lastMonday)} 至 ${localDayKey(lastSunday)}。`,
      '用户说“本周/上周/昨天/最近几天”时，直接按上面的日期换算成具体起止日期调用工具，不要反问用户日期范围。',
      '你可以使用工具读取本地知识库、工作区文件、执行命令和抓取网页。能查证的事情优先调用工具，不要凭空猜测。',
      '工作方式：先列表再精读，只读取真正需要的内容；涉及日期范围时批量读取，不要一篇篇试探。',
      '用户要周报、总结或整理结果时，先把成品正文写在回复里，用户要求归档时再调用 create_document 保存（周报建议存到「每周总结」分类）。',
      '调用工具前用一句话说明你要做什么；工具返回后不要复述原始数据，直接给出结论。',
    )
  }

  if (context.workspaceRoot) {
    lines.push(locale === 'en-US'
      ? `Workspace root: ${context.workspaceRoot}. File and shell tools are confined to it.`
      : `工作区根目录：${context.workspaceRoot}。文件与命令工具都被限制在这个目录内。`)
  } else if (locale !== 'en-US') {
    lines.push('用户还没有配置工作区目录，因此文件与命令工具不可用；只能用知识库、网页工具，或请用户在设置里选择工作区。')
  } else {
    lines.push('No workspace directory is configured, so file and shell tools are unavailable. Ask the user to set one in Settings if needed.')
  }

  lines.push(locale === 'en-US' ? `Platform: ${context.platform}.` : `系统平台：${context.platform}。`)
  if (context.userPrompt.trim()) lines.push(context.userPrompt.trim())
  return lines.join('\n')
}

function mondayOf(date: Date): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  // getDay(): Sunday is 0. Back up to the previous Monday (or stay on Monday).
  const offset = (copy.getDay() + 6) % 7
  copy.setDate(copy.getDate() - offset)
  return copy
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  copy.setDate(copy.getDate() + days)
  return copy
}

function timeZoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'
  } catch {
    return 'local'
  }
}
