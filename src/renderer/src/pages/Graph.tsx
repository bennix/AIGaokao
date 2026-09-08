import { useEffect, useMemo, useState } from 'react'
import { kgBuildButtonLabel, kgBuildHint } from '../../../shared/kg-resume'
import { buildKpForest, type KpTreeNode } from '../../../shared/kp-tree'
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

  const forest = useMemo(() => buildKpForest(nodes), [nodes])

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
      <p className="muted">
        共 {nodes.length} 个知识点。勾选后可生成题目，或到题库中筛选。
      </p>
      <div className="graph-layout">
        <aside className="graph-tree">
          {forest.map((root) => (
            <div key={root.id} className="graph-tree-root">
              <KpRow node={root} selected={selected} onToggle={toggle} />
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
        <button
          disabled={!selected.size}
          onClick={() => {
            void (async () => {
              try {
                const r = await window.api.questionsQuery({
                  kpIds: [...selected],
                  page: 1,
                  pageSize: 500
                })
                if (!r.items.length) throw new Error('所选知识点下没有题目')
                await window.api.questionsExport(
                  r.items.map((q) => q.id),
                  'markdown'
                )
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e))
                setState('error')
              }
            })()
          }}
        >
          导出 Markdown
        </button>
      </div>
      <div className="graph-gen">
        {genKpIds.length > 0 && <Generate kpIds={genKpIds} onOpen={onOpenQuestion} />}
        <Pending />
      </div>
    </div>
  )
}

function KpRow({
  node,
  selected,
  onToggle
}: {
  node: KpTreeNode
  selected: Set<number>
  onToggle: (id: number) => void
}): JSX.Element {
  return (
    <div>
      <label>
        <input type="checkbox" checked={selected.has(node.id)} onChange={() => onToggle(node.id)} />
        {node.name}
        {node.questionCount > 0 ? <span className="muted"> · {node.questionCount}</span> : null}
      </label>
      {node.children.map((c) => (
        <div key={c.id} className="graph-tree-child">
          <KpRow node={c} selected={selected} onToggle={onToggle} />
        </div>
      ))}
    </div>
  )
}
