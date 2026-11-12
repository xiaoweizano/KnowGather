import { describe, expect, it } from 'vitest'
import { sanitizeClipboardHtml } from '../src/renderer/src/editor/core/clipboardSanitizer'

describe('clipboard sanitizer', () => {
  it('preserves semantic document content from web editors', () => {
    const output = sanitizeClipboardHtml(`
      <h2 class="MsoHeading2" style="color:red">计划</h2>
      <ul><li><strong>重点</strong></li></ul>
      <a href="https://example.com" onclick="alert(1)">资料</a>
      <img src="shizhi-attachment://image.png" alt="架构图" style="width:900px" onerror="alert(1)">
      <table class="MsoTable"><tr><th colspan="2">阶段</th></tr><tr><td>P4</td><td>完成</td></tr></table>
    `)

    expect(output).toContain('<h2>计划</h2>')
    expect(output).toContain('<ul><li><strong>重点</strong></li></ul>')
    expect(output).toContain('href="https://example.com"')
    expect(output).toContain('src="shizhi-attachment://image.png"')
    expect(output).toContain('alt="架构图"')
    expect(output).toContain('<table><tr><th colspan="2">阶段</th></tr>')
    expect(output).not.toContain('class=')
    expect(output).not.toContain('style=')
    expect(output).not.toContain('onclick=')
    expect(output).not.toContain('onerror=')
  })

  it('removes scripts, embedded documents and Word export noise', () => {
    const output = sanitizeClipboardHtml(`
      <!--[if gte mso 9]><xml>noise</xml><![endif]-->
      <html><head><meta charset="utf-8"><style>p { color: red }</style></head>
      <body><script>alert('x')</script><iframe src="https://example.com">fallback</iframe>
      <p class="MsoNormal" lang="zh-CN">有效正文</p></body></html>
    `)

    expect(output).toContain('有效正文')
    expect(output).not.toContain('<script')
    expect(output).not.toContain('<iframe')
    expect(output).not.toContain('<style')
    expect(output).not.toContain('MsoNormal')
    expect(output).not.toContain('lang=')
  })

  it('drops executable URL schemes even when entity encoded', () => {
    const output = sanitizeClipboardHtml(`
      <a href="javascript:alert(1)">危险链接</a>
      <a href="java&#x73;cript:alert(2)">编码链接</a>
      <img src="data:image/svg+xml,<svg onload=alert(3)>">
      <a href="shizhi-attachment://file.pdf">附件</a>
    `)

    expect(output).not.toContain('javascript:')
    expect(output).not.toContain('java&#x73;cript:')
    expect(output).not.toContain('data:image')
    expect(output).toContain('href="shizhi-attachment://file.pdf"')
    expect(output).toContain('危险链接')
    expect(output).toContain('编码链接')
  })
})
