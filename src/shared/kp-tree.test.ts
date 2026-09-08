import { describe, expect, it } from 'vitest'
import { buildKpForest, type KpNode } from './kp-tree'

function n(p: Partial<KpNode> & Pick<KpNode, 'id' | 'name'>): KpNode {
  return { level: 'point', parentId: null, questionCount: 0, ...p }
}

describe('buildKpForest', () => {
  it('章-节-点完整挂上', () => {
    const forest = buildKpForest([
      n({ id: 1, name: '解析几何', level: 'chapter' }),
      n({ id: 2, name: '圆', level: 'topic', parentId: 1 }),
      n({ id: 3, name: '标准方程', level: 'point', parentId: 2 })
    ])
    expect(forest).toHaveLength(1)
    expect(forest[0].name).toBe('解析几何')
    expect(forest[0].children[0].name).toBe('圆')
    expect(forest[0].children[0].children[0].name).toBe('标准方程')
  })

  it('无父节点的 point 也作为根出现', () => {
    const forest = buildKpForest([
      n({ id: 1, name: '解析几何', level: 'chapter' }),
      n({ id: 9, name: '弦的中点', level: 'point', parentId: null })
    ])
    expect(forest.map((x) => x.name)).toEqual(['解析几何', '弦的中点'])
  })

  it('父节点缺失时升为根', () => {
    const forest = buildKpForest([n({ id: 5, name: '切线', parentId: 99 })])
    expect(forest).toHaveLength(1)
    expect(forest[0].name).toBe('切线')
  })

  it('每个 id 只出现一次', () => {
    const nodes = [
      n({ id: 1, name: '章', level: 'chapter' }),
      n({ id: 2, name: '节', level: 'topic', parentId: 1 }),
      n({ id: 3, name: '点', parentId: 2 }),
      n({ id: 4, name: '边', parentId: null })
    ]
    const ids: number[] = []
    const walk = (list: ReturnType<typeof buildKpForest>): void => {
      for (const x of list) {
        ids.push(x.id)
        walk(x.children)
      }
    }
    walk(buildKpForest(nodes))
    expect(ids.sort()).toEqual([1, 2, 3, 4])
  })
})
