import { useEffect, useState } from 'react'
import type { QuestionRow } from '../../../shared/types'
import MarkdownLatex from '../components/MarkdownLatex'

export default function Pending(): JSX.Element {
  const [items, setItems] = useState<QuestionRow[]>([])
  const [open, setOpen] = useState<number | null>(null)
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof window.api.questionsGet>> | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [error, setError] = useState('')

  async function load(): Promise<void> {
    setState('loading')
    try {
      setItems(await window.api.genPending())
      setState('ok')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setState('error')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function expand(id: number): Promise<void> {
    setOpen(id)
    setDetail(await window.api.questionsGet(id))
  }

  async function resolve(id: number, action: 'accept' | 'discard'): Promise<void> {
    try {
      await window.api.genResolve(id, action)
      setOpen(null)
      setDetail(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="page">
      <h1>待确认</h1>
      {state === 'loading' && <p>加载中…</p>}
      {state === 'error' && (
        <p className="err">
          {error} <button onClick={() => void load()}>重试</button>
        </p>
      )}
      <ul className="list">
        {items.map((q) => (
          <li key={q.id}>
            <button className="link" onClick={() => void expand(q.id)}>
              {q.stem.slice(0, 80)}
            </button>
          </li>
        ))}
      </ul>
      {detail && open === detail.question.id && (
        <section className="card">
          <h2>题目</h2>
          <MarkdownLatex text={detail.question.stem} />
          <p>命题人答案：{detail.question.answer}</p>
          <p>解题人答案：{detail.solutions[0]?.finalAnswer}</p>
          <p>验证意见：{detail.solutions[0]?.verdict} {detail.solutions[0]?.note}</p>
          <div className="row">
            <button onClick={() => void resolve(detail.question.id, 'accept')}>采纳</button>
            <button onClick={() => void resolve(detail.question.id, 'discard')}>丢弃</button>
          </div>
        </section>
      )}
    </div>
  )
}
