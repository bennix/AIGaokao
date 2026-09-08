import { describe, expect, it } from 'vitest'
import { wrapNodeLabel } from './graph-label'

describe('wrapNodeLabel', () => {
  it('短名不换行', () => {
    expect(wrapNodeLabel('集合', 6)).toBe('集合')
  })
  it('长名按字数折行', () => {
    expect(wrapNodeLabel('集合的表示与运算', 6)).toBe('集合的表示与\n运算')
  })
})
