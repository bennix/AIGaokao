import type { BrowserWindow } from 'electron'
import { getDb } from './db'
import { log } from './log'
import { applyKgResult, KgSchema, type KgRepo } from './pure/kg-core'
import { chatJSON, makeDeps } from './zenmux'
import type { ProgressPayload } from '../shared/types'

let cancelled = false

export function cancelKg(): void {
  cancelled = true
}

function send(win: BrowserWindow, p: ProgressPayload): void {
  win.webContents.send('progress', p)
}

function getSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

function setSetting(key: string, value: string): void {
  getDb()
    .prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value)
}

function sqliteRepo(): KgRepo {
  const db = getDb()
  return {
    upsertKp(name, level, parentId) {
      db.prepare('INSERT OR IGNORE INTO knowledge_points(name, level, parent_id) VALUES (?, ?, ?)').run(
        name,
        level,
        parentId
      )
      return (db.prepare('SELECT id FROM knowledge_points WHERE name = ?').get(name) as { id: number }).id
    },
    linkQuestionKp(qid, kpId) {
      db.prepare('INSERT OR IGNORE INTO question_kp(question_id, kp_id) VALUES (?, ?)').run(qid, kpId)
    },
    addEdge(a, b) {
      db.prepare('INSERT OR IGNORE INTO kp_edges(a_id, b_id) VALUES (?, ?)').run(a, b)
    }
  }
}

const KG_SYSTEM = '你是高考数学教研专家。你只输出 JSON,不输出任何其他文字、解释或 Markdown 围栏。'

export async function buildKg(win: BrowserWindow): Promise<void> {
  cancelled = false
  let cursor = Number(getSetting('kg_build_cursor') ?? '0')
  log(`kgBuild start cursor=${cursor}`)
  const generator = getSetting('role_generator') ?? 'openai/gpt-5.4'
  const totalRow = getDb()
    .prepare("SELECT COUNT(*) AS c FROM questions WHERE source='imported' AND deleted=0 AND id > ?")
    .get(cursor) as { c: number }
  let done = 0
  const deps = makeDeps()
  while (!cancelled) {
    const rows = getDb()
      .prepare(
        "SELECT id, stem FROM questions WHERE source='imported' AND deleted=0 AND id > ? ORDER BY id ASC LIMIT 10"
      )
      .all(cursor) as { id: number; stem: string }[]
    if (!rows.length) break
    send(win, {
      task: 'kg',
      done,
      total: totalRow.c,
      message: `处理 ${rows[0].id}–${rows[rows.length - 1].id}`,
      state: 'running'
    })
    const user = `对下面每道题,给出其所属章节(chapter)、考点(topic)、知识点(point,可多个),
并列出这些知识点之间的关联对。命名使用高中数学课标通用术语,同一概念必须使用完全相同的名称。
输出 JSON,结构:
{"items":[{"question_id":123,"chapter":"...","topic":"...","points":["...","..."]}],
 "edges":[["知识点甲","知识点乙"]]}
题目列表:
${JSON.stringify(rows.map((r) => ({ question_id: r.id, stem: r.stem })))}`
    try {
      const data = await chatJSON(deps, generator, KG_SYSTEM, user, KgSchema)
      const tx = getDb().transaction(() => {
        applyKgResult(sqliteRepo(), data)
        setSetting('kg_build_cursor', String(rows[rows.length - 1].id))
      })
      tx()
      log(`kg batch ok maxId=${rows[rows.length - 1].id}`)
    } catch (e) {
      log(`kg batch fail ${e instanceof Error ? e.message : String(e)}`)
      setSetting('kg_build_cursor', String(rows[rows.length - 1].id))
    }
    cursor = rows[rows.length - 1].id
    done += rows.length
  }
  send(win, {
    task: 'kg',
    done,
    total: totalRow.c,
    message: cancelled ? '已取消' : '构建完成',
    state: cancelled ? 'cancelled' : 'ok'
  })
}

export function kgGet(): {
  nodes: { id: number; name: string; level: string; parentId: number | null; questionCount: number }[]
  edges: { a: number; b: number }[]
} {
  const nodes = getDb()
    .prepare(
      `SELECT kp.id, kp.name, kp.level, kp.parent_id AS parentId,
        (SELECT COUNT(*) FROM question_kp qk JOIN questions q ON q.id = qk.question_id
         WHERE qk.kp_id = kp.id AND q.deleted = 0) AS questionCount
       FROM knowledge_points kp`
    )
    .all() as { id: number; name: string; level: string; parentId: number | null; questionCount: number }[]
  const edges = getDb().prepare('SELECT a_id AS a, b_id AS b FROM kp_edges').all() as { a: number; b: number }[]
  return { nodes, edges }
}
