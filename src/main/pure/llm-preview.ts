const LABELS: [string, string][] = [
  ['stem', '题干'],
  ['answer', '参考答案'],
  ['method_a', '方法 A'],
  ['method_b', '方法 B'],
  ['faster', '更快解法'],
  ['final_answer', '最终答案'],
  ['verdict', '验证'],
  ['note', '说明']
]

export function extractJsonString(src: string, key: string): string | null {
  const re = new RegExp(`"${key}"\\s*:\\s*"`)
  const m = src.match(re)
  if (!m || m.index == null) return null
  let out = ''
  for (let i = m.index + m[0].length; i < src.length; i++) {
    const c = src[i]
    if (c === '\\' && i + 1 < src.length) {
      const n = src[i + 1]
      const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\' }
      out += map[n] ?? n
      i++
      continue
    }
    if (c === '"') return out
    out += c
  }
  return out
}

export function markdownPreviewFromLlm(raw: string): string {
  const parts: string[] = []
  for (const [key, title] of LABELS) {
    const v = extractJsonString(raw, key)
    if (v) parts.push(`### ${title}\n\n${v}`)
  }
  if (parts.length) return parts.join('\n\n')
  const t = raw.trim()
  return t.startsWith('{') || t.startsWith('```') ? '' : t
}
