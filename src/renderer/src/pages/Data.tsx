import { useEffect, useState } from 'react'
import type { ProgressPayload } from '../../../shared/types'

type Status = {
  structuredImported: boolean
  questionCount: number
  pdfYears: { year: string; fileCount: number }[]
}

type AsyncState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ok'; message?: string }

export default function Data(): JSX.Element {
  const [status, setStatus] = useState<Status | null>(null)
  const [load, setLoad] = useState<AsyncState>({ kind: 'loading' })
  const [struct, setStruct] = useState<AsyncState>({ kind: 'idle' })
  const [dirs, setDirs] = useState<{ path: string; name: string }[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [dirState, setDirState] = useState<AsyncState>({ kind: 'idle' })
  const [pdfState, setPdfState] = useState<AsyncState>({ kind: 'idle' })
  const [progress, setProgress] = useState<ProgressPayload | null>(null)

  async function reload(): Promise<void> {
    setLoad({ kind: 'loading' })
    try {
      setStatus(await window.api.dataStatus())
      setLoad({ kind: 'ok' })
    } catch (e) {
      setLoad({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  useEffect(() => {
    void reload()
    return window.api.on('progress', (p) => {
      if ('task' in p) setProgress(p)
    })
  }, [])

  async function downloadStructured(): Promise<void> {
    setStruct({ kind: 'loading' })
    try {
      await window.api.dataDownloadStructured()
      setStruct({ kind: 'ok', message: progress?.message ?? '完成' })
      await reload()
    } catch (e) {
      setStruct({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  async function listDirs(): Promise<void> {
    setDirState({ kind: 'loading' })
    try {
      setDirs(await window.api.dataListPdfDirs())
      setDirState({ kind: 'ok' })
    } catch (e) {
      setDirState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  async function downloadPdfs(): Promise<void> {
    setPdfState({ kind: 'loading' })
    try {
      for (const p of selected) {
        await window.api.dataDownloadPdfDir(p)
      }
      setPdfState({ kind: 'ok', message: '下载完成' })
      await reload()
    } catch (e) {
      setPdfState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  function toggle(path: string): void {
    setSelected((s) => (s.includes(path) ? s.filter((x) => x !== path) : [...s, path]))
  }

  if (load.kind === 'loading' && !status) return <div>加载中…</div>
  if (load.kind === 'error' && !status) {
    return (
      <div>
        {load.message}
        <button onClick={() => void reload()}>重试</button>
      </div>
    )
  }

  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="page">
      <h1>数据中心</h1>

      <section className="card">
        <h2>结构化题库</h2>
        <p>
          {status?.structuredImported ? `已导入 ${status.questionCount} 题` : '尚未导入'}
        </p>
        <button onClick={() => void downloadStructured()} disabled={struct.kind === 'loading'}>
          {struct.kind === 'loading' ? '下载中…' : '下载结构化题库'}
        </button>
        {struct.kind === 'error' && (
          <p className="err">
            {struct.message} <button onClick={() => void downloadStructured()}>重试</button>
          </p>
        )}
        {struct.kind === 'ok' && <p className="ok">{struct.message ?? '完成'}</p>}
      </section>

      <section className="card">
        <h2>PDF 真题</h2>
        <button onClick={() => void listDirs()} disabled={dirState.kind === 'loading'}>
          {dirState.kind === 'loading' ? '获取中…' : '获取目录列表'}
        </button>
        {dirState.kind === 'error' && (
          <p className="err">
            {dirState.message} <button onClick={() => void listDirs()}>重试</button>
          </p>
        )}
        <ul className="list">
          {dirs.map((d) => (
            <li key={d.path}>
              <label>
                <input type="checkbox" checked={selected.includes(d.path)} onChange={() => toggle(d.path)} />
                {d.name}
              </label>
            </li>
          ))}
        </ul>
        <div className="row">
          <button onClick={() => void downloadPdfs()} disabled={!selected.length || pdfState.kind === 'loading'}>
            {pdfState.kind === 'loading' ? '下载中…' : '下载所选目录'}
          </button>
          <button onClick={() => void window.api.dataCancel()}>取消</button>
        </div>
        {pdfState.kind === 'error' && (
          <p className="err">
            {pdfState.message} <button onClick={() => void downloadPdfs()}>重试</button>
          </p>
        )}
        {status?.pdfYears.map((y) => (
          <p key={y.year}>
            {y.year}: {y.fileCount} 个文件
          </p>
        ))}
      </section>

      {progress && (
        <section className="card">
          <div className="progress">
            <span style={{ width: `${pct}%` }} />
          </div>
          <p>
            {progress.message} ({progress.done}/{progress.total}) {progress.state}
          </p>
        </section>
      )}
    </div>
  )
}
