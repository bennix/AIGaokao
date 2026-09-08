export type TreeNode = { path: string; type: 'blob' | 'tree'; size?: number }

export const FALLBACK_PDF_DIRS = [
  { path: '春季高考', name: '春季高考' },
  { path: '普通高考', name: '普通高考' }
]

export const PDF_REPO = 'deekur/gaokaomath'
export const PDF_BRANCH = 'main'
export const PDF_TREE_URL = `https://api.github.com/repos/${PDF_REPO}/git/trees/${PDF_BRANCH}?recursive=1`
export const PDF_ZIP_URL = `https://codeload.github.com/${PDF_REPO}/zip/refs/heads/${PDF_BRANCH}`

export function parseGitTree(json: unknown): TreeNode[] {
  if (!json || typeof json !== 'object') return []
  const tree = (json as { tree?: unknown }).tree
  if (!Array.isArray(tree)) return []
  const out: TreeNode[] = []
  for (const item of tree) {
    if (!item || typeof item !== 'object') continue
    const { path, type, size } = item as { path?: unknown; type?: unknown; size?: unknown }
    if (typeof path !== 'string' || (type !== 'blob' && type !== 'tree')) continue
    out.push({ path, type, size: typeof size === 'number' ? size : undefined })
  }
  return out
}

export function topDirs(nodes: TreeNode[]): { path: string; name: string }[] {
  return nodes
    .filter((n) => n.type === 'tree' && !n.path.includes('/'))
    .map((n) => ({ path: n.path, name: n.path }))
}

export function pdfsUnder(nodes: TreeNode[], dirPath: string): { path: string; size: number }[] {
  return nodes
    .filter((n) => n.type === 'blob' && isPdfUnderDir(n.path, dirPath))
    .map((n) => ({ path: n.path, size: n.size ?? -1 }))
}

export function rawPdfUrl(filePath: string): string {
  const encoded = filePath.split('/').filter(Boolean).map(encodeURIComponent).join('/')
  return `https://raw.githubusercontent.com/${PDF_REPO}/${PDF_BRANCH}/${encoded}`
}

export function zipEntryRel(entryPath: string): string {
  const parts = entryPath.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.slice(1).join('/')
}

export function isPdfUnderDir(rel: string, dirPath: string): boolean {
  const n = rel.replace(/\\/g, '/')
  const prefix = dirPath.replace(/\\/g, '/').replace(/\/$/, '')
  if (!n.toLowerCase().endsWith('.pdf')) return false
  return n === prefix || n.startsWith(prefix + '/')
}
