import { useEffect, useRef, useState } from 'react'
import cytoscape, { type Core, type EventObject } from 'cytoscape'
import { wrapNodeLabel } from '../../../shared/graph-label'
import { kgBuildButtonLabel, kgBuildHint } from '../../../shared/kg-resume'
import { gestureFromWheel, nextZoom } from '../../../shared/viewport-gesture'
import Generate from './Generate'
import Pending from './Pending'

type Node = { id: number; name: string; level: string; parentId: number | null; questionCount: number }
type Props = { onFilterBank: (kpIds: number[]) => void; onOpenQuestion: (id: number) => void }

export default function Graph({ onFilterBank, onOpenQuestion }: Props): JSX.Element {
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<{ a: number; b: number }[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('loading')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const [build, setBuild] = useState({ processed: 0, remaining: 0 })
  const [genKpIds, setGenKpIds] = useState<number[]>([])
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)
  const host = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  async function load(): Promise<void> {
    setState('loading')
    try {
      const g = await window.api.kgGet()
      setNodes(g.nodes)
      setEdges(g.edges)
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

  useEffect(() => {
    if (!host.current) return
    const cy = cytoscape({
      container: host.current,
      boxSelectionEnabled: true,
      selectionType: 'additive',
      panningEnabled: true,
      userPanningEnabled: true,
      zoomingEnabled: true,
      userZoomingEnabled: false,
      wheelSensitivity: 0.2,
      minZoom: 0.12,
      maxZoom: 6,
      textureOnViewport: true,
      hideLabelsOnViewport: true,
      hideEdgesOnViewport: true,
      pixelRatio: 'auto',
      autoungrabify: true,
      elements: [
        ...nodes.map((n) => {
          const size = Math.min(72, Math.max(36, 28 + n.questionCount))
          return { data: { id: String(n.id), label: wrapNodeLabel(n.name), full: n.name, size } }
        }),
        ...edges.map((e) => ({ data: { id: `${e.a}-${e.b}`, source: String(e.a), target: String(e.b) } }))
      ],
      layout: {
        name: 'cose',
        padding: 40,
        nodeRepulsion: () => 12000,
        nodeOverlap: 48,
        idealEdgeLength: () => 140,
        componentSpacing: 120,
        gravity: 0.2,
        numIter: 800
      },
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            width: 'data(size)',
            height: 'data(size)',
            'font-size': 10,
            'text-wrap': 'wrap',
            'text-max-width': '72px',
            'text-valign': 'center',
            'text-halign': 'center',
            'text-background-color': '#fff',
            'text-background-opacity': 0.85,
            'text-background-padding': '2px',
            'min-zoomed-font-size': 8,
            'background-color': '#64748b',
            color: '#0f172a',
            'box-selection': 'overlap'
          }
        },
        {
          selector: 'node:selected',
          style: { 'background-color': '#2563eb', color: '#fff', 'text-background-color': '#2563eb' }
        },
        { selector: 'edge', style: { width: 1, 'line-color': '#cbd5e1', 'box-selection': 'none' } }
      ]
    })
    const syncSel = (): void => {
      setSelected(new Set(cy.nodes(':selected').map((n) => Number(n.id()))))
    }
    cy.on('select unselect', 'node', syncSel)
    cy.on('mouseover', 'node', (ev: EventObject) => {
      const p = ev.target.renderedPosition()
      setTip({ x: p.x, y: p.y, text: String(ev.target.data('full') ?? '') })
    })
    cy.on('mouseout', 'node', () => setTip(null))
    for (const id of selectedRef.current) cy.getElementById(String(id)).select()
    cyRef.current = cy
    const el = host.current
    let raf = 0
    let acc = { dx: 0, dy: 0, factor: 1, zx: 0, zy: 0 }
    const flush = (): void => {
      raf = 0
      if (acc.factor !== 1) {
        cy.zoom({
          level: nextZoom(cy.zoom(), acc.factor),
          renderedPosition: { x: acc.zx, y: acc.zy }
        })
      }
      if (acc.dx !== 0 || acc.dy !== 0) cy.panBy({ x: acc.dx, y: acc.dy })
      acc = { dx: 0, dy: 0, factor: 1, zx: 0, zy: 0 }
    }
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      const g = gestureFromWheel(e)
      if (g.type === 'zoom') {
        const r = el.getBoundingClientRect()
        acc.factor *= g.factor
        acc.zx = e.clientX - r.left
        acc.zy = e.clientY - r.top
      } else {
        acc.dx += g.dx
        acc.dy += g.dy
      }
      if (!raf) raf = requestAnimationFrame(flush)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    const ro = new ResizeObserver(() => cy.resize())
    ro.observe(el)
    return () => {
      el.removeEventListener('wheel', onWheel)
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
      cy.destroy()
      cyRef.current = null
    }
  }, [nodes, edges])

  function toggle(id: number): void {
    const cy = cyRef.current
    if (cy) {
      const el = cy.getElementById(String(id))
      if (el.selected()) el.unselect()
      else el.select()
      return
    }
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
      <p className="muted">拖拽或双指滑动平移，鼠标滚轮 / 捏合缩放，Shift 拖拽框选；点击多选，点空白取消。悬停看全称。</p>
      <div className="graph-layout">
        <div className="graph-canvas-wrap">
          <div className="graph-canvas" ref={host} />
          {tip && (
            <div className="graph-tip" style={{ left: tip.x + 12, top: tip.y + 12 }}>
              {tip.text}
            </div>
          )}
        </div>
        <aside className="graph-tree">
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
