import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { getDb } from './db'
import { encryptKey, decryptKey } from './secure'
import { maskKey } from '../shared/mask'
import { chatText, makeDeps } from './zenmux'
import { cancelDownload, dataStatus, downloadPdfDir, downloadStructured, listPdfDirs } from './downloader'
import { questionsDelete, questionsExport, questionsGet, questionsQuery } from './questions'
import { buildKg, cancelKg, kgGet } from './kg'
import { genCreate, genPending, genResolve, solveRun } from './generate'
import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { safeJoin } from './pure/download-helpers'
import { pdfAppUrl } from './pure/pdf-url'

const DEFAULT_ROLES = {
  generator: 'openai/gpt-5.4',
  solver: 'anthropic/claude-sonnet-4.6',
  verifier: 'z-ai/glm-5v-turbo'
} as const

type Role = 'generator' | 'solver' | 'verifier'

function getSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

function setSetting(key: string, value: string): void {
  getDb().prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}

function getRoles(): { generator: string; solver: string; verifier: string } {
  return {
    generator: getSetting('role_generator') ?? DEFAULT_ROLES.generator,
    solver: getSetting('role_solver') ?? DEFAULT_ROLES.solver,
    verifier: getSetting('role_verifier') ?? DEFAULT_ROLES.verifier
  }
}

export function registerIpc(): void {
  ipcMain.handle('settingsGetMasked', async () => {
    const enc = getSetting('apikey_encrypted')
    let apiKeyMasked: string | null = null
    if (enc) {
      apiKeyMasked = maskKey(decryptKey(enc))
    }
    const models = (getDb().prepare('SELECT name FROM models ORDER BY name').all() as { name: string }[]).map(
      (r) => r.name
    )
    return { apiKeyMasked, roles: getRoles(), models }
  })

  ipcMain.handle('settingsSetApiKey', async (_e, plainKey: string) => {
    setSetting('apikey_encrypted', encryptKey(plainKey))
  })

  ipcMain.handle('settingsClearApiKey', async () => {
    getDb().prepare("DELETE FROM settings WHERE key = 'apikey_encrypted'").run()
  })

  ipcMain.handle('settingsSetRole', async (_e, role: Role, model: string) => {
    setSetting(`role_${role}`, model)
  })

  ipcMain.handle('modelsAdd', async (_e, name: string) => {
    getDb().prepare('INSERT OR IGNORE INTO models(name) VALUES (?)').run(name)
  })

  ipcMain.handle('modelsRemove', async (_e, name: string) => {
    const roles = getRoles()
    const used = (['generator', 'solver', 'verifier'] as const).filter((r) => roles[r] === name)
    if (used.length) {
      const labels = { generator: '出题', solver: '解题', verifier: '验证' }
      throw new Error(`该模型正被「${used.map((r) => labels[r]).join('、')}」占用，请先改指派`)
    }
    getDb().prepare('DELETE FROM models WHERE name = ?').run(name)
  })

  ipcMain.handle('zenmuxTest', async () => {
    try {
      const roles = getRoles()
      const text = await chatText(makeDeps(), roles.solver, '1+1=?')
      return { ok: true, message: text.slice(0, 50) }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('openInvite', async () => {
    await shell.openExternal('https://zenmux.ai/invite/GBQMC5')
  })
  ipcMain.handle('dataStatus', async () => dataStatus())
  ipcMain.handle('dataDownloadStructured', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) throw new Error('无窗口')
    await downloadStructured(win)
  })
  ipcMain.handle('dataListPdfDirs', async () => listPdfDirs())
  ipcMain.handle('dataDownloadPdfDir', async (e, dirPath: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) throw new Error('无窗口')
    await downloadPdfDir(win, dirPath)
  })
  ipcMain.handle('dataCancel', async () => {
    cancelDownload()
  })
  ipcMain.handle('questionsQuery', async (_e, q) => questionsQuery(q))
  ipcMain.handle('questionsGet', async (_e, id: number) => questionsGet(id))
  ipcMain.handle('questionsDelete', async (_e, ids: number[]) => questionsDelete(ids))
  ipcMain.handle('questionsExport', async (_e, ids: number[], format: 'json' | 'markdown') =>
    questionsExport(ids, format)
  )
  ipcMain.handle('kgBuild', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) throw new Error('无窗口')
    await buildKg(win)
  })
  ipcMain.handle('kgCancel', async () => {
    cancelKg()
  })
  ipcMain.handle('kgGet', async () => kgGet())
  ipcMain.handle('genCreate', async (e, p) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) throw new Error('无窗口')
    await genCreate(win, p)
  })
  ipcMain.handle('genPending', async () => genPending())
  ipcMain.handle('genResolve', async (_e, id: number, action: 'accept' | 'discard') => genResolve(id, action))
  ipcMain.handle('solveRun', async (e, questionId: number) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) throw new Error('无窗口')
    await solveRun(win, questionId)
  })
  ipcMain.handle('pdfList', async () => {
    const root = join(app.getPath('userData'), 'data', 'pdfs')
    if (!existsSync(root)) return []
    const groups = readdirSync(root).filter((y) => statSync(join(root, y)).isDirectory())
    return groups.map((year) => ({
      year,
      files: walkPdfs(join(root, year), year).map((rel) => ({
        name: rel.slice(year.length + 1) || rel,
        url: pdfAppUrl(rel)
      }))
    }))
  })
  ipcMain.handle('pdfOpenExternal', async (_e, rel: string) => {
    const abs = safeJoin(join(app.getPath('userData'), 'data', 'pdfs'), rel)
    await shell.openPath(abs)
  })
}

function walkPdfs(dir: string, prefix: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const rel = `${prefix}/${name}`
    if (statSync(p).isDirectory()) out.push(...walkPdfs(p, rel))
    else if (name.toLowerCase().endsWith('.pdf')) out.push(rel)
  }
  return out
}
