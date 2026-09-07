import { useState } from 'react'
import Data from './pages/Data'
import Settings from './pages/Settings'

const NAV = ['数据中心', '题库', 'PDF 阅卷', '知识图谱', 'AI 出题', '待确认', '设置'] as const

export default function App(): JSX.Element {
  const [page, setPage] = useState<(typeof NAV)[number]>('数据中心')

  return (
    <div className="app">
      <nav className="nav">
        {NAV.map((name) => (
          <button
            key={name}
            className={page === name ? 'nav-btn active' : 'nav-btn'}
            onClick={() => setPage(name)}
          >
            {name}
          </button>
        ))}
      </nav>
      <main className="main">
        {page === '设置' ? <Settings /> : page === '数据中心' ? <Data /> : <div>{page}</div>}
      </main>
    </div>
  )
}
