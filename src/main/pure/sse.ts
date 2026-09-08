type SseDelta = {
  content?: string
  reasoning_content?: string
  reasoning?: string
}

export function splitSse(buf: string): { rest: string; deltas: string[]; thoughts: string[] } {
  const parts = buf.split(/\r?\n/)
  const rest = buf.endsWith('\n') ? '' : (parts.pop() ?? '')
  const deltas: string[] = []
  const thoughts: string[] = []
  for (const line of parts) {
    const t = line.trim()
    if (!t.startsWith('data:')) continue
    const data = t.slice(5).trim()
    if (!data || data === '[DONE]') continue
    try {
      const j = JSON.parse(data) as { choices?: { delta?: SseDelta }[] }
      const d = j.choices?.[0]?.delta
      if (d?.content) deltas.push(d.content)
      const think = d?.reasoning_content ?? (typeof d?.reasoning === 'string' ? d.reasoning : '')
      if (think) thoughts.push(think)
    } catch {
      /* skip broken frame */
    }
  }
  return { rest, deltas, thoughts }
}
