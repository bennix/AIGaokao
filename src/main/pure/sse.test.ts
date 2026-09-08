import { describe, expect, it } from 'vitest'
import { splitSse } from './sse'

describe('splitSse', () => {
  it('抽出 delta content，留下半行', () => {
    const { rest, deltas, thoughts } = splitSse(
      'data: {"choices":[{"delta":{"content":"甲"}}]}\n\ndata: {"choices":[{"delta":{"content":"乙"}}]}\n\ndata: {"cho'
    )
    expect(deltas).toEqual(['甲', '乙'])
    expect(thoughts).toEqual([])
    expect(rest).toBe('data: {"cho')
  })
  it('忽略 [DONE]', () => {
    expect(splitSse('data: [DONE]\n\n')).toEqual({ rest: '', deltas: [], thoughts: [] })
  })
  it('抽出 reasoning_content 供预览', () => {
    const { deltas, thoughts } = splitSse(
      'data: {"choices":[{"delta":{"reasoning_content":"先比较对数"}}]}\n\n'
    )
    expect(deltas).toEqual([])
    expect(thoughts).toEqual(['先比较对数'])
  })
})
