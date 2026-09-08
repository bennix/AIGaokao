import { describe, it, expect } from 'vitest'
import { nextDelayMs } from './rate-limit'

describe('nextDelayMs', () => {
  it('未达 RPM 不等待', () => {
    expect(nextDelayMs([1000, 2000], 3000, 10)).toBe(0)
  })
  it('达到 10 RPM 等到最早请求滑出 60s 窗口', () => {
    const ts = [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000]
    expect(nextDelayMs(ts, 10_000, 10)).toBe(50_000)
  })
  it('忽略窗口外的时间戳', () => {
    expect(nextDelayMs([0, 70_000], 70_000, 10)).toBe(0)
  })
})
