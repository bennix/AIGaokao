function extractJsonText(raw: string): string {
  const t = raw.trim()
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fenced ? fenced[1] : t).trim()
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start >= 0 && end > start) return body.slice(start, end + 1)
  return body
}

function repairInStrings(s: string): string {
  let out = ''
  let inStr = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (!inStr) {
      if (c === '"') inStr = true
      out += c
      continue
    }
    if (c === '\\') {
      const n = s[i + 1]
      if (n && '"\\/nrt'.includes(n)) {
        out += c + n
        i++
        continue
      }
      if (n === 'u' && /^[0-9a-fA-F]{4}/.test(s.slice(i + 2, i + 6))) {
        out += s.slice(i, i + 6)
        i += 5
        continue
      }
      out += '\\\\'
      continue
    }
    if (c === '"') {
      inStr = false
      out += c
      continue
    }
    if (c === '\n') {
      out += '\\n'
      continue
    }
    if (c === '\r') {
      out += '\\r'
      continue
    }
    if (c === '\t') {
      out += '\\t'
      continue
    }
    out += c
  }
  return out
}

export function parseLlmJson(raw: string): unknown {
  const extracted = extractJsonText(raw)
  const repaired = repairInStrings(extracted).replace(/,\s*([}\]])/g, '$1')
  return JSON.parse(repaired)
}
