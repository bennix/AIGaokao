import { useState } from 'react'
import Bank from './pages/Bank'
import Data from './pages/Data'
import Graph from './pages/Graph'
import Pdf from './pages/Pdf'
import QuestionDetail from './pages/QuestionDetail'
import Settings from './pages/Settings'

const NAV = ['数据中心', '题库', 'PDF 阅卷', '知识图谱', '设置'] as const

export default function App(): JSX.Element {
  const [page, setPage] = useState<(typeof NAV)[number]>('数据中心')
  const [questionId, setQuestionId] = useState<number | null>(null)
  const [kpFilter, setKpFilter] = useState<number[]>([])

  function go(name: (typeof NAV)[number]): void {
    setPage(name)
    if (name !== '题库') setQuestionId(null)
  }

  return (
    <div className="app">
      <nav className="nav">
        {NAV.map((name) => (
          <button
            key={name}
            className={page === name ? 'nav-btn active' : 'nav-btn'}
            onClick={() => go(name)}
          >
            {name}
          </button>
        ))}
      </nav>
      <main className="main">
        {page === '设置' && <Settings />}
        {page === '数据中心' && <Data />}
        {page === '题库' &&
          (questionId ? (
            <QuestionDetail id={questionId} onBack={() => setQuestionId(null)} solveEnabled />
          ) : (
            <Bank onOpen={setQuestionId} kpIds={kpFilter} />
          ))}
        {page === 'PDF 阅卷' && <Pdf />}
        {page === '知识图谱' && (
          <Graph
            onFilterBank={(ids) => {
              setKpFilter(ids)
              setPage('题库')
            }}
            onOpenQuestion={(id) => {
              setQuestionId(id)
              setPage('题库')
            }}
          />
        )}
      </main>
    </div>
  )
}
