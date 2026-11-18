import { describe, expect, it } from 'vitest'
import { buildCategoryMenu, buildEntryMenu, categoryMoveTarget } from '../src/renderer/src/app/knowledgeContextMenu'

const categories = [
  { id: 'work', name: '工作' },
  { id: 'study', name: '学习' },
]

describe('knowledge context menus', () => {
  it('offers only creation and import on the virtual "all" node', () => {
    const menu = buildCategoryMenu({ categoryId: 'all', isVirtual: true })
    expect(menu.map((item) => item.id)).toEqual(['new-document', 'import'])
  })

  it('adds rename and delete for real categories', () => {
    const menu = buildCategoryMenu({ categoryId: 'work', isVirtual: false })
    expect(menu.map((item) => item.id)).toEqual([
      'new-document',
      'import',
      'rename-category',
      'delete-category',
    ])
    expect(menu.find((item) => item.id === 'delete-category')?.danger).toBe(true)
  })

  it('builds the document entry menu with favorite and move targets', () => {
    const menu = buildEntryMenu({ kind: 'document', favorite: false, categories, categoryId: 'work' })
    expect(menu.map((item) => item.id)).toEqual([
      'open',
      'rename',
      'move',
      'favorite',
      'copy-title',
      'delete',
    ])
    expect(menu.find((item) => item.id === 'favorite')?.labelKey).toBe('library.context.favorite')

    const move = menu.find((item) => item.id === 'move')
    expect(move?.children?.map((child) => child.id)).toEqual(['move:null', 'move:work', 'move:study'])
    // The category the entry already lives in cannot be chosen again.
    expect(move?.children?.[1]?.disabled).toBe(true)
  })

  it('omits favorite for journals and flips the label when already favorited', () => {
    const journalMenu = buildEntryMenu({ kind: 'journal', favorite: false, categories, categoryId: null })
    expect(journalMenu.map((item) => item.id)).not.toContain('favorite')

    const favoriteMenu = buildEntryMenu({ kind: 'document', favorite: true, categories, categoryId: null })
    expect(favoriteMenu.find((item) => item.id === 'favorite')?.labelKey).toBe('library.context.unfavorite')
  })

  it('decodes move targets including "uncategorized"', () => {
    expect(categoryMoveTarget('move:null')).toBeNull()
    expect(categoryMoveTarget('move:work')).toBe('work')
    expect(categoryMoveTarget('rename')).toBeUndefined()
  })
})
