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
})
