import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isArchiveExtension, isSupportedExtension, splitFrontMatter } from '../src/main/importers/importer'
import { IPC_CHANNELS } from '../src/shared/api'

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
}

describe('import wiring', () => {
  it('exposes the import channel and the image persistence channel', () => {
    expect(IPC_CHANNELS.importsPick).toBe('shizhi:imports:pick')
    expect(IPC_CHANNELS.attachmentsSaveImage).toBe('shizhi:attachments:save-image')
  })

  it('accepts the documented formats and treats zip as an archive', () => {
    for (const extension of ['.txt', '.text', '.log', '.md', '.markdown', '.mdown', '.docx']) {
      expect(isSupportedExtension(extension), extension).toBe(true)
    }
    expect(isArchiveExtension('.zip')).toBe(true)
    expect(isSupportedExtension('.exe')).toBe(false)
    // .doc is deliberately not importable: it is a different (OLE) container.
    expect(isSupportedExtension('.doc')).toBe(false)
  })

  it('renders three import modes and offers merge as an opt-in', () => {
    const dialog = source('../src/renderer/src/components/ImportDialog.vue')

    expect(dialog).toContain("value: 'files'")
    expect(dialog).toContain("value: 'folder'")
    expect(dialog).toContain("value: 'archive'")
    expect(dialog).toContain("t('import.merge')")
    expect(dialog).toContain("t('import.categoryLabel')")
    // The category picker is meaningless when merging into the open document.
    expect(dialog).toContain(':disabled="props.busy || merge"')
  })

  it('keeps the import entry reachable from the sidebar, the empty state and home', () => {
    const sidebar = source('../src/renderer/src/components/ResourceSidebar.vue')
    const page = source('../src/renderer/src/app/DocumentEditorPage.vue')
    const home = source('../src/renderer/src/components/HomePage.vue')

    expect(sidebar).toContain("emit('importDocuments')")
    // Labels now come from the i18n dictionary, so the wiring test asserts the
    // key and the handler instead of the literal Chinese string.
    expect(sidebar).toContain("t('library.importTitle')")
    expect(page).toContain('@import-documents="openImportDialog($event ?? null)"')
    expect(page).toContain('<ImportDialog')
    expect(home).toContain("t('home.importDocuments')")
  })

  it('writes imported documents through the store rather than the UI', () => {
    const store = source('../src/renderer/src/stores/document.ts')

    expect(store).toContain('async function importDocuments')
    expect(store).toContain("api.imports.pick({ mode: options.mode })")
    expect(store).toContain('htmlToDocument(document.html)')
    expect(store).toContain('mergeIntoCurrent')
    // Each imported file is persisted individually so one failure does not
    // discard the rest of the batch.
    expect(store).toContain('api.documents.save(toSavePayload(record))')
  })

  it('honours the injected test path hook only when explicitly configured', () => {
    const ipc = source('../src/main/ipc.ts')

    expect(ipc).toContain('SHIZHI_IMPORT_TEST_PATHS_FILE')
    // Without the variable the real dialog must be shown.
    expect(ipc).toContain('await showDialog(')
  })
})

describe('front matter tolerance', () => {
  it('ignores a front matter block that is not valid YAML', () => {
    const { frontMatter, body } = splitFrontMatter('---\nnot a key value pair\n---\n正文')
    expect(frontMatter).toEqual({})
    expect(body).toBe('正文')
  })
})
