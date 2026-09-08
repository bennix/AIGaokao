export function splitSse(buf: string): { rest: string; deltas: string[] } {
  const parts = buf.split(/\r?\n/)
  const rest = buf.endsWith('\n') ? '' : (parts.pop() ?? '')
  const deltas: string[] = []
  for (const line of parts) {
    const t = line.trim()
    if (!t.startsWith('data:')) continue
    const data = t.slice(5).trim()
    if (!data || data === '[DONE]') continue
    try {
      const j = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] }
      const c = j.choices?.[0]?.delta?.content
      if (c) deltas.push(c)
    } catch {
      /* skip broken frame */
    }
  }
  return { rest, deltas }
}
