import { useEffect, useState } from 'react'
import type { QuestionRow } from '../../../shared/types'
import MarkdownLatex from '../components/MarkdownLatex'

export default function Pending(): JSX.Element | null {
  const [items, setItems] = useState<QuestionRow[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [open, setOpen] = useState<number | null>(null)
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof window.api.questionsGet>> | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [error, setError] = useState('')

  async function load(): Promise<void> {
    setState('loading')
    try {
      const next = await window.api.genPending()
      setItems(next)
      setSelected((s) => s.filter((id) => next.some((q) => q.id === id)))
      setState('ok')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setState('error')
    }
  }

  useEffect(() => {
    void load()
    return window.api.on('gen:done', () => {
      void load()
    })
  }, [])

  async function expand(id: number): Promise<void> {
    setOpen(id)
    setDetail(await window.api.questionsGet(id))
  }

  function toggle(id: number): void {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  async function resolve(id: number, action: 'accept' | 'discard'): Promise<void> {
    try {
      await window.api.genResolve(id, action)
      setOpen(null)
      setDetail(null)
      setItems((prev) => prev.filter((q) => q.id !== id))
      setSelected((s) => s.filter((x) => x !== id))
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function expMd(): Promise<void> {
    if (!selected.length) return
    try {
      await window.api.questionsExport(selected, 'markdown')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (state === 'ok' && !items.length && !detail) return null

  return (
    <div>
      <h2>待确认</h2>
      {state === 'loading' && <p>加载中…</p>}
      {state === 'error' && (
        <p className="err">
          {error} <button onClick={() => void load()}>重试</button>
        </p>
      )}
      <div className="row">
        <button onClick={() => void expMd()} disabled={!selected.length}>
          导出 Markdown
        </button>
        {selected.length ? <span>已选 {selected.length}</span> : null}
      </div>
      <ul className="list">
        {items.map((q) => (
          <li key={q.id} className="bank-item">
            <input type="checkbox" checked={selected.includes(q.id)} onChange={() => toggle(q.id)} />
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
          <h2>命题人答案</h2>
          <MarkdownLatex text={detail.question.answer ?? ''} />
          <h2>解题人答案</h2>
          <MarkdownLatex text={detail.solutions[0]?.finalAnswer ?? ''} />
          <h2>验证意见</h2>
          <MarkdownLatex
            text={`${detail.solutions[0]?.verdict ?? ''}\n\n${detail.solutions[0]?.note ?? ''}`}
          />
          <div className="row">
            <button onClick={() => void resolve(detail.question.id, 'accept')}>采纳</button>
            <button onClick={() => void resolve(detail.question.id, 'discard')}>丢弃</button>
          </div>
        </section>
      )}
    </div>
  )
}
