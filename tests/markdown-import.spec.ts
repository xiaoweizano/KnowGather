import { describe, expect, it } from 'vitest'
import { guessTitleFromContent, markdownToHtml, renderInline } from '../src/main/importers/textFormats'

describe('markdown to html', () => {
  it('converts headings and paragraphs', () => {
    const html = markdownToHtml('# 一级标题\n\n正文段落。\n\n## 二级标题')
    expect(html).toContain('<h1>一级标题</h1>')
    expect(html).toContain('<p>正文段落。</p>')
    expect(html).toContain('<h2>二级标题</h2>')
  })

  it('converts fenced code blocks without interpreting their contents', () => {
    const html = markdownToHtml('```js\nconst a = 1 < 2\n```')
    expect(html).toContain('<pre><code class="language-js">')
    expect(html).toContain('const a = 1 &lt; 2')
    // Markdown inside a code fence must stay literal.
    expect(html).not.toContain('<strong>')
  })

  it('converts bullet, ordered and task lists', () => {
    const bullets = markdownToHtml('- 苹果\n- 香蕉')
    expect(bullets).toContain('<ul>')
    expect(bullets).toContain('<li><p>苹果</p></li>')

    const ordered = markdownToHtml('1. 第一步\n2. 第二步')
    expect(ordered).toContain('<ol>')

    const tasks = markdownToHtml('- [x] 已完成\n- [ ] 待办')
    expect(tasks).toContain('data-type="taskList"')
    expect(tasks).toContain('data-checked="true"')
    expect(tasks).toContain('data-checked="false"')
  })

  it('converts block quotes recursively', () => {
    const html = markdownToHtml('> 引用内容\n> 第二行')
    expect(html).toContain('<blockquote>')
    expect(html).toContain('引用内容')
  })

  it('converts tables with alignment', () => {
    const html = markdownToHtml('| 名称 | 数量 |\n| :--- | ---: |\n| 苹果 | 3 |')
    expect(html).toContain('<table>')
    expect(html).toContain('<th style="text-align: left">名称</th>')
    expect(html).toContain('<th style="text-align: right">数量</th>')
    expect(html).toContain('苹果')
    expect(html).toContain('>3<')
  })

  it('converts links and images', () => {
    const html = markdownToHtml('[示例](https://example.com) 和 ![图](https://example.com/a.png)')
    expect(html).toContain('<a href="https://example.com">示例</a>')
    expect(html).toContain('<img src="https://example.com/a.png" alt="图">')
  })

  it('converts horizontal rules', () => {
    expect(markdownToHtml('上文\n\n---\n\n下文')).toContain('<hr>')
  })

  it('escapes raw HTML so imports cannot inject markup', () => {
    const html = markdownToHtml('<script>alert(1)</script>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('inline markdown', () => {
  it('converts emphasis, strikethrough and highlight', () => {
    expect(renderInline('**粗** *斜* ~~删除~~ ==高亮=='))
      .toBe('<strong>粗</strong> <em>斜</em> <s>删除</s> <mark>高亮</mark>')
  })

  it('keeps inline code literal', () => {
    expect(renderInline('`**not bold**`')).toBe('<code>**not bold**</code>')
  })

  it('handles underscores inside words without breaking them', () => {
    expect(renderInline('snake_case_name')).toBe('snake_case_name')
  })
})

describe('title guessing', () => {
  it('uses the first non-empty line without heading markers', () => {
    expect(guessTitleFromContent('\n\n# 我的标题\n正文', 'fallback')).toBe('我的标题')
    expect(guessTitleFromContent('   ', 'fallback')).toBe('fallback')
  })

  it('truncates very long first lines', () => {
    const title = guessTitleFromContent('长'.repeat(200), 'fallback')
    expect(title.length).toBe(80)
  })
})
