import { describe, expect, it } from 'vitest'
import { splitSse } from './sse'

describe('splitSse', () => {
  it('抽出 delta content，留下半行', () => {
    const { rest, deltas } = splitSse('data: {"choices":[{"delta":{"content":"甲"}}]}\n\ndata: {"choices":[{"delta":{"content":"乙"}}]}\n\ndata: {"cho')
    expect(deltas).toEqual(['甲', '乙'])
    expect(rest).toBe('data: {"cho')
  })
  it('忽略 [DONE]', () => {
    expect(splitSse('data: [DONE]\n\n')).toEqual({ rest: '', deltas: [] })
  })
})
