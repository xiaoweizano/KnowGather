import type { TiptapDocument } from '../../../shared/document'

export interface JournalTemplate {
  id: string
  /** i18n key for the template name; user templates carry their own title. */
  nameKey: string | null
  title: string | null
  /** Icon shown in the pickers. */
  icon: string
  /** Colour family for the icon tile; presentation only. */
  tone: TemplateTone
  /** i18n key for a one-line summary; user templates carry none. */
  descriptionKey: string | null
  content: TiptapDocument
}

export type TemplateTone = 'green' | 'amber' | 'blue' | 'violet' | 'rose' | 'orange' | 'slate'

/**
 * Cards on the first screenful. Seven built-ins would push the picker past a
 * short window, so the last one moves behind "more templates" until asked for.
 */
export const TEMPLATE_FIRST_PAGE = 6

/** Templates shown before expanding; leaves room for the "more" tile. */
export function firstPageTemplates(
  templates: readonly JournalTemplate[],
  expanded: boolean,
): JournalTemplate[] {
  if (expanded || templates.length <= TEMPLATE_FIRST_PAGE) return [...templates]
  return templates.slice(0, TEMPLATE_FIRST_PAGE - 1)
}

/** User templates have no built-in colour, so they share one neutral tone. */
export const CUSTOM_TEMPLATE_TONE: TemplateTone = 'slate'

type TemplateNode = TiptapDocument['content'][number]

const textNode = (text: string, bold = false): TemplateNode => ({
  type: 'text',
  text,
  ...(bold ? { marks: [{ type: 'bold' }] } : {}),
})

const heading = (text: string): TemplateNode => ({
  type: 'heading',
  attrs: { level: 2 },
  content: [textNode(text)],
})

// An empty string must stay an empty paragraph: ProseMirror rejects text nodes
// with no content, which would make the whole template fail to insert.
const paragraph = (text?: string): TemplateNode => (
  text ? { type: 'paragraph', content: [textNode(text)] } : { type: 'paragraph' }
)

const bulletList = (...items: string[]): TemplateNode => ({
  type: 'bulletList',
  content: items.map((item) => ({ type: 'listItem', content: [paragraph(item)] })),
})

interface TaskSeed {
  text?: string
  checked?: boolean
}

const taskList = (...items: TaskSeed[]): TemplateNode => ({
  type: 'taskList',
  content: items.map(({ text, checked = false }) => ({
    type: 'taskItem',
    attrs: { checked },
    content: [paragraph(text)],
  })),
})

const cell = (text: string, bold = false): TemplateNode => ({
  type: 'tableCell',
  attrs: { colspan: 1, rowspan: 1, colwidth: null },
  content: [text ? { type: 'paragraph', content: [textNode(text, bold)] } : { type: 'paragraph' }],
})

/** Two-column fact sheet: the left column names the field, the right is filled in. */
const facts = (rows: Array<[string, string]>): TemplateNode => ({
  type: 'table',
  content: rows.map(([label, value]) => ({
    type: 'tableRow',
    content: [cell(label, true), cell(value)],
  })),
})

const quote = (): TemplateNode => ({
  type: 'blockquote',
  content: [paragraph()],
})

const doc = (...content: TemplateNode[]): TiptapDocument => ({ type: 'doc', content })

/**
 * Built-in templates for new journal entries and blank editors. They are plain
 * Tiptap JSON so a new entry opens with the same structure the editor stores.
 * The body copy is fixed data (like the generated journal titles) and does not
 * follow the interface language.
 */
