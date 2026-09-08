export function unwrapIpcError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  const m = raw.match(/^Error invoking remote method '[^']+': (?:Error: )?(.+)$/s)
  return (m ? m[1] : raw).trim()
}
