import { app, BrowserWindow, protocol } from 'electron'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { openDb } from './db'
import { registerIpc } from './ipc'
import { safeJoin } from './pure/download-helpers'
import { relFromAppPdfUrl } from './pure/pdf-url'

protocol.registerSchemesAsPrivileged([
  { scheme: 'app-pdf', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'AIGaokao',
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  openDb(join(app.getPath('userData'), 'aigaokao.db'))
  protocol.handle('app-pdf', async (req) => {
    try {
      const rel = relFromAppPdfUrl(req.url)
      const abs = safeJoin(join(app.getPath('userData'), 'data', 'pdfs'), rel)
      if (!existsSync(abs)) {
        return new Response('找不到该 PDF，请重新下载。', {
          status: 404,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        })
      }
      const data = await readFile(abs)
      return new Response(new Uint8Array(data), { headers: { 'Content-Type': 'application/pdf' } })
    } catch {
      return new Response('无法打开 PDF。', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      })
    }
  })
  registerIpc()
  createWindow()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
