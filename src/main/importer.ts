import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import type { BrowserWindow } from 'electron'
import { getDb } from './db'
import { dedupKey, mapRecord } from './pure/map-record'
import type { ProgressPayload } from '../shared/types'
import { log } from './log'

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

function isMathPath(p: string): boolean {
  return /math|数学/i.test(p)
}

function extractRecords(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    for (const v of Object.values(data as Record<string, unknown>)) {
      if (Array.isArray(v)) return v
    }
  }
  return data && typeof data === 'object' ? [data] : []
}

function send(win: BrowserWindow | null, p: ProgressPayload): void {
  win?.webContents.send('progress', p)
}

export function importStructured(root: string, win: BrowserWindow | null = null): {
  ok: number
  skipped: number
  failedFiles: string[]
} {
  const db = getDb()
  const existing = new Set(
    (
      db.prepare("SELECT stem FROM questions WHERE source = 'imported'").all() as { stem: string }[]
    ).map((r) => dedupKey(r.stem))
  )

  let files: string[] = []
  try {
    files = walk(root).filter((p) => /\.jsonl?$/i.test(p) && isMathPath(p))
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e))
  }

  let ok = 0
  let skipped = 0
  const failedFiles: string[] = []
  const insert = db.prepare(
    `INSERT INTO questions (source, qtype, stem, options_json, answer, analysis, raw_json, year, province)
     VALUES ('imported', @qtype, @stem, @options_json, @answer, @analysis, @raw_json, @year, @province)`
  )

  const batch: ReturnType<typeof mapRecord>[] = []
  const flush = db.transaction((rows: NonNullable<ReturnType<typeof mapRecord>>[]) => {
    for (const row of rows) {
      insert.run({
        qtype: row.qtype,
        stem: row.stem,
        options_json: row.options ? JSON.stringify(row.options) : null,
        answer: row.answer,
        analysis: row.analysis,
        raw_json: row.raw,
        year: row.year,
        province: row.province
      })
    }
  })

  function flushBatch(): void {
    const rows = batch.filter((x): x is NonNullable<typeof x> => x !== null)
    if (rows.length) flush(rows)
    batch.length = 0
  }

  files.forEach((file, idx) => {
    send(win, {
      task: 'import',
      done: idx,
      total: files.length,
      message: `导入 ${file}`,
      state: 'running'
    })
    try {
      const text = readFileSync(file, 'utf8')
      const records: unknown[] = []
      if (file.endsWith('.jsonl')) {
        for (const line of text.split(/\r?\n/)) {
          if (!line.trim()) continue
          records.push(JSON.parse(line))
        }
      } else {
        records.push(...extractRecords(JSON.parse(text)))
      }
      for (const rec of records) {
        const mapped = mapRecord(rec)
        if (!mapped) {
          skipped++
          continue
        }
        const key = dedupKey(mapped.stem)
        if (existing.has(key)) {
          skipped++
          continue
        }
        existing.add(key)
        batch.push(mapped)
        if (batch.length >= 500) {
          flushBatch()
        }
        ok++
      }
    } catch (e) {
      failedFiles.push(file)
      log(`import file fail ${file} ${e instanceof Error ? e.message : String(e)}`)
    }
  })
  flushBatch()
  send(win, {
    task: 'import',
    done: files.length,
    total: files.length,
    message: `成功 ${ok} 条,跳过 ${skipped} 条`,
    state: 'ok'
  })
  log(`import ok=${ok} skipped=${skipped} failedFiles=${failedFiles.length}`)
  return { ok, skipped, failedFiles }
}
