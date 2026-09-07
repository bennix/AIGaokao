import { app, type BrowserWindow } from 'electron'
import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import extract from 'extract-zip'
import type { ProgressPayload } from '../shared/types'
import { getDb } from './db'
import { importStructured } from './importer'
import { safeJoin, shouldSkipFile } from './pure/download-helpers'

const STRUCTURED_ZIP = 'https://codeload.github.com/rainewhk/gaokao/zip/refs/heads/main'
const PDF_API = 'https://api.github.com/repos/deekur/gaokaomath/contents/'
const UA = { 'User-Agent': 'AIGaokao' }

let cancelled = false

export function cancelDownload(): void {
  cancelled = true
}

function send(win: BrowserWindow, p: ProgressPayload): void {
  win.webContents.send('progress', p)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchRetry(
  url: string,
  init: RequestInit,
  tries: number,
  timeoutMs: number
): Promise<Response> {
  let last: Error = new Error('网络请求失败')
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
      if (res.status === 403 && url.includes('api.github.com')) {
        throw new Error('GitHub 接口限流,请约 1 小时后重试')
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res
    } catch (e) {
      last = e instanceof Error ? e : new Error(String(e))
      if (last.message.includes('限流')) throw last
      if (i < tries - 1) await sleep(5000)
    }
  }
  throw last
}

export async function downloadStructured(win: BrowserWindow): Promise<void> {
  cancelled = false
  const structuredRoot = join(app.getPath('userData'), 'data', 'structured')
  mkdirSync(structuredRoot, { recursive: true })
  const tmpZip = join(app.getPath('userData'), 'data', 'gaokao.zip')
  send(win, { task: 'download', done: 0, total: 1, message: '下载结构化题库…', state: 'running' })
  try {
    const res = await fetchRetry(STRUCTURED_ZIP, {}, 3, 30 * 60 * 1000)
    if (cancelled) {
      send(win, { task: 'download', done: 0, total: 1, message: '已取消', state: 'cancelled' })
      return
    }
    await writeFile(tmpZip, Buffer.from(await res.arrayBuffer()))
    send(win, { task: 'download', done: 1, total: 2, message: '解压中…', state: 'running' })
    await extract(tmpZip, { dir: structuredRoot })
    await unlink(tmpZip).catch((e: unknown) => {
      void e
    })
    send(win, { task: 'download', done: 2, total: 2, message: '开始导入…', state: 'running' })
    const result = importStructured(structuredRoot, win)
    send(win, {
      task: 'import',
      done: result.ok,
      total: result.ok + result.skipped,
      message: `成功 ${result.ok} 条,跳过 ${result.skipped} 条${result.failedFiles.length ? `;失败文件 ${result.failedFiles.length}` : ''}`,
      state: 'ok'
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    send(win, { task: 'download', done: 0, total: 1, message, state: 'error' })
    throw e
  }
}

type GhItem = { type: string; name: string; path: string; download_url: string | null; size?: number }

export async function listPdfDirs(): Promise<{ path: string; name: string }[]> {
  const res = await fetchRetry(PDF_API, { headers: UA }, 3, 30_000)
  const items = (await res.json()) as GhItem[]
  if (!Array.isArray(items)) throw new Error('GitHub 返回异常')
  return items.filter((i) => i.type === 'dir').map((i) => ({ path: i.path, name: i.name }))
}

export async function downloadPdfDir(win: BrowserWindow, dirPath: string): Promise<void> {
  cancelled = false
  const pdfRoot = join(app.getPath('userData'), 'data', 'pdfs')
  mkdirSync(pdfRoot, { recursive: true })
  const res = await fetchRetry(`${PDF_API}${dirPath}`, { headers: UA }, 3, 30_000)
  const items = (await res.json()) as GhItem[]
  const files = items.filter((i) => i.type === 'file' && i.download_url)
  let done = 0
  let failed = 0
  for (const f of files) {
    if (cancelled) {
      send(win, { task: 'download', done, total: files.length, message: '已取消', state: 'cancelled' })
      return
    }
    const rel = join(dirPath, f.name)
    const abs = safeJoin(pdfRoot, rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    const exists = existsSync(abs)
    const localSize = exists ? statSync(abs).size : 0
    if (shouldSkipFile({ exists, localSize, remoteSize: f.size ?? -1 })) {
      done++
      send(win, { task: 'download', done, total: files.length, message: `skip ${rel}`, state: 'running' })
      continue
    }
    let ok = false
    let lastErr: Error | null = null
    for (let i = 0; i < 3 && !ok; i++) {
      try {
        const r = await fetchRetry(f.download_url!, { headers: UA }, 1, 30_000)
        const body = r.body
        if (!body) throw new Error('空响应')
        await pipeline(Readable.fromWeb(body as never), createWriteStream(abs))
        ok = true
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e))
        if (i < 2) await sleep(5000)
      }
    }
    if (!ok) {
      failed++
      void lastErr
    }
    done++
    send(win, {
      task: 'download',
      done,
      total: files.length,
      message: ok ? `已下载 ${rel}` : `失败 ${rel}`,
      state: 'running'
    })
  }
  send(win, {
    task: 'download',
    done: files.length,
    total: files.length,
    message: failed ? `${failed} 个文件失败` : '下载完成',
    state: failed ? 'error' : 'ok'
  })
}

export function dataStatus(): {
  structuredImported: boolean
  questionCount: number
  pdfYears: { year: string; fileCount: number }[]
} {
  const questionCount = (
    getDb().prepare('SELECT COUNT(*) AS c FROM questions WHERE deleted = 0').get() as { c: number }
  ).c
  const pdfRoot = join(app.getPath('userData'), 'data', 'pdfs')
  const pdfYears: { year: string; fileCount: number }[] = []
  if (existsSync(pdfRoot)) {
    for (const year of readdirSafe(pdfRoot)) {
      const yp = join(pdfRoot, year)
      if (!statSync(yp).isDirectory()) continue
      pdfYears.push({ year, fileCount: readdirSafe(yp).length })
    }
  }
  return { structuredImported: questionCount > 0, questionCount, pdfYears }
}

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch (e) {
    void e
    return []
  }
}
