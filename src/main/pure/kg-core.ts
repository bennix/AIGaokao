import { z } from 'zod'

export const KgSchema = z.object({
  items: z.array(
    z.object({
      question_id: z.number(),
      chapter: z.string(),
      topic: z.string(),
      points: z.array(z.string()).min(1)
    })
  ),
  edges: z.array(z.tuple([z.string(), z.string()]))
})

export type KgData = z.infer<typeof KgSchema>

export type KgRepo = {
  upsertKp(name: string, level: string, parentId: number | null): number
  linkQuestionKp(qid: number, kpId: number): void
  addEdge(a: number, b: number): void
}

export function normalizeEdge(a: number, b: number): [number, number] | null {
  if (a === b) return null
  return a < b ? [a, b] : [b, a]
}

export function applyKgResult(repo: KgRepo, data: KgData): void {
  const edgeSeen = new Set<string>()
  for (const item of data.items) {
    const chapterId = repo.upsertKp(item.chapter, 'chapter', null)
    const topicId = repo.upsertKp(item.topic, 'topic', chapterId)
    for (const point of item.points) {
      const pid = repo.upsertKp(point, 'point', topicId)
      repo.linkQuestionKp(item.question_id, pid)
    }
  }
  for (const [na, nb] of data.edges) {
    const a = repo.upsertKp(na, 'point', null)
    const b = repo.upsertKp(nb, 'point', null)
    const n = normalizeEdge(a, b)
    if (!n) continue
    const key = `${n[0]}-${n[1]}`
    if (edgeSeen.has(key)) continue
    edgeSeen.add(key)
    repo.addEdge(n[0], n[1])
  }
}
