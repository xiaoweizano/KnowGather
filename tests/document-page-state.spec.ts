import { describe, expect, it } from 'vitest'
import { resolveDocumentViewState } from '../src/renderer/src/app/documentPageState'

const noDocument = null

describe('document page view state', () => {
  it('shows the loading state only while initialization is running', () => {
    expect(resolveDocumentViewState({ loading: true, error: null, current: noDocument })).toBe('loading')
  })

  it('shows a real empty state after a successful empty load', () => {
    expect(resolveDocumentViewState({ loading: false, error: null, current: noDocument })).toBe('empty')
  })

  it('shows retry UI when initialization failed without a document', () => {
    expect(resolveDocumentViewState({ loading: false, error: '读取失败', current: noDocument })).toBe('error')
  })

  it('keeps an open document visible when a later operation reports an error', () => {
    const current = { id: 'doc-1' }
    expect(resolveDocumentViewState({ loading: false, error: '保存失败', current })).toBe('editor')
  })
})
