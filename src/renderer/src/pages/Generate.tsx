import { useEffect, useState } from 'react'
import MarkdownLatex from '../components/MarkdownLatex'

type Props = { kpIds: number[]; onOpen: (id: number) => void }
type Detail = Awaited<ReturnType<typeof window.api.questionsGet>>

export default function Generate({ kpIds, onOpen }: Props): JSX.Element {
  const [names, setNames] = useState<string[]>([])
  const [qtype, setQtype] = useState<'choice' | 'answer' | 'comprehensive'>('choice')
  const [count, setCount] = useState(1)
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const [preview, setPreview] = useState('')
  const [doneIds, setDoneIds] = useState<number[]>([])
  const [viewIdx, setViewIdx] = useState(0)
  const [view, setView] = useState<Detail | null>(null)

  useEffect(() => {
    void window.api.kgGet().then((g) => {
      setNames(g.nodes.filter((n) => kpIds.includes(n.id)).map((n) => n.name))
    })
    return window.api.on('progress', (p) => {
      if ('task' in p && p.task === 'gen') {
        setProgress(p.message)
        if (p.preview != null) setPreview(p.preview)
      }
    })
  }, [kpIds])

  useEffect(() => {
    return window.api.on('gen:done', (p) => {
      if ('task' in p || typeof p.questionId !== 'number') return
      const incoming = Array.isArray(p.questionIds) ? p.questionIds : null
      const id = p.questionId
      setDoneIds((prev) => {
        const next = incoming ?? (prev.includes(id) ? prev : [...prev, id])
        setViewIdx((i) => (prev.length === 0 || i >= prev.length - 1 ? next.length - 1 : i))
        return next
      })
    })
  }, [])

  useEffect(() => {
    const id = doneIds[viewIdx]
    if (!id) {
      setView(null)
      return
    }
    void window.api.questionsGet(id).then(setView).catch(() => setView(null))
  }, [doneIds, viewIdx])

  async function start(): Promise<void> {
    setState('loading')
    setError('')
    setPreview('')
    setDoneIds([])
    setViewIdx(0)
    setView(null)
    try {
      await window.api.genCreate({ kpIds, qtype, count })
      setProgress('')
      setPreview('')
      setState('ok')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setState('error')
    }
  }

  const currentId = doneIds[viewIdx]

  return (
    <div>
      <h2>出题</h2>
      <div className="chips">
        {names.map((n) => (
          <span key={n} className="chip">
            {n}
          </span>
        ))}
      </div>
      <div className="row">
        <select value={qtype} onChange={(e) => setQtype(e.target.value as typeof qtype)}>
          <option value="choice">选择题</option>
          <option value="answer">简答题</option>
          <option value="comprehensive">综合题</option>
        </select>
        <input
          type="number"
          min={1}
          max={5}
          value={count}
          onChange={(e) => setCount(Math.min(5, Math.max(1, Number(e.target.value) || 1)))}
        />
        <button onClick={() => void start()} disabled={!kpIds.length || state === 'loading'}>
          {state === 'loading' ? '生成中…' : '开始生成'}
        </button>
      </div>
      {state === 'loading' && progress && <p>{progress}</p>}
      {state === 'loading' && (
        <section className="card stream-box">
          {preview ? <MarkdownLatex text={preview} /> : <p className="muted">等待模型输出…</p>}
        </section>
      )}
      {state === 'error' && (
        <p className="err">
          {error} <button onClick={() => void start()}>重试</button>
        </p>
      )}
      {doneIds.length > 0 && (
        <>
          <div className="row">
            <button disabled={viewIdx <= 0} onClick={() => setViewIdx((i) => i - 1)}>
              上一题
            </button>
            <span>
              {viewIdx + 1}/{doneIds.length}
              {state === 'loading' ? `（共 ${count} 题，生成中）` : ' 已生成'}
            </span>
            <button
              disabled={viewIdx >= doneIds.length - 1}
              onClick={() => setViewIdx((i) => i + 1)}
            >
              下一题
            </button>
            {currentId ? (
              <button className="link" onClick={() => onOpen(currentId)}>
                打开详情
              </button>
            ) : null}
          </div>
          {view && (
            <section className="card">
              <h2>题目</h2>
              <MarkdownLatex text={view.question.stem} />
              {view.question.options?.map((o) => (
                <MarkdownLatex key={o} text={o} />
              ))}
              <h2>答案</h2>
              <MarkdownLatex text={view.question.answer ?? ''} />
            </section>
          )}
        </>
      )}
    </div>
  )
}
