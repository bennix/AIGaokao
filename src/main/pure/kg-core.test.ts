import { describe, it, expect } from 'vitest'
import { KgSchema, applyKgResult, normalizeEdge, type KgRepo } from './kg-core'

function fakeRepo(): KgRepo & { kps: Map<string, number>; links: string[]; edges: string[] } {
  const kps = new Map<string, number>()
  const links: string[] = []
  const edges: string[] = []
  let nextId = 1
  return {
    kps, links, edges,
    upsertKp(name, level, parentId) {
      if (!kps.has(name)) kps.set(name, nextId++)
      return kps.get(name)!
    },
    linkQuestionKp(qid, kpId) { links.push(`${qid}-${kpId}`) },
    addEdge(a, b) { edges.push(`${a}-${b}`) }
  }
}

describe('KgSchema', () => {
  it('拒绝缺字段的输出', () => {
    expect(KgSchema.safeParse({ items: [{}] }).success).toBe(false)
  })
})

describe('normalizeEdge', () => {
  it('保证 a<b', () => { expect(normalizeEdge(5, 3)).toEqual([3, 5]) })
  it('自环返回 null', () => { expect(normalizeEdge(4, 4)).toBeNull() })
})

describe('applyKgResult', () => {
  it('同名知识点归并、层级父子、题目关联、边规范化', () => {
    const repo = fakeRepo()
    applyKgResult(repo, {
      items: [
        { question_id: 1, chapter: '函数', topic: '二次函数', points: ['判别式', '顶点式'] },
        { question_id: 2, chapter: '函数', topic: '二次函数', points: ['判别式'] }
      ],
      edges: [['判别式', '顶点式'], ['顶点式', '判别式']]
    })
    expect(repo.kps.size).toBe(4) // 函数/二次函数/判别式/顶点式,无重复
    expect(repo.links).toContain('2-' + repo.kps.get('判别式'))
    expect(repo.edges).toHaveLength(1) // 双向去重
  })
})
