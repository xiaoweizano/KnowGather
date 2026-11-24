import { translate } from '../i18n'

export type ContextMenuKind = 'category' | 'entry'

export interface ContextMenuItem {
  id: string
  /** i18n key; the menu renders `t(labelKey)`. */
  labelKey: string
  icon: string
  danger?: boolean
  disabled?: boolean
  /** Draw a divider above this item. */
  separatorBefore?: boolean
  /** Submenu entries, used for "move to category". */
  children?: ContextMenuItem[]
  /** Literal label for data-driven items such as category names. */
  dynamicLabel?: string
}

export interface CategoryMenuContext {
  categoryId: string | null
  /** True for the virtual "all" node, which has nothing to rename or delete. */
  isVirtual: boolean
  categoryName?: string
}

export interface EntryMenuContext {
  kind: 'document' | 'journal'
  favorite: boolean
  categories: ReadonlyArray<{ id: string; name: string }>
  categoryId: string | null
}

/**
 * Category right-click menu. The virtual "all knowledge" node only offers
 * creation and import, because renaming or deleting it makes no sense.
 */
export function buildCategoryMenu(context: CategoryMenuContext): ContextMenuItem[] {
  // Importing historical files now lands in the journal, so it is not offered
  // as a library-category action.
  const items: ContextMenuItem[] = [
    { id: 'new-document', labelKey: 'library.context.newDocument', icon: 'filePlus' },
  ]
  if (context.isVirtual) return items

  items.push(
    { id: 'rename-category', labelKey: 'library.context.renameCategory', icon: 'edit', separatorBefore: true },
    { id: 'delete-category', labelKey: 'library.context.deleteCategory', icon: 'trash', danger: true },
  )
  return items
}

/** Entry right-click menu for documents and journal entries. */
export function buildEntryMenu(context: EntryMenuContext): ContextMenuItem[] {
  const moveChildren: ContextMenuItem[] = [
    {
      id: 'move:null',
      labelKey: 'library.context.noCategory',
      icon: 'folder',
      disabled: context.categoryId === null,
    },
    ...context.categories.map((category) => ({
      id: `move:${category.id}`,
      labelKey: '',
      // Dynamic labels come from the category records, not the dictionary.
      dynamicLabel: category.name,
      icon: 'folder',
      disabled: category.id === context.categoryId,
    })),
  ]

  return [
    { id: 'open', labelKey: 'library.context.open', icon: context.kind === 'journal' ? 'journal' : 'file' },
    { id: 'rename', labelKey: 'library.context.rename', icon: 'edit' },
    { id: 'move', labelKey: 'library.context.moveTo', icon: 'folder', children: moveChildren },
    ...(context.kind === 'document'
      ? [{
        id: 'favorite',
        labelKey: context.favorite ? 'library.context.unfavorite' : 'library.context.favorite',
        icon: 'star',
      }]
      : []),
    { id: 'copy-title', labelKey: 'library.context.copyTitle', icon: 'copy' },
    { id: 'delete', labelKey: 'library.context.delete', icon: 'trash', danger: true, separatorBefore: true },
  ]
}

/** Resolves a label, falling back to the category/entry name for dynamic items. */
export function contextMenuLabel(item: ContextMenuItem, dynamicNames: Record<string, string> = {}): string {
  if (item.labelKey) return translate(item.labelKey)
  return dynamicNames[item.id] ?? item.id
}

export function categoryMoveTarget(itemId: string): string | null | undefined {
  if (!itemId.startsWith('move:')) return undefined
  const value = itemId.slice('move:'.length)
  return value === 'null' ? null : value
}
