import { app, type BrowserWindow } from 'electron'
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'fs'
import { cp, rm, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import extract from 'extract-zip'
import type { ProgressPayload } from '../shared/types'
import { getDb } from './db'
import { importStructured } from './importer'
import { log } from './log'
import { safeJoin, shouldSkipFile } from './pure/download-helpers'
import {
  FALLBACK_PDF_DIRS,
  PDF_TREE_URL,
  PDF_ZIP_URL,
  parseGitTree,
  pdfsUnder,
  rawPdfUrl,
  topDirs,
  type TreeNode
} from './pure/github-tree'

const STRUCTURED_ZIP = 'https://codeload.github.com/rainewhk/gaokao/zip/refs/heads/main'
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
    log(`downloadStructured fail ${message}`)
    send(win, { task: 'download', done: 0, total: 1, message, state: 'error' })
    throw e
  }
}

function dataDir(): string {
  return join(app.getPath('userData'), 'data')
}

function treeCachePath(): string {
  return join(dataDir(), '.gh-pdf-tree.json')
}

function readTreeCache(): TreeNode[] | null {
  try {
    const raw = JSON.parse(readFileSync(treeCachePath(), 'utf8')) as { fetchedAt?: number; nodes?: unknown }
    const nodes = parseGitTree({ tree: raw.nodes })
    if (!nodes.length) return null
    return nodes
  } catch (e) {
    void e
    return null
  }
}

function readTreeCacheAgeMs(): number {
  try {
    const raw = JSON.parse(readFileSync(treeCachePath(), 'utf8')) as { fetchedAt?: number }
    return typeof raw.fetchedAt === 'number' ? Date.now() - raw.fetchedAt : Number.POSITIVE_INFINITY
  } catch (e) {
    void e
    return Number.POSITIVE_INFINITY
  }
}

async function writeTreeCache(nodes: TreeNode[]): Promise<void> {
  mkdirSync(dataDir(), { recursive: true })
  await writeFile(treeCachePath(), JSON.stringify({ fetchedAt: Date.now(), nodes }))
}

async function fetchTreeFromApi(): Promise<TreeNode[] | null> {
  try {
    const res = await fetchRetry(PDF_TREE_URL, { headers: UA }, 2, 30_000)
    const nodes = parseGitTree(await res.json())
    return nodes.length ? nodes : null
  } catch (e) {
    void e
    return null
  }
}

// SPEC-GAP: 不再递归打 Contents API（每个年份 1 次，一次下载就会打爆未登录 60 次/小时）。
// 改为 git trees 一次拉全量并落盘缓存；文件走 raw.githubusercontent.com。API 不可用时用兜底目录 + zip。
async function loadPdfTree(): Promise<TreeNode[] | null> {
  const cached = readTreeCache()
  const fresh = cached && readTreeCacheAgeMs() < 7 * 24 * 60 * 60 * 1000
  if (fresh) return cached
  const remote = await fetchTreeFromApi()
  if (remote) {
    await writeTreeCache(remote)
    return remote
  }
  return cached
}

export async function listPdfDirs(): Promise<{ path: string; name: string }[]> {
  const nodes = await loadPdfTree()
  if (nodes) {
    const dirs = topDirs(nodes)
    if (dirs.length) return dirs
  }
  return FALLBACK_PDF_DIRS
}

function nodesFromWalk(dir: string, prefix = ''): TreeNode[] {
  const nodes: TreeNode[] = []
  for (const name of readdirSafe(dir)) {
    const rel = prefix ? `${prefix}/${name}` : name
    const p = join(dir, name)
    try {
      if (statSync(p).isDirectory()) {
        nodes.push({ path: rel, type: 'tree' })
        nodes.push(...nodesFromWalk(p, rel))
      } else {
        nodes.push({ path: rel, type: 'blob', size: statSync(p).size })
      }
    } catch (e) {
      void e
    }
  }
  return nodes
}

