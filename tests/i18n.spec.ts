import { describe, expect, it } from 'vitest'
import zhCN from '../src/renderer/src/i18n/zh-CN'
import enUS from '../src/renderer/src/i18n/en-US'
import { interpolate } from '../src/renderer/src/i18n'

describe('translation dictionaries', () => {
  it('keeps the Chinese and English key sets identical', () => {
    const zhKeys = Object.keys(zhCN).sort()
    const enKeys = Object.keys(enUS).sort()

    expect(enKeys.filter((key) => !(key in zhCN))).toEqual([])
    expect(zhKeys.filter((key) => !(key in enUS))).toEqual([])
    expect(enKeys).toEqual(zhKeys)
  })

  it('has no empty or whitespace-only translations', () => {
    for (const [key, value] of Object.entries({ ...zhCN, ...enUS })) {
      expect(value.trim(), `empty translation for ${key}`).not.toBe('')
    }
  })

  it('keeps placeholders in sync between languages', () => {
    const placeholders = (value: string): string[] => (value.match(/\{(\w+)\}/g) ?? []).sort()

    for (const key of Object.keys(zhCN)) {
      expect(placeholders(enUS[key] ?? ''), `placeholder mismatch for ${key}`)
        .toEqual(placeholders(zhCN[key] ?? ''))
    }
  })

  it('interpolates named parameters and leaves unknown ones intact', () => {
    expect(interpolate('已添加 {count} 个附件', { count: 3 })).toBe('已添加 3 个附件')
    expect(interpolate('{missing} stays', {})).toBe('{missing} stays')
    expect(interpolate('no params')).toBe('no params')
  })
})
