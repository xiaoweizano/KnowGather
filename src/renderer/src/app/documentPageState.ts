export type DocumentViewState = 'loading' | 'error' | 'empty' | 'editor'

interface DocumentViewInput {
  loading: boolean
  error: string | null
  current: unknown | null
}

export function resolveDocumentViewState(input: DocumentViewInput): DocumentViewState {
  if (input.current) return 'editor'
  if (input.loading) return 'loading'
  if (input.error) return 'error'
  return 'empty'
}
