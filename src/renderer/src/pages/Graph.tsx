import { useEffect, useState } from 'react'
import { kgBuildButtonLabel, kgBuildHint } from '../../../shared/kg-resume'
import Generate from './Generate'
import Pending from './Pending'

type Node = { id: number; name: string; level: string; parentId: number | null; questionCount: number }
type Props = { onFilterBank: (kpIds: number[]) => void; onOpenQuestion: (id: number) => void }

export default function Graph({ onFilterBank, onOpenQuestion }: Props): JSX.Element {
  const [nodes, setNodes] = useState<Node[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('loading')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const [build, setBuild] = useState({ processed: 0, remaining: 0 })
  const [genKpIds, setGenKpIds] = useState<number[]>([])

  async function load(): Promise<void> {
    setState('loading')
    try {
      const g = await window.api.kgGet()
      setNodes(g.nodes)
      setBuild(g.build)
      setState('ok')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setState('error')
    }
  }

  useEffect(() => {
    void load()
    return window.api.on('progress', (p) => {
      if ('task' in p && p.task === 'kg') setProgress(`${p.message} ${p.done}/${p.total}`)
    })
  }, [])

  function toggle(id: number): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const chapters = nodes.filter((n) => n.level === 'chapter')
  const topics = nodes.filter((n) => n.level === 'topic')
  const points = nodes.filter((n) => n.level === 'point')

  return (
    <div className="page graph-page">
      <h1>知识图谱</h1>
      <div className="row">
        <button
          disabled={build.remaining === 0 && build.processed > 0}
          onClick={() => {
            setState('loading')
            void window.api
              .kgBuild()
              .then(() => load())
              .catch((e: unknown) => {
                setError(e instanceof Error ? e.message : String(e))
                setState('error')
                void window.api.kgGet().then((g) => setBuild(g.build))
              })
          }}
        >
          {kgBuildButtonLabel(build.processed, build.remaining)}
        </button>
        <button onClick={() => void window.api.kgCancel()}>取消</button>
        <span>{progress || kgBuildHint(build.processed, build.remaining)}</span>
      </div>
      {state === 'error' && (
        <p className="err">
          {error} <button onClick={() => void load()}>重试</button>
        </p>
      )}
      <p className="muted">勾选知识点后可生成题目，或到题库中筛选。</p>
      <div className="graph-layout">
        <aside className="graph-tree">
          {chapters.map((c) => (
            <div key={c.id} className="graph-tree-block">
              <label>
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                {c.name}
              </label>
              {topics
                .filter((t) => t.parentId === c.id)
                .map((t) => (
                  <div key={t.id} style={{ paddingLeft: 12 }}>
                    <label>
                      <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
                      {t.name}
                    </label>
                    {points
                      .filter((p) => p.parentId === t.id)
                      .map((p) => (
                        <div key={p.id} style={{ paddingLeft: 12 }}>
                          <label>
                            <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                            {p.name}
                          </label>
                        </div>
                      ))}
                  </div>
                ))}
            </div>
          ))}
        </aside>
      </div>
      <div className="chips">
        {[...selected].map((id) => (
          <span key={id} className="chip">
            {nodes.find((n) => n.id === id)?.name ?? id}
          </span>
        ))}
      </div>
      <div className="row">
        <button disabled={!selected.size} onClick={() => setGenKpIds([...selected])}>
          生成题目
        </button>
        <button disabled={!selected.size} onClick={() => onFilterBank([...selected])}>
          在题库中筛选
        </button>
      </div>
      <div className="graph-gen">
        {genKpIds.length > 0 && <Generate kpIds={genKpIds} onOpen={onOpenQuestion} />}
        <Pending />
      </div>
    </div>
  )
}
