export type KpNode = {
  id: number
  name: string
  level: string
  parentId: number | null
  questionCount: number
}

export type KpTreeNode = KpNode & { children: KpTreeNode[] }

function levelRank(level: string): number {
  if (level === 'chapter') return 0
  if (level === 'topic') return 1
  return 2
}

function ancestorHas(startId: number, childId: number, byId: Map<number, KpTreeNode>): boolean {
  let id: number | null = startId
  const seen = new Set<number>()
  while (id != null) {
    if (id === childId) return true
    if (seen.has(id)) return true
    seen.add(id)
    id = byId.get(id)?.parentId ?? null
  }
  return false
}

function sortNodes<T extends KpNode>(nodes: T[]): T[] {
  return [...nodes].sort((a, b) => levelRank(a.level) - levelRank(b.level) || a.name.localeCompare(b.name, 'zh'))
}

/** 按 parentId 建树，孤立节点（无父、父不存在）升为根，保证每个节点只出现一次。 */
export function buildKpForest(nodes: KpNode[]): KpTreeNode[] {
  const byId = new Map<number, KpTreeNode>()
  for (const n of nodes) byId.set(n.id, { ...n, children: [] })
  const roots: KpTreeNode[] = []
  for (const n of byId.values()) {
    const parent = n.parentId != null && n.parentId !== n.id ? byId.get(n.parentId) : undefined
    if (parent && !ancestorHas(parent.id, n.id, byId)) parent.children.push(n)
    else roots.push(n)
  }
  const walk = (list: KpTreeNode[]): void => {
    const sorted = sortNodes(list)
    list.splice(0, list.length, ...sorted)
    for (const c of list) walk(c.children)
  }
  walk(roots)
  return roots
}
