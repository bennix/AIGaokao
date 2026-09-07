import path from 'path'

export function shouldSkipFile(p: { exists: boolean; localSize: number; remoteSize: number }): boolean {
  return p.exists && p.localSize === p.remoteSize
}

export function safeJoin(root: string, rel: string): string {
  const resolved = path.resolve(root, rel)
  const rootResolved = path.resolve(root)
  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + path.sep)) {
    throw new Error('非法路径')
  }
  return resolved
}
