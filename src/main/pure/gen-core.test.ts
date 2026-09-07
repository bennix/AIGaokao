import { describe, it, expect, vi } from 'vitest'
import { answersMatch, runPipeline, type PipelineDeps } from './gen-core'

describe('answersMatch', () => {
  it('选择题按字母比较,忽略大小写与空白', () => {
    expect(answersMatch(' a ', 'A', 'choice')).toBe(true)
    expect(answersMatch('A', 'B', 'choice')).toBe(false)
  })
  it('非选择题去空白比较', () => {
    expect(answersMatch('x = ±2', 'x=±2', 'answer')).toBe(true)
  })
})

const gen = { stem: 'S', options: null, answer: 'x=1' }
const solveOk = { method_a: 'A', method_b: 'B', faster: null, final_answer: 'x=1' }

function deps(over: Partial<Record<'gen' | 'solve' | 'verify', unknown>>): PipelineDeps {
  return {
    roles: { generator: 'g', solver: 's', verifier: 'v' },
    chatJSON: vi.fn(async (_m: string, _sys: string, _usr: string, schema: { description?: string }, tag?: string) => {
      if (tag === 'gen') return over.gen ?? gen
      if (tag === 'solve') return over.solve ?? solveOk
      return over.verify ?? { verdict: 'agree', note: '' }
    }) as never
  }
}

describe('runPipeline', () => {
  it('答案一致且 agree → verified', async () => {
    const r = await runPipeline(deps({}), { kpNames: ['集合'], qtype: 'answer' })
    expect(r.verifyStatus).toBe('verified')
  })
  it('求解答案不一致 → pending', async () => {
    const r = await runPipeline(deps({ solve: { ...solveOk, final_answer: 'x=2' } }), { kpNames: ['集合'], qtype: 'answer' })
    expect(r.verifyStatus).toBe('pending')
  })
  it('验证 disagree → pending', async () => {
    const r = await runPipeline(deps({ verify: { verdict: 'disagree', note: '步骤3错' } }), { kpNames: ['集合'], qtype: 'answer' })
    expect(r.verifyStatus).toBe('pending')
  })
  it('解题与验证同模型 → 启动即抛错', async () => {
    const d = deps({})
    d.roles = { generator: 'g', solver: 'same', verifier: 'same' }
    await expect(runPipeline(d, { kpNames: ['集合'], qtype: 'answer' })).rejects.toThrow('模型')
  })
})
