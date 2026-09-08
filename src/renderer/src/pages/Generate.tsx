import { useEffect, useState } from 'react'
import MarkdownLatex from '../components/MarkdownLatex'

type Props = { kpIds: number[]; onOpen: (id: number) => void }

export default function Generate({ kpIds, onOpen }: Props): JSX.Element {
  const [names, setNames] = useState<string[]>([])
  const [qtype, setQtype] = useState<'choice' | 'answer' | 'comprehensive'>('choice')
  const [count, setCount] = useState(1)
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const [preview, setPreview] = useState('')
  const [doneId, setDoneId] = useState<number | null>(null)

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
      if ('questionId' in p && typeof p.questionId === 'number') {
        setDoneId(p.questionId)
        setProgress('')
        setPreview('')
        setState('ok')
      }
    })
  }, [])

  async function start(): Promise<void> {
    setState('loading')
    setError('')
    setPreview('')
    try {
      await window.api.genCreate({ kpIds, qtype, count })
      setState('ok')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setState('error')
    }
  }

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
      {state === 'ok' && doneId && (
        <p className="ok">
          已生成{' '}
          <button className="link" onClick={() => onOpen(doneId)}>
            查看题目
          </button>
        </p>
      )}
    </div>
  )
}
