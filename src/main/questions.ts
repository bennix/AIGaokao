import { dialog } from 'electron'
import { writeFile } from 'fs/promises'
import { getDb } from './db'
import { buildQuestionsQuery } from './pure/query-builder'
import { formatQuestionsMarkdown } from './pure/export-md'
import type { QuestionRow, SolutionRow } from '../shared/types'

type QRow = {
  id: number
  source: string
  year: number | null
  province: string | null
  qtype: string
  stem: string
  options_json: string | null
  answer: string | null
  analysis: string | null
  verify_status: string
  created_at: string
}

export function toQuestionRow(r: QRow): QuestionRow {
  return {
    id: r.id,
    source: r.source,
    year: r.year,
    province: r.province,
    qtype: r.qtype,
    stem: r.stem,
    options: r.options_json ? (JSON.parse(r.options_json) as string[]) : null,
    answer: r.answer,
    analysis: r.analysis,
    verifyStatus: r.verify_status,
    createdAt: r.created_at
  }
}

export function hardDeleteGenerated(ids: number[]): void {
  const db = getDb()
  const tx = db.transaction(() => {
    for (const id of ids) {
      db.prepare('DELETE FROM solutions WHERE question_id = ?').run(id)
      db.prepare('DELETE FROM question_kp WHERE question_id = ?').run(id)
      db.prepare('DELETE FROM questions WHERE id = ?').run(id)
    }
  })
  tx()
}

export function questionsQuery(q: {
  keyword?: string
  year?: number
  province?: string
  qtype?: string
  source?: 'imported' | 'generated'
  kpIds?: number[]
  page: number
  pageSize: number
}): { total: number; items: QuestionRow[] } {
  const { where, params, offset } = buildQuestionsQuery(q)
  const db = getDb()
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM questions WHERE ${where}`).get(...params) as { c: number }).c
  const rows = db
    .prepare(
      `SELECT id, source, year, province, qtype, stem, options_json, answer, analysis, verify_status, created_at
       FROM questions WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, q.pageSize, offset) as QRow[]
  return { total, items: rows.map(toQuestionRow) }
}

export function questionsGet(id: number): {
  question: QuestionRow
  solutions: SolutionRow[]
  kps: { id: number; name: string }[]
} {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT id, source, year, province, qtype, stem, options_json, answer, analysis, verify_status, created_at
       FROM questions WHERE id = ?`
    )
    .get(id) as QRow | undefined
  if (!row) throw new Error('题目不存在')
  const sols = db
    .prepare(
      `SELECT id, method_a, method_b, faster, final_answer, verifier_verdict, verifier_note, solver_model, verifier_model
       FROM solutions WHERE question_id = ? ORDER BY id`
    )
    .all(id) as {
    id: number
    method_a: string
    method_b: string
    faster: string | null
    final_answer: string
    verifier_verdict: string
    verifier_note: string | null
    solver_model: string
    verifier_model: string
  }[]
  const kps = db
    .prepare(
      `SELECT kp.id, kp.name FROM knowledge_points kp
       JOIN question_kp qk ON qk.kp_id = kp.id WHERE qk.question_id = ?`
    )
    .all(id) as { id: number; name: string }[]
  return {
    question: toQuestionRow(row),
    solutions: sols.map((s) => ({
      id: s.id,
      methodA: s.method_a,
      methodB: s.method_b,
      faster: s.faster,
      finalAnswer: s.final_answer,
      verdict: s.verifier_verdict,
      note: s.verifier_note,
      solverModel: s.solver_model,
      verifierModel: s.verifier_model
    })),
    kps
  }
}

export function questionsDelete(ids: number[]): void {
  const db = getDb()
  const imported: number[] = []
  const generated: number[] = []
  for (const id of ids) {
    const src = (db.prepare('SELECT source FROM questions WHERE id = ?').get(id) as { source: string } | undefined)
      ?.source
    if (src === 'generated') generated.push(id)
    else if (src === 'imported') imported.push(id)
  }
  if (imported.length) {
    const ph = imported.map(() => '?').join(',')
    db.prepare(`UPDATE questions SET deleted = 1 WHERE id IN (${ph})`).run(...imported)
  }
  if (generated.length) hardDeleteGenerated(generated)
}

export async function questionsExport(
  ids: number[],
  format: 'json' | 'markdown'
): Promise<{ savedPath: string }> {
  const items = ids.map((id) => questionsGet(id))
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: format === 'json' ? 'questions.json' : 'questions.md'
  })
  if (canceled || !filePath) throw new Error('已取消导出')
  let body: string
  if (format === 'json') {
    body = JSON.stringify(items.map((x) => x.question), null, 2)
  } else {
    body = formatQuestionsMarkdown(
      items.map((x) => ({
        stem: x.question.stem,
        options: x.question.options,
        answer: x.question.answer,
        analysis: x.question.analysis,
        solutions: x.solutions
      }))
    )
  }
  await writeFile(filePath, body, 'utf8')
  return { savedPath: filePath }
}
