import { describe, it, expect } from 'vitest'
import { renderMarkdownLatex } from './md'

describe('renderMarkdownLatex', () => {
  it('行内公式渲染为 katex span', () => {
    expect(renderMarkdownLatex('设 $x^2$ 为')).toContain('katex')
  })
  it('块级公式 $$...$$', () => {
    expect(renderMarkdownLatex('$$\\frac{1}{2}$$')).toContain('katex')
  })
  it('非法 LaTeX 不抛异常且保留原文', () => {
    const html = renderMarkdownLatex('bad $\\frac{$ end')
    expect(html).toContain('\\frac')
  })
  it('普通 Markdown 正常', () => {
    expect(renderMarkdownLatex('**粗体**')).toContain('<strong>')
  })
  it('含不等式与 frac 的行内公式', () => {
    const html = renderMarkdownLatex('统计部分: $K^2\\approx 4.35 > 3.841$, 对于$(2x-\\frac{1}{x})^5$')
    expect(html).toContain('katex')
    expect(html).not.toContain('$K^2')
    expect(html).not.toContain('$(2x-')
  })
  it('括号包裹的行内公式', () => {
    const html = renderMarkdownLatex('参考答案选B ($a+b=33$), 令$x=1$')
    expect(html).toContain('katex')
    expect(html).not.toContain('$a+b=33$')
  })
  it('\\( \\) 与 \\[ \\] 分隔符', () => {
    expect(renderMarkdownLatex('令 \\(x=1\\) 且 \\[a+b=1\\]')).toContain('katex')
  })
})
