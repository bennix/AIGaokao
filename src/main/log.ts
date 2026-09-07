import { app } from 'electron'
import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'

export function log(msg: string): void {
  const dir = join(app.getPath('userData'), 'logs')
  mkdirSync(dir, { recursive: true })
  appendFileSync(join(dir, 'app.log'), `[${new Date().toISOString()}] ${msg}\n`)
}
