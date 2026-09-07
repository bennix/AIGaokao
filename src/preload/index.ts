import { contextBridge, ipcRenderer } from 'electron'
import type { Api, ProgressPayload } from '../shared/types'

const api: Api = {
  settingsGetMasked: () => ipcRenderer.invoke('settingsGetMasked'),
  settingsSetApiKey: (plainKey) => ipcRenderer.invoke('settingsSetApiKey', plainKey),
  settingsClearApiKey: () => ipcRenderer.invoke('settingsClearApiKey'),
  settingsSetRole: (role, model) => ipcRenderer.invoke('settingsSetRole', role, model),
  modelsAdd: (name) => ipcRenderer.invoke('modelsAdd', name),
  modelsRemove: (name) => ipcRenderer.invoke('modelsRemove', name),
  zenmuxTest: () => ipcRenderer.invoke('zenmuxTest'),

  dataStatus: () => ipcRenderer.invoke('dataStatus'),
  dataDownloadStructured: () => ipcRenderer.invoke('dataDownloadStructured'),
  dataListPdfDirs: () => ipcRenderer.invoke('dataListPdfDirs'),
  dataDownloadPdfDir: (dirPath) => ipcRenderer.invoke('dataDownloadPdfDir', dirPath),
  dataCancel: () => ipcRenderer.invoke('dataCancel'),

  questionsQuery: (q) => ipcRenderer.invoke('questionsQuery', q),
  questionsGet: (id) => ipcRenderer.invoke('questionsGet', id),
  questionsDelete: (ids) => ipcRenderer.invoke('questionsDelete', ids),
  questionsExport: (ids, format) => ipcRenderer.invoke('questionsExport', ids, format),

  kgBuild: () => ipcRenderer.invoke('kgBuild'),
  kgCancel: () => ipcRenderer.invoke('kgCancel'),
  kgGet: () => ipcRenderer.invoke('kgGet'),

  genCreate: (p) => ipcRenderer.invoke('genCreate', p),
  genPending: () => ipcRenderer.invoke('genPending'),
  genResolve: (id, action) => ipcRenderer.invoke('genResolve', id, action),
  solveRun: (questionId) => ipcRenderer.invoke('solveRun', questionId),

  pdfList: () => ipcRenderer.invoke('pdfList'),

  on(channel, cb) {
    const listener = (_event: unknown, payload: ProgressPayload | { questionId: number }): void => {
      cb(payload)
    }
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

declare global {
  interface Window {
    api: import('../shared/types').Api
  }
}
