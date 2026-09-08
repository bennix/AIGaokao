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
  const [streamMsg, setStreamMsg] = useState('')
  const [streamPreview, setStreamPreview] = useState('')

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
    const offDone = window.api.on('solve:done', (p) => {
      if ('questionId' in p && p.questionId === id) {
        setStreamPreview('')
        setStreamMsg('')
        void load()
      }
    })
    const offProg = window.api.on('progress', (p) => {
      if (!('task' in p) || p.task !== 'gen') return
      if (p.questionId != null && p.questionId !== id) return
      setStreamMsg(p.message)
      if (p.preview != null) setStreamPreview(p.preview)
    })
    return () => {
      offDone()
      offProg()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function runSolve(): Promise<void> {
    setSolve('loading')
    setError('')
    setStreamMsg('求解中')
    setStreamPreview('')
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
      <p className="muted">
        {q.year ?? '年份未知'}
        {q.province ? ` · ${q.province}` : ''}
        {' · '}
        {{ choice: '选择题', fill: '填空题', answer: '简答题', comprehensive: '综合题' }[q.qtype] ?? q.qtype}
        {' · '}
        {q.source === 'imported' ? '真题导入' : 'AI 生成'}
        {' · '}
        {{ none: '未验证', verified: '已验证', pending: '待确认', rejected: '未通过' }[q.verifyStatus] ??
          q.verifyStatus}
      </p>
      <p>
        知识点：
        {kps.length
          ? kps.map((k) => k.name).join('、')
          : q.source === 'imported'
            ? '尚未挂接（到知识图谱页继续构建）'
            : '无'}
      </p>
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
      {solve === 'loading' && (
        <section className="card stream-box">
          <h2>{streamMsg || '详解中…'}</h2>
          {streamPreview ? <MarkdownLatex text={streamPreview} /> : <p className="muted">等待模型输出…</p>}
        </section>
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
          <h2>最终答案</h2>
          <MarkdownLatex text={s.finalAnswer} />
          <h2>验证</h2>
          <MarkdownLatex text={`${s.verdict}\n\n${s.note ?? ''}`} />
        </section>
      ))}
    </div>
  )
}
