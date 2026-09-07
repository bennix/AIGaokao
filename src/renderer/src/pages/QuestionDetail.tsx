import { useEffect, useState } from 'react'
import type { QuestionRow, SolutionRow } from '../../../shared/types'
import MarkdownLatex from '../components/MarkdownLatex'

type Props = { id: number; onBack: () => void; solveEnabled?: boolean }

export default function QuestionDetail({ id, onBack, solveEnabled }: Props): JSX.Element {
  const [q, setQ] = useState<QuestionRow | null>(null)
  const [sols, setSols] = useState<SolutionRow[]>([])
  const [kps, setKps] = useState<{ id: number; name: string }[]>([])
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [error, setError] = useState('')
  const [solve, setSolve] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')

  async function load(): Promise<void> {
    setState('loading')
    try {
      const r = await window.api.questionsGet(id)
      setQ(r.question)
      setSols(r.solutions)
      setKps(r.kps)
      setState('ok')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setState('error')
    }
  }

  useEffect(() => {
    void load()
    const off = window.api.on('solve:done', (p) => {
      if ('questionId' in p && p.questionId === id) void load()
    })
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function runSolve(): Promise<void> {
    setSolve('loading')
    try {
      await window.api.solveRun(id)
      setSolve('ok')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSolve('error')
    }
  }

  if (state === 'loading' && !q) return <div>加载中…</div>
  if (state === 'error' && !q) {
    return (
      <div>
        {error} <button onClick={() => void load()}>重试</button>
      </div>
    )
  }
  if (!q) return <div />

  return (
    <div className="page">
      <button onClick={onBack}>返回题库</button>
      <h1>题目详情</h1>
      <p>
        {q.year} {q.province} {q.qtype} {q.source} {q.verifyStatus}
      </p>
      <p>知识点：{kps.map((k) => k.name).join('、') || '无'}</p>
      <section className="card">
        <h2>题干</h2>
        <MarkdownLatex text={q.stem} />
        {q.options?.map((o) => (
          <MarkdownLatex key={o} text={o} />
        ))}
      </section>
      <section className="card">
        <h2>答案</h2>
        <MarkdownLatex text={q.answer ?? ''} />
      </section>
      <section className="card">
        <h2>解析</h2>
        <MarkdownLatex text={q.analysis ?? ''} />
      </section>
      {q.source === 'imported' && (
        <button onClick={() => void runSolve()} disabled={!solveEnabled || solve === 'loading'}>
          {solve === 'loading' ? '详解中…' : 'AI 详解'}
        </button>
      )}
      {solve === 'error' && (
        <p className="err">
          {error} <button onClick={() => void runSolve()}>重试</button>
        </p>
      )}
      {sols.map((s) => (
        <section key={s.id} className="card">
          <h2>方法 A</h2>
          <MarkdownLatex text={s.methodA} />
          <h2>方法 B</h2>
          <MarkdownLatex text={s.methodB} />
          {s.faster && (
            <>
              <h2>更快解法</h2>
              <MarkdownLatex text={s.faster} />
            </>
          )}
          <p>最终答案：{s.finalAnswer}</p>
          <p>
            验证：{s.verdict} {s.note}
          </p>
        </section>
      ))}
    </div>
  )
}
