import { app, BrowserWindow, net, protocol } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { openDb } from './db'
import { registerIpc } from './ipc'
import { safeJoin } from './pure/download-helpers'

protocol.registerSchemesAsPrivileged([{ scheme: 'app-pdf', privileges: { standard: true, stream: true } }])

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'AIGaokao',
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
  protocol.handle('app-pdf', (req) => {
    try {
      const u = new URL(req.url)
      const rel = decodeURIComponent(`${u.host}${u.pathname}`)
      const abs = safeJoin(join(app.getPath('userData'), 'data', 'pdfs'), rel)
      if (!existsSync(abs)) return new Response('not found', { status: 404 })
      return net.fetch(pathToFileURL(abs).toString())
    } catch {
      return new Response('not found', { status: 404 })
    }
  })
  registerIpc()
  createWindow()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
