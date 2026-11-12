export interface ToolbarLayoutItem {
  key: string
  width: number
  priority: number
}

export interface ToolbarLayoutOptions {
  fixedWidth?: number
  gap?: number
}

export interface ToolbarLayoutResult {
  visible: string[]
  overflow: string[]
  usedWidth: number
}

/**
 * Allocates toolbar slots by priority. It never emits more width than is
 * available, so the caller can fold the remaining commands into "更多".
 */
export function computeToolbarLayout(
  containerWidth: number,
  items: readonly ToolbarLayoutItem[],
  options: ToolbarLayoutOptions = {},
): ToolbarLayoutResult {
  const fixedWidth = Math.max(0, options.fixedWidth ?? 0)
  const gap = Math.max(0, options.gap ?? 0)
  const available = Math.max(0, containerWidth - fixedWidth)
  const ranked = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => b.item.priority - a.item.priority || a.index - b.index)

  const visibleIndexes = new Set<number>()
  let usedWidth = 0

  for (const candidate of ranked) {
    const itemWidth = Math.max(0, candidate.item.width)
    const nextWidth = usedWidth + itemWidth + (visibleIndexes.size > 0 ? gap : 0)
    if (nextWidth > available) continue
    visibleIndexes.add(candidate.index)
    usedWidth = nextWidth
  }

  return {
    visible: items.filter((_item, index) => visibleIndexes.has(index)).map((item) => item.key),
    overflow: items.filter((_item, index) => !visibleIndexes.has(index)).map((item) => item.key),
    usedWidth,
  }
}
