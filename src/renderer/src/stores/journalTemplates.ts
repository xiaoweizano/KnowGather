import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { isTiptapDocument, type TiptapDocument } from '../../../shared/document'
import { BUILTIN_JOURNAL_TEMPLATES, CUSTOM_TEMPLATE_TONE, type JournalTemplate } from '../app/journalTemplates'

const STORAGE_KEY = 'shizhi.journal-templates.v1'

interface StoredTemplate {
  id: string
  title: string
  content: TiptapDocument
}

/**
 * User-defined journal templates, stored in the renderer only.
 *
 * They are a personal shortcut rather than shared content, so they live in
 * localStorage next to the other UI preferences rather than in the document
 * database (which the main process validates field by field).
 */
export const useJournalTemplateStore = defineStore('journalTemplates', () => {
  const userTemplates = ref<StoredTemplate[]>(readTemplates())

  const all = computed<JournalTemplate[]>(() => [
    ...BUILTIN_JOURNAL_TEMPLATES,
    ...userTemplates.value.map((template) => ({
      id: template.id,
      nameKey: null,
      title: template.title,
      icon: 'star',
      tone: CUSTOM_TEMPLATE_TONE,
      descriptionKey: null,
      content: template.content,
    })),
  ])

  const saved = computed<JournalTemplate[]>(() => all.value.slice(BUILTIN_JOURNAL_TEMPLATES.length))

  /** Stores a copy of the current entry as a reusable template. */
  function saveTemplate(title: string, content: TiptapDocument): StoredTemplate | null {
    const name = title.trim()
    if (!name) return null
    const template: StoredTemplate = {
      id: crypto.randomUUID(),
      title: name,
      content: JSON.parse(JSON.stringify(content)) as TiptapDocument,
    }
    userTemplates.value = [...userTemplates.value, template]
    persist()
    return template
  }

  function removeTemplate(id: string): void {
    userTemplates.value = userTemplates.value.filter((template) => template.id !== id)
    persist()
  }

  function persist(): void {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userTemplates.value))
  }

  return { userTemplates, all, saved, saveTemplate, removeTemplate }
})

function readTemplates(): StoredTemplate[] {
  if (typeof localStorage === 'undefined') return []
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap((value) => {
    if (typeof value !== 'object' || value === null) return []
    const candidate = value as Record<string, unknown>
    if (typeof candidate.id !== 'string' || typeof candidate.title !== 'string') return []
    if (!isTiptapDocument(candidate.content)) return []
    return [{ id: candidate.id, title: candidate.title, content: candidate.content }]
  })
}
