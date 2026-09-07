import { useEffect, useState } from 'react'
import type { QuestionRow } from '../../../shared/types'

type Props = { onOpen: (id: number) => void; kpIds?: number[] }

export default function Bank({ onOpen, kpIds }: Props): JSX.Element {
  const [keyword, setKeyword] = useState('')
  const [year, setYear] = useState('')
  const [province, setProvince] = useState('')
  const [qtype, setQtype] = useState('')
  const [source, setSource] = useState('')
  const [kpList, setKpList] = useState<{ id: number; name: string }[]>([])
  const [kpSel, setKpSel] = useState<number[]>(kpIds ?? [])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [items, setItems] = useState<QuestionRow[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [error, setError] = useState('')
  const pageSize = 20

  async function load(p = page): Promise<void> {
    setState('loading')
    try {
      const r = await window.api.questionsQuery({
        keyword: keyword || undefined,
        year: year ? Number(year) : undefined,
        province: province || undefined,
        qtype: qtype || undefined,
        source: source ? (source as 'imported' | 'generated') : undefined,
        kpIds: (kpSel.length ? kpSel : kpIds)?.length ? (kpSel.length ? kpSel : kpIds) : undefined,
        page: p,
        pageSize
      })
      setItems(r.items)
      setTotal(r.total)
      setState('ok')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setState('error')
    }
  }

  useEffect(() => {
    void window.api.kgGet().then((g) => setKpList(g.nodes.map((n) => ({ id: n.id, name: n.name }))))
    setKpSel(kpIds ?? [])
    void load(1)
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kpIds])

  function toggle(id: number): void {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  async function del(): Promise<void> {
    if (!selected.length) return
    const ok = window.confirm(
      '确认删除所选题目？真题将隐藏（可恢复），生成题将永久删除（含解法与知识点关联）。'
    )
    if (!ok) return
    try {
      await window.api.questionsDelete(selected)
      setSelected([])
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setState('error')
    }
  }

  async function exp(format: 'json' | 'markdown'): Promise<void> {
    if (!selected.length) return
    try {
      await window.api.questionsExport(selected, format)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const pages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="page">
      <h1>题库</h1>
      <div className="row">
        <input placeholder="关键词" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        <input placeholder="年份" value={year} onChange={(e) => setYear(e.target.value)} />
        <input placeholder="省份/卷种" value={province} onChange={(e) => setProvince(e.target.value)} />
        <select value={qtype} onChange={(e) => setQtype(e.target.value)}>
          <option value="">全部题型</option>
          <option value="choice">选择</option>
          <option value="fill">填空</option>
          <option value="answer">简答</option>
          <option value="comprehensive">综合</option>
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">全部来源</option>
          <option value="imported">真题</option>
          <option value="generated">生成</option>
        </select>
        <select
          value={kpSel[0] ?? ''}
          onChange={(e) => setKpSel(e.target.value ? [Number(e.target.value)] : [])}
        >
          <option value="">全部知识点</option>
          {kpList.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            setPage(1)
            void load(1)
          }}
        >
          筛选
        </button>
      </div>
      <div className="row">
        <button onClick={() => void del()} disabled={!selected.length}>
          批量删除
        </button>
        <button onClick={() => void exp('json')} disabled={!selected.length}>
          导出 JSON
        </button>
        <button onClick={() => void exp('markdown')} disabled={!selected.length}>
          导出 Markdown
        </button>
        <span>共 {total} 题</span>
      </div>
      {state === 'loading' && <p>加载中…</p>}
      {state === 'error' && (
        <p className="err">
          {error} <button onClick={() => void load()}>重试</button>
        </p>
      )}
      <ul className="list">
        {items.map((q) => (
          <li key={q.id}>
            <label>
              <input type="checkbox" checked={selected.includes(q.id)} onChange={() => toggle(q.id)} />
              <button className="link" onClick={() => onOpen(q.id)}>
                [{q.year ?? '—'}] {q.stem.slice(0, 80)}
              </button>
            </label>
          </li>
        ))}
      </ul>
      <div className="row">
        <button
          disabled={page <= 1}
          onClick={() => {
            const n = page - 1
            setPage(n)
            void load(n)
          }}
        >
          上一页
        </button>
        <span>
          {page}/{pages}
        </span>
        <button
          disabled={page >= pages}
          onClick={() => {
            const n = page + 1
            setPage(n)
            void load(n)
          }}
        >
          下一页
        </button>
      </div>
    </div>
  )
}
