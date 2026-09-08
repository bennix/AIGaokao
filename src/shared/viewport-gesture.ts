export const MIN_ZOOM = 0.12
export const MAX_ZOOM = 6

export type WheelLike = {
  deltaX: number
  deltaY: number
  deltaMode?: number
  wheelDelta?: number
  ctrlKey: boolean
}

export type ViewportGesture = { type: 'pan'; dx: number; dy: number } | { type: 'zoom'; factor: number }

function deltaPx(n: number, deltaMode = 0): number {
  if (deltaMode === 1) return n * 16
  if (deltaMode === 2) return n * 800
  return n
}

/** 鼠标滚轮：行/页模式，或仅纵向且步进较大 / wheelDelta 为 120 的倍数。 */
export function isMouseWheel(e: WheelLike): boolean {
  if (e.ctrlKey) return false
  const mode = e.deltaMode ?? 0
  if (mode === 1 || mode === 2) return true
  if (e.deltaX !== 0) return false
  const wd = e.wheelDelta
  if (typeof wd === 'number' && wd !== 0 && Math.abs(wd) % 120 === 0) return true
  return Math.abs(e.deltaY) >= 40
}

function zoomFactor(dy: number): number {
  return Math.min(1.18, Math.max(0.85, Math.pow(0.997, dy)))
}

function mouseZoomFactor(e: WheelLike): number {
  const raw = e.deltaMode === 1 || e.deltaMode === 2 ? e.deltaY : e.deltaY / 100
  const notches = Math.max(1, Math.round(Math.abs(raw)))
  const step = e.deltaY > 0 ? 0.9 : 1 / 0.9
  return step ** notches
}

/** 鼠标滚轮与捏合缩放；触控板双指滑动平移。 */
export function gestureFromWheel(e: WheelLike): ViewportGesture {
  const dx = deltaPx(e.deltaX, e.deltaMode)
  const dy = deltaPx(e.deltaY, e.deltaMode)
  if (e.ctrlKey) return { type: 'zoom', factor: zoomFactor(dy) }
  if (isMouseWheel(e)) return { type: 'zoom', factor: mouseZoomFactor(e) }
  return { type: 'pan', dx: dx === 0 ? 0 : -dx, dy: dy === 0 ? 0 : -dy }
}

export function nextZoom(current: number, factor: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current * factor))
}