export const BUILTIN_JOURNAL_TEMPLATES: ReadonlyArray<JournalTemplate> = [
  {
    id: 'daily-review',
    nameKey: 'journal.template.daily',
    title: null,
    icon: 'journal',
    tone: 'green',
    descriptionKey: 'journal.template.dailyHint',
    content: doc(
      heading('今天做了什么'),
      bulletList(''),
      heading('学到了什么'),
      paragraph(),
      heading('明天要做什么'),
      taskList({}, {}),
      heading('今天的感受'),
      paragraph(),
    ),
  },
  {
    id: 'meeting-notes',
    nameKey: 'journal.template.meeting',
    title: null,
    icon: 'users',
    tone: 'amber',
    descriptionKey: 'journal.template.meetingHint',
    content: doc(
      facts([['会议主题', ''], ['时间', ''], ['参与人', ''], ['地点 / 链接', '']]),
      heading('议题'),
      bulletList(''),
      heading('讨论与结论'),
      paragraph(),
      heading('行动项'),
      taskList({}, {}),
      heading('下次会议'),
      paragraph(),
    ),
  },
  {
    id: 'weekly-report',
    nameKey: 'journal.template.weekly',
    title: null,
    icon: 'calendar',
    tone: 'blue',
    descriptionKey: 'journal.template.weeklyHint',
    content: doc(
      heading('本周完成'),
      taskList({ checked: true }, { checked: true }, {}),
      heading('进行中'),
      taskList({}, {}),
      heading('问题与风险'),
      paragraph(),
      heading('下周计划'),
      taskList({}, {}),
      heading('需要的支持'),
      paragraph(),
    ),
  },
  {
    id: 'project-retro',
    nameKey: 'journal.template.retro',
    title: null,
    icon: 'activity',
    tone: 'violet',
    descriptionKey: 'journal.template.retroHint',
    content: doc(
      facts([['项目', ''], ['周期', ''], ['我的角色', '']]),
      heading('目标与结果'),
      paragraph(),
      heading('做得好'),
      bulletList(''),
      heading('可以改进'),
      bulletList(''),
      heading('经验沉淀'),
      paragraph(),
      heading('下一步'),
      taskList({}, {}),
    ),
  },
  {
    id: 'book-notes',
    nameKey: 'journal.template.reading',
    title: null,
    icon: 'book',
    tone: 'rose',
    descriptionKey: 'journal.template.readingHint',
    content: doc(
      facts([['书名', ''], ['作者', ''], ['阅读时间', '']]),
      heading('核心观点'),
      bulletList(''),
      heading('精彩摘录'),
      quote(),
      heading('我的思考'),
      paragraph(),
      heading('行动清单'),
      taskList({}, {}),
    ),
  },
  {
    id: 'personal-plan',
    nameKey: 'journal.template.plan',
    title: null,
    icon: 'star',
    tone: 'orange',
    descriptionKey: 'journal.template.planHint',
    content: doc(
      heading('目标'),
      paragraph(),
      heading('关键结果'),
      bulletList(''),
      heading('阶段性里程碑'),
      taskList({}, {}, {}),
      heading('本周行动'),
      taskList({}, {}),
      heading('复盘'),
      paragraph(),
    ),
  },
  {
    id: 'free-writing',
    nameKey: 'journal.template.free',
    title: null,
    icon: 'edit',
    tone: 'slate',
    descriptionKey: 'journal.template.freeHint',
    content: doc(heading('随手记'), paragraph()),
  },
]

/** Resolves a template label, preferring user-given titles. */
export function journalTemplateLabel(
  template: JournalTemplate,
  translate: (key: string) => string,
): string {
  if (template.title) return template.title
  return template.nameKey ? translate(template.nameKey) : template.id
}

/** One-line summary under the template name; empty for user templates. */
export function journalTemplateDescription(
  template: JournalTemplate,
  translate: (key: string) => string,
): string {
  return template.descriptionKey ? translate(template.descriptionKey) : ''
}

/**
 * The default title for a new document promoted from a journal entry: the
 * generated `2024-05-20 日志` suffix is dropped so the date is not baked into
 * the library title.
 */
export function promoteTitleFromJournal(title: string): string {
  return title.replace(/^\d{4}-\d{2}-\d{2}\s*日志\s*/, '').trim()
}
