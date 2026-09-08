import { describe, expect, it } from 'vitest'
import { markdownPreviewFromLlm } from './llm-preview'

describe('markdownPreviewFromLlm', () => {
  it('抽出已完整字段', () => {
    expect(markdownPreviewFromLlm('{"method_a":"步骤 $x=1$","final_answer":"1"}')).toContain('步骤 $x=1$')
  })
  it('未闭合字符串也能预览', () => {
    expect(markdownPreviewFromLlm('{"method_a":"设 $a')).toContain('设 $a')
  })
})