async function downloadPdfDirViaZip(win: BrowserWindow, dirPath: string, pdfRoot: string): Promise<void> {
  const tmpZip = join(dataDir(), 'gaokaomath.zip')
  const extractRoot = join(dataDir(), 'gaokaomath-zip')
  send(win, {
    task: 'download',
    done: 0,
    total: 1,
    message: 'GitHub API 不可用，改为整包下载（避开限流）…',
    state: 'running'
  })
  try {
    const res = await fetchRetry(PDF_ZIP_URL, { headers: UA }, 3, 30 * 60 * 1000)
    if (cancelled) {
      send(win, { task: 'download', done: 0, total: 1, message: '已取消', state: 'cancelled' })
      return
    }
    await writeFile(tmpZip, Buffer.from(await res.arrayBuffer()))
    send(win, { task: 'download', done: 0, total: 1, message: '解压中…', state: 'running' })
    mkdirSync(extractRoot, { recursive: true })
    await extract(tmpZip, { dir: extractRoot })
    const zipRoot =
      readdirSafe(extractRoot)
        .map((n) => join(extractRoot, n))
        .find((p) => {
          try {
            return statSync(p).isDirectory()
          } catch (e) {
            void e
            return false
          }
        }) ?? extractRoot
    await writeTreeCache(nodesFromWalk(zipRoot))
    const src = safeJoin(zipRoot, dirPath)
    if (!existsSync(src)) {
      send(win, { task: 'download', done: 0, total: 0, message: `${dirPath} 下没有 PDF`, state: 'error' })
      return
    }
    const dest = safeJoin(pdfRoot, dirPath)
    mkdirSync(join(dest, '..'), { recursive: true })
    await cp(src, dest, { recursive: true })
    const n = countPdfs(dest)
    send(win, {
      task: 'download',
      done: n,
      total: n,
      message: `下载完成（${n} 个 PDF）`,
      state: 'ok'
    })
  } finally {
    await unlink(tmpZip).catch((e: unknown) => {
      void e
    })
    await rm(extractRoot, { recursive: true, force: true }).catch((e: unknown) => {
      void e
    })
  }
}

export async function downloadPdfDir(win: BrowserWindow, dirPath: string): Promise<void> {
  cancelled = false
  const pdfRoot = join(app.getPath('userData'), 'data', 'pdfs')
  mkdirSync(pdfRoot, { recursive: true })
  send(win, { task: 'download', done: 0, total: 1, message: `正在列出 ${dirPath} 下的 PDF…`, state: 'running' })
  const nodes = await loadPdfTree()
  if (!nodes) {
    await downloadPdfDirViaZip(win, dirPath, pdfRoot)
    return
  }
  const files = pdfsUnder(nodes, dirPath)
  if (cancelled) {
    send(win, { task: 'download', done: 0, total: files.length, message: '已取消', state: 'cancelled' })
    return
  }
  if (!files.length) {
    send(win, { task: 'download', done: 0, total: 0, message: `${dirPath} 下没有 PDF`, state: 'error' })
    return
  }
  let done = 0
  let failed = 0
  for (const f of files) {
    if (cancelled) {
      send(win, { task: 'download', done, total: files.length, message: '已取消', state: 'cancelled' })
      return
    }
    const rel = f.path
    const abs = safeJoin(pdfRoot, rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    const exists = existsSync(abs)
    const localSize = exists ? statSync(abs).size : 0
    if (shouldSkipFile({ exists, localSize, remoteSize: f.size })) {
      done++
      log(`skip ${rel}`)
      send(win, { task: 'download', done, total: files.length, message: `跳过 ${rel}`, state: 'running' })
      continue
    }
    send(win, {
      task: 'download',
      done,
      total: files.length,
      message: `下载中 ${rel}（${done}/${files.length}）`,
      state: 'running'
    })
    let ok = false
    let lastErr: Error | null = null
    for (let i = 0; i < 3 && !ok; i++) {
      try {
        const r = await fetchRetry(rawPdfUrl(rel), { headers: UA }, 1, 30_000)
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
      log(`pdf fail ${rel} ${lastErr?.message ?? ''}`)
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
    message: failed ? `${failed} 个文件失败` : `下载完成（${files.length} 个 PDF）`,
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
      pdfYears.push({ year, fileCount: countPdfs(yp) })
    }
  }
  return { structuredImported: questionCount > 0, questionCount, pdfYears }
}

function countPdfs(dir: string): number {
  let n = 0
  for (const name of readdirSafe(dir)) {
    const p = join(dir, name)
    try {
      if (statSync(p).isDirectory()) n += countPdfs(p)
      else if (name.toLowerCase().endsWith('.pdf')) n++
    } catch (e) {
      void e
    }
  }
  return n
}

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch (e) {
    void e
    return []
  }
}
