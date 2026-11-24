import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BUILTIN_JOURNAL_TEMPLATES } from '../src/renderer/src/app/journalTemplates'

const canvasPath = fileURLToPath(new URL('../src/renderer/src/editor/components/EditorCanvas.vue', import.meta.url))
const startPath = fileURLToPath(new URL('../src/renderer/src/editor/components/TemplateStart.vue', import.meta.url))
const insertPath = fileURLToPath(new URL('../src/renderer/src/editor/core/templateInsert.ts', import.meta.url))

function source(path: string): string {
  return readFileSync(path, 'utf8')
}

describe('template start cards', () => {
  it('offers the full built-in set, not just the original three', () => {
    const ids = BUILTIN_JOURNAL_TEMPLATES.map((template) => template.id)
    expect(ids).toEqual(expect.arrayContaining(['meeting-notes', 'weekly-report', 'project-retro', 'book-notes', 'personal-plan']))
    expect(ids.length).toBeGreaterThanOrEqual(7)
  })

  it('shows the picker only over an empty page, with no dismiss button', () => {
    const start = source(startPath)

    expect(start).toContain('props.editor?.isEmpty')
    expect(start).toContain("previous?.off('update', syncEmpty)")
    expect(start).toContain("editor?.on('update', syncEmpty)")
    expect(start).toContain('templates')
    expect(start).toContain("t('editor.template.prompt')")
    // Typing is what hides the block; there is no "just start writing" button.
    expect(start).not.toContain('editor.template.freeStart')
    expect(start).not.toContain('startWriting')
  })

  it('lays the templates out as a document-flow grid, below a real writing area', () => {
    const start = source(startPath)
    const canvas = source(canvasPath)

    // Prompt line + tile grid, not a floating panel with its own heading.
    expect(start).toContain('template-start-prompt')
    expect(start).toContain('grid-template-columns: repeat(3')
    // Pushed down past a tall blank writing area the editor owns.
    expect(start).toContain('top: var(--template-offset, 200px);')
    expect(canvas).toContain("'has-template-start': templateShown")
    expect(canvas).toContain('min-height: var(--template-offset, 200px);')
    expect(start).not.toContain("t('editor.template.heading') + '</strong>'")
    expect(start).toContain('tone')
    expect(start).toContain("t('editor.template.more')")
  })

  it('inserts into the open editor instead of creating a new entry', () => {
    const canvas = source(canvasPath)
    const insert = source(insertPath)

    expect(canvas).toContain('<TemplateStart')
    expect(canvas).toContain('insertTemplateContent(')
    expect(insert).toContain('editor.isEmpty')
    expect(insert).toContain('.setContent(')
    expect(insert).toContain('.insertContent(')
  })
})
