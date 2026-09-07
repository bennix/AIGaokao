import { ipcMain, shell } from 'electron'
import { getDb } from './db'
import { encryptKey, decryptKey } from './secure'
import { maskKey } from '../shared/mask'
import { chatText, makeDeps } from './zenmux'

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

function notImplemented(): never {
  throw new Error('未实现')
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
    if (roles.generator === name || roles.solver === name || roles.verifier === name) {
      throw new Error('该模型正被角色占用,请先改指派')
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
  ipcMain.handle('dataStatus', async () => notImplemented())
  ipcMain.handle('dataDownloadStructured', async () => notImplemented())
  ipcMain.handle('dataListPdfDirs', async () => notImplemented())
  ipcMain.handle('dataDownloadPdfDir', async () => notImplemented())
  ipcMain.handle('dataCancel', async () => notImplemented())
  ipcMain.handle('questionsQuery', async () => notImplemented())
  ipcMain.handle('questionsGet', async () => notImplemented())
  ipcMain.handle('questionsDelete', async () => notImplemented())
  ipcMain.handle('questionsExport', async () => notImplemented())
  ipcMain.handle('kgBuild', async () => notImplemented())
  ipcMain.handle('kgCancel', async () => notImplemented())
  ipcMain.handle('kgGet', async () => notImplemented())
  ipcMain.handle('genCreate', async () => notImplemented())
  ipcMain.handle('genPending', async () => notImplemented())
  ipcMain.handle('genResolve', async () => notImplemented())
  ipcMain.handle('solveRun', async () => notImplemented())
  ipcMain.handle('pdfList', async () => notImplemented())
}
