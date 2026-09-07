import { describe, it, expect } from 'vitest'
import { shouldSkipFile, safeJoin } from './download-helpers'

describe('shouldSkipFile', () => {
  it('已存在且大小一致 → 跳过', () => {
    expect(shouldSkipFile({ exists: true, localSize: 100, remoteSize: 100 })).toBe(true)
  })
  it('大小不一致 → 不跳过', () => {
    expect(shouldSkipFile({ exists: true, localSize: 50, remoteSize: 100 })).toBe(false)
  })
  it('不存在 → 不跳过', () => {
    expect(shouldSkipFile({ exists: false, localSize: 0, remoteSize: 100 })).toBe(false)
  })
})

describe('safeJoin(路径穿越防护)', () => {
  it('正常子路径', () => {
    expect(safeJoin('/root/pdfs', '2023/a.pdf')).toBe('/root/pdfs/2023/a.pdf')
  })
  it('../ 穿越 → 抛错', () => {
    expect(() => safeJoin('/root/pdfs', '../secret')).toThrow()
  })
})
