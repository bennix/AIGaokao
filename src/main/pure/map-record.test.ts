import { describe, it, expect } from 'vitest'
import { mapRecord, dedupKey } from './map-record'

describe('mapRecord', () => {
  it('常见英文字段', () => {
    const r = mapRecord({ question: '求 $x^2=4$ 的解', answer: 'x=±2', analysis: '开方', year: 2023 })
    expect(r).toMatchObject({ stem: '求 $x^2=4$ 的解', answer: 'x=±2', qtype: 'answer', year: 2023 })
  })
  it('中文字段 + 选项数组 → choice', () => {
    const r = mapRecord({ 题目: '下列正确的是', 选项: ['A. 甲', 'B. 乙'], 答案: 'A' })
    expect(r).toMatchObject({ qtype: 'choice', options: ['A. 甲', 'B. 乙'], answer: 'A' })
  })
  it('取不到题干 → null', () => {
    expect(mapRecord({ foo: 1 })).toBeNull()
  })
})

describe('dedupKey', () => {
  it('去空白取前80字符', () => {
    expect(dedupKey('a b\nc')).toBe('abc')
    expect(dedupKey('x'.repeat(200))).toHaveLength(80)
  })
})
