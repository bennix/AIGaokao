export function pdfAppUrl(rel: string): string {
  return `app-pdf://local/?p=${encodeURIComponent(rel)}`
}

export function relFromAppPdfUrl(reqUrl: string): string {
  const u = new URL(reqUrl)
  const q = u.searchParams.get('p')
  if (q) return q
  const raw = u.host && u.host !== 'local' ? `${u.host}${u.pathname}` : u.pathname
  return decodeURIComponent(raw.replace(/^\//, ''))
}
