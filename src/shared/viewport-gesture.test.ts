import { describe, expect, it } from 'vitest'
import { gestureFromWheel, isMouseWheel, nextZoom, MAX_ZOOM, MIN_ZOOM } from './viewport-gesture'

describe('isMouseWheel', () => {
  it('纵向大步进视为鼠标滚轮', () => {
    expect(isMouseWheel({ deltaX: 0, deltaY: 100, ctrlKey: false })).toBe(true)
  })

  it('wheelDelta 为 120 倍数视为鼠标', () => {
    expect(isMouseWheel({ deltaX: 0, deltaY: 10, wheelDelta: -120, ctrlKey: false })).toBe(true)
  })

  it('行模式视为鼠标', () => {
    expect(isMouseWheel({ deltaX: 0, deltaY: 1, deltaMode: 1, ctrlKey: false })).toBe(true)
  })

  it('触控板双轴不是鼠标', () => {
    expect(isMouseWheel({ deltaX: 12, deltaY: -8, ctrlKey: false })).toBe(false)
  })
})

describe('gestureFromWheel', () => {
  it('双指滑动为平移', () => {
    expect(gestureFromWheel({ deltaX: 12, deltaY: -8, ctrlKey: false })).toEqual({
      type: 'pan',
      dx: -12,
      dy: 8
    })
  })

  it('触控板仅纵向小步进仍平移', () => {
    expect(gestureFromWheel({ deltaX: 0, deltaY: 8, ctrlKey: false })).toEqual({
      type: 'pan',
      dx: 0,
      dy: -8
    })
  })

  it('鼠标滚轮为缩放', () => {
    const g = gestureFromWheel({ deltaX: 0, deltaY: 100, ctrlKey: false })
    expect(g.type).toBe('zoom')
    if (g.type === 'zoom') expect(g.factor).toBeCloseTo(0.9)
  })

  it('捏合或 Ctrl+滚轮为缩放', () => {
    const g = gestureFromWheel({ deltaX: 0, deltaY: 20, ctrlKey: true })
    expect(g.type).toBe('zoom')
    if (g.type === 'zoom') {
      expect(g.factor).toBeLessThan(1)
      expect(g.factor).toBeGreaterThan(0.85)
    }
  })

  it('行模式鼠标滚轮为缩放', () => {
    const g = gestureFromWheel({ deltaX: 0, deltaY: 1, deltaMode: 1, ctrlKey: false })
    expect(g.type).toBe('zoom')
    if (g.type === 'zoom') expect(g.factor).toBeCloseTo(0.9)
  })
})

describe('nextZoom', () => {
  it('夹在上下限内', () => {
    expect(nextZoom(1, 100)).toBe(MAX_ZOOM)
    expect(nextZoom(1, 0.001)).toBe(MIN_ZOOM)
    expect(nextZoom(1, 1.1)).toBeCloseTo(1.1)
  })
})
