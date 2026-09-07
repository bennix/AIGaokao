import { useEffect, useRef, useState } from 'react'

export default function Pdf(): JSX.Element {
  const [years, setYears] = useState<{ year: string; files: { name: string; url: string }[] }[]>([])
  const [curYear, setCurYear] = useState<string | null>(null)
  const [cur, setCur] = useState<{ name: string; url: string } | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [error, setError] = useState('')
  const [fallback, setFallback] = useState(false)
  const timer = useRef<number | null>(null)

  async function load(): Promise<void> {
    setState('loading')
    try {
      const list = await window.api.pdfList()
      setYears(list)
      setState('ok')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setState('error')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  function open(year: string, f: { name: string; url: string }): void {
    setCur(f)
    setFallback(false)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setFallback(true), 5000)
  }

  const files = years.find((y) => y.year === curYear)?.files ?? []

  return (
    <div className="page pdf-page">
      <h1>PDF 阅卷</h1>
      {state === 'loading' && <p>加载中…</p>}
      {state === 'error' && (
        <p className="err">
          {error} <button onClick={() => void load()}>重试</button>
        </p>
      )}
      <div className="pdf-layout">
        <aside>
          <h2>目录</h2>
          {years.map((y) => (
            <button key={y.year} className={curYear === y.year ? 'active' : ''} onClick={() => setCurYear(y.year)}>
              {y.year}
            </button>
          ))}
          <h2>文件</h2>
          {files.map((f) => (
            <button key={f.url} onClick={() => open(curYear!, f)}>
              {f.name}
            </button>
          ))}
        </aside>
        <div className="pdf-view">
          {cur && !fallback && (
            <iframe
              title={cur.name}
              src={cur.url}
              onLoad={() => {
                if (timer.current) window.clearTimeout(timer.current)
              }}
              onError={() => setFallback(true)}
            />
          )}
          {cur && fallback && (
            <div>
              <p>无法内嵌预览</p>
              <button
                onClick={() => void window.api.pdfOpenExternal(`${curYear}/${cur.name}`)}
              >
                在系统中打开
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
