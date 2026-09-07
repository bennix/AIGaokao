import { useEffect, useRef, useState } from 'react'
import cytoscape, { type Core } from 'cytoscape'

type Node = { id: number; name: string; level: string; parentId: number | null; questionCount: number }
type Props = { onGenerate: (kpIds: number[]) => void; onFilterBank: (kpIds: number[]) => void }

export default function Graph({ onGenerate, onFilterBank }: Props): JSX.Element {
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<{ a: number; b: number }[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('loading')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const host = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)

  async function load(): Promise<void> {
    setState('loading')
    try {
      const g = await window.api.kgGet()
      setNodes(g.nodes)
      setEdges(g.edges)
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

  useEffect(() => {
    if (!host.current) return
    const cy = cytoscape({
      container: host.current,
      elements: [
        ...nodes.map((n) => {
          const size = Math.min(60, Math.max(20, 20 + n.questionCount))
          return { data: { id: String(n.id), label: n.name, size } }
        }),
        ...edges.map((e) => ({ data: { id: `${e.a}-${e.b}`, source: String(e.a), target: String(e.b) } }))
      ],
      layout: { name: 'cose' },
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            width: 'data(size)',
            height: 'data(size)',
            'font-size': 10,
            'background-color': '#64748b'
          }
        },
        { selector: 'node.selected', style: { 'background-color': '#2563eb' } },
        { selector: 'edge', style: { width: 1, 'line-color': '#cbd5e1' } }
      ]
    })
    cy.on('tap', 'node', (ev) => {
      const id = Number(ev.target.id())
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    })
    cyRef.current = cy
    return () => {
      cy.destroy()
    }
  }, [nodes, edges])

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.nodes().forEach((n) => {
      if (selected.has(Number(n.id()))) n.addClass('selected')
      else n.removeClass('selected')
    })
  }, [selected])

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
    <div className="page">
      <h1>知识图谱</h1>
      <div className="row">
        <button
          onClick={() => {
            setState('loading')
            void window.api
              .kgBuild()
              .then(() => load())
              .catch((e: unknown) => {
                setError(e instanceof Error ? e.message : String(e))
                setState('error')
              })
          }}
        >
          构建图谱
        </button>
        <button onClick={() => void window.api.kgCancel()}>取消</button>
        <span>{progress}</span>
      </div>
      {state === 'error' && (
        <p className="err">
          {error} <button onClick={() => void load()}>重试</button>
        </p>
      )}
      <div className="graph-layout">
        <div className="graph-canvas" ref={host} />
        <aside>
          {chapters.map((c) => (
            <div key={c.id}>
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
        <button disabled={!selected.size} onClick={() => onGenerate([...selected])}>
          生成题目
        </button>
        <button disabled={!selected.size} onClick={() => onFilterBank([...selected])}>
          在题库中筛选
        </button>
      </div>
    </div>
  )
}
