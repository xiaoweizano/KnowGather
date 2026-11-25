import { describe, expect, it } from 'vitest'
import { ALL_EMOJIS, EMOJI_CATEGORIES, searchEmojis } from '../src/renderer/src/editor/core/emoji'
import zhCN from '../src/renderer/src/i18n/zh-CN'
import enUS from '../src/renderer/src/i18n/en-US'

describe('emoji catalogue', () => {
  it('offers every picker category with entries', () => {
    expect(EMOJI_CATEGORIES.map((category) => category.key)).toEqual([
      'recommend', 'smileys', 'people', 'nature', 'food', 'travel', 'activity', 'objects',
    ])
    for (const category of EMOJI_CATEGORIES) {
      expect(category.emojis.length, `${category.key} should not be empty`).toBeGreaterThan(0)
    }
  })

  it('has translation keys for the panel and every category', () => {
    const keys = ['editor.emoji', 'editor.emoji.placeholder', 'editor.emoji.empty']
    for (const category of EMOJI_CATEGORIES) keys.push(category.labelKey)
    for (const key of keys) {
      expect(zhCN[key as keyof typeof zhCN], `missing zh-CN text for ${key}`).toBeTruthy()
      expect(enUS[key as keyof typeof enUS], `missing en-US text for ${key}`).toBeTruthy()
    }
  })

  it('keeps entries searchable and free of empty keywords', () => {
    for (const entry of ALL_EMOJIS) {
      expect(entry.char.length).toBeGreaterThan(0)
      expect(entry.keywords.trim().length).toBeGreaterThan(0)
    }
    const unique = new Set(ALL_EMOJIS.map((entry) => entry.char))
    expect(unique.size).toBeGreaterThan(150)
  })

  it('finds emoji by Chinese and English keywords', () => {
    expect(searchEmojis('笑').map((entry) => entry.char)).toContain('😄')
    expect(searchEmojis('trophy').map((entry) => entry.char)).toContain('🏆')
    expect(searchEmojis('奶茶').map((entry) => entry.char)).toEqual(['🧋'])
    expect(searchEmojis('🎉')).toEqual([{ char: '🎉', keywords: expect.any(String) }])
  })

  it('returns no results for an empty query or a term that matches nothing', () => {
    expect(searchEmojis('')).toEqual([])
    expect(searchEmojis('   ')).toEqual([])
    expect(searchEmojis('zzzzz-not-an-emoji')).toEqual([])
  })

  it('does not repeat a character in search results', () => {
    const chars = searchEmojis('心').map((entry) => entry.char)
    expect(new Set(chars).size).toBe(chars.length)
  })
})