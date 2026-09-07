export function maskKey(key: string): string {
  if (key.length <= 7) return key.slice(0, 1) + '****'
  return key.slice(0, 3) + '****' + key.slice(-4)
}
