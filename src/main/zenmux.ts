import { createRequire } from 'module'
import type { ZodType } from 'zod'

const require = createRequire(import.meta.url)

const BASE = 'https://zenmux.ai/api/v1'

export type ChatDeps = {
  fetchFn: typeof fetch
  getApiKey: () => string
}

export function stripFence(s: string): string {
  const t = s.trim()
  const m = t.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/)
  return (m ? m[1] : t).trim()
}

async function postChat(
  deps: ChatDeps,
  model: string,
  system: string,
  user: string,
  temperature: number
): Promise<string> {
  const url = `${BASE}/chat/completions`
  const init = (): RequestInit => ({
    method: 'POST',
    headers: {
      Authorization: `Bearer ${deps.getApiKey()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature
    }),
    signal: AbortSignal.timeout(300_000)
  })

  let res = await deps.fetchFn(url, init())
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 5000))
    res = await deps.fetchFn(url, init())
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error('API-KEY 无效,请到设置页检查')
  }
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status} ${body.slice(0, 200)}`)
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content ?? ''
}

export async function chatText(
  deps: ChatDeps,
  model: string,
  user: string,
  temperature = 0.2
): Promise<string> {
  return postChat(deps, model, '', user, temperature)
}

export async function chatJSON<T>(
  deps: ChatDeps,
  model: string,
  system: string,
  user: string,
  schema: ZodType<T>,
  temperature = 0.2
): Promise<T> {
  let lastErr: Error = new Error('JSON 校验失败')
  for (let i = 0; i < 3; i++) {
    const userContent =
      i === 0 ? user : `${user}\n\n你上次的输出不是合法 JSON,请只输出 JSON`
    const text = await postChat(deps, model, system, userContent, temperature)
    try {
      const parsed: unknown = JSON.parse(stripFence(text))
      return schema.parse(parsed)
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
    }
  }
  throw lastErr
}

export function makeDeps(): ChatDeps {
  return {
    fetchFn: globalThis.fetch.bind(globalThis),
    getApiKey: (): string => {
      const { getDb } = require('./db') as typeof import('./db')
      const { decryptKey } = require('./secure') as typeof import('./secure')
      const row = getDb()
        .prepare("SELECT value FROM settings WHERE key = 'apikey_encrypted'")
        .get() as { value: string } | undefined
      if (!row) throw new Error('未设置 API-KEY,请到设置页配置')
      return decryptKey(row.value)
    }
  }
}
