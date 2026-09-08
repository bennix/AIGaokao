import { describe, it, expect, vi } from 'vitest'
import { answersMatch, isSimilarStem, runPipeline, type PipelineDeps } from './gen-core'

describe('answersMatch', () => {
  it('选择题按字母比较,忽略大小写与空白', () => {
    expect(answersMatch(' a ', 'A', 'choice')).toBe(true)
    expect(answersMatch('A', 'B', 'choice')).toBe(false)
  })
  it('非选择题去空白比较', () => {
    expect(answersMatch('x = ±2', 'x=±2', 'answer')).toBe(true)
  })
})

describe('isSimilarStem', () => {
  const a =
    '已知实数 $a=\\log_{\\{\\frac{1}{2}\\}}3$, $b=\\log_2 3$, $c=\\log_3 2$, 则下列大小关系正确的是'
  const b =
    '已知实数 $a=\\log_{\\{\\frac{1}{3}\\}}2$, $b=\\log_2 3$, $c=\\log_3 2$, 则下列大小关系正确的是'
  it('只改底数或数字视为重复', () => {
    expect(isSimilarStem(a, b)).toBe(true)
  })
  it('空白与美元符不影响比较', () => {
    expect(isSimilarStem('求 $x$ 的值', '求x的值')).toBe(true)
  })
  it('题意不同则不判重', () => {
    expect(isSimilarStem(a, '抛物线 $y=x^2$ 过原点，求其焦点坐标')).toBe(false)
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
  it('与已出题干相似则重出', async () => {
    const old =
      '已知实数 $a=\\log_{\\{\\frac{1}{2}\\}}3$, $b=\\log_2 3$, $c=\\log_3 2$, 则下列大小关系正确的是'
    const neu = '抛物线 $y=x^2$ 过原点，求其焦点坐标与准线方程'
    let genCalls = 0
    const d = deps({})
    d.chatJSON = vi.fn(async (_m, _s, user: string, _schema, tag?: string) => {
      if (tag === 'gen') {
        genCalls++
        expect(user).toContain('已出题目')
        return genCalls === 1 ? { stem: old, options: null, answer: 'x=1' } : { stem: neu, options: null, answer: 'x=1' }
      }
      if (tag === 'solve') return solveOk
      return { verdict: 'agree', note: '' }
    }) as never
    const r = await runPipeline(d, {
      kpNames: ['集合'],
      qtype: 'answer',
      avoidStems: [
        '已知实数 $a=\\log_{\\{\\frac{1}{3}\\}}2$, $b=\\log_2 3$, $c=\\log_3 2$, 则下列大小关系正确的是'
      ]
    })
    expect(r.question.stem).toBe(neu)
    expect(genCalls).toBe(2)
  })
})
