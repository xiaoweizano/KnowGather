import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const pagePath = fileURLToPath(new URL('../src/renderer/src/app/DocumentEditorPage.vue', import.meta.url))
const navigationPath = fileURLToPath(new URL('../src/renderer/src/components/NavigationRail.vue', import.meta.url))
const sidebarPath = fileURLToPath(new URL('../src/renderer/src/components/ResourceSidebar.vue', import.meta.url))

function source(path: string): string {
  return readFileSync(path, 'utf8')
}

describe('document editor page shell', () => {
  it('renders the knowledge shell and connects sidebar loading and retry states', () => {
    const page = source(pagePath)

    expect(page).toContain('<template>')
    expect(page).toContain('<NavigationRail')
    expect(page).toContain(':initializing="initializing"')
    expect(page).toContain(`:load-error="viewState === 'error' ? loadError : null"`)
    expect(page).toContain('@retry-load="loadKnowledgeBase"')
    expect(page).toContain('@click="createFirstDocument"')
  })

  it('controls navigation in the page shell and handles every real navigation key', () => {
    const rail = source(navigationPath)
    const page = source(pagePath)

    expect(rail).toContain('activeItem: NavigationKey')
    expect(rail).toContain("navigate: [key: NavigationKey]")
    expect(rail).not.toContain("const activeItem = ref('library')")
    expect(rail).toContain("emit('navigate', item.id)")
    expect(page).toContain(':active-item="activeNavigation"')
    expect(page).toContain('@navigate="handleNavigation"')
    expect(page).toContain('resolveNavigationTarget')
  })

  it('renders a real journal page backed by the store and labels unfinished pages honestly', () => {
    const page = source(pagePath)

    expect(page).toContain('documentStore.createJournal')
    expect(page).toContain('documentStore.deleteJournal')
    expect(page).toContain('documentStore.journals')
    expect(page).toContain("activePage.page === 'journal'")
    expect(page).toContain('日志编辑尚未接入，当前仅展示')
    expect(page).toContain('该页面尚未实现')
  })

  it('shows the real local journal count and uses the IME-safe search shortcut', () => {
    const rail = source(navigationPath)
    const sidebar = source(sidebarPath)

    expect(rail).toContain('countJournalsForLocalDate')
    expect(rail).not.toContain('<strong>+1</strong>')
    expect(sidebar).toContain('shouldFocusKnowledgeSearch')
    expect(sidebar).toContain('shouldFocusKnowledgeSearch(event)')
  })
})