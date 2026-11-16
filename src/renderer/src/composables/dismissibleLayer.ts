export interface DismissibleEventLike {
  type: string
  key?: string
  target?: EventTarget | null
}

/**
 * Returns true only when a layer should close for the given interaction.
 * Escape always dismisses, while pointer presses must originate outside the layer.
 */
export function shouldDismissLayer(
  event: DismissibleEventLike,
  target: EventTarget | null | undefined,
  selector: string,
): boolean {
  if (event.type === 'keydown') return event.key === 'Escape'
  if (event.type !== 'pointerdown' && event.type !== 'mousedown') return false
  if (!target || typeof (target as Element).closest !== 'function') return true
  const layer = (target as Element).closest(selector)
  if (!layer) return true
  return typeof layer.contains !== 'function' || !layer.contains(target as Node)
}
