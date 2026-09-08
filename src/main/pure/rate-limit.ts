/** ZenMux 配额：10–15 RPM，取保守值 10；窗口为滚动 1 分钟。5 小时为服务端配额刷新周期，本地只控 RPM。 */
export const ZENMUX_RPM = 10
export const ZENMUX_WINDOW_MS = 60_000

export function nextDelayMs(
  timestamps: number[],
  now: number,
  rpm = ZENMUX_RPM,
  windowMs = ZENMUX_WINDOW_MS
): number {
  const recent = timestamps.filter((t) => now - t < windowMs).sort((a, b) => a - b)
  if (recent.length < rpm) return 0
  return Math.max(0, recent[recent.length - rpm] + windowMs - now)
}

export function pruneStamps(timestamps: number[], now: number, windowMs = ZENMUX_WINDOW_MS): number[] {
  return timestamps.filter((t) => now - t < windowMs)
}
