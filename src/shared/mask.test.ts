import { describe, it, expect } from 'vitest'
import { maskKey } from './mask'

describe('maskKey', () => {
  it('长 key 显示前3后4', () => {
    expect(maskKey('zm-1234567890abcd')).toBe('zm-****abcd')
  })
  it('短 key(≤7)只留首字符', () => {
    expect(maskKey('abc')).toBe('a****')
  })
})
