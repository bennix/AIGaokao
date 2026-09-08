import type { ZodType } from 'zod'
import { getDb } from './db'
import { parseLlmJson } from './pure/llm-json'
import { nextDelayMs, pruneStamps } from './pure/rate-limit'
import { splitSse } from './pure/sse'
import { decryptKey } from './secure'

const BASE = 'https://zenmux.ai/api/v1'

const rpmStamps: number[] = []

export type ChatDeps = {
  fetchFn: typeof fetch
  getApiKey: () => string
  waitTurn?: () => Promise<void>
  onWait?: (ms: number) => void
  aborted?: () => boolean
  onDelta?: (full: string) => void
}

export async function waitForZenmuxSlot(opts?: {
  onWait?: (ms: number) => void
  aborted?: () => boolean
}): Promise<void> {
  for (;;) {
    if (opts?.aborted?.()) throw new Error('已取消')
    const now = Date.now()
    const delay = nextDelayMs(rpmStamps, now)
    if (delay <= 0) {
      rpmStamps.push(now)
      rpmStamps.splice(0, rpmStamps.length, ...pruneStamps(rpmStamps, now))
      return
    }
    opts?.onWait?.(delay)
    await new Promise((r) => setTimeout(r, Math.min(400, delay)))
  }
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
      temperature,
      ...(deps.onDelta ? { stream: true } : {})
    }),
    signal: AbortSignal.timeout(300_000)
  })

  if (deps.waitTurn) await deps.waitTurn()
  let res = await deps.fetchFn(url, init())
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 5000))
    if (deps.waitTurn) await deps.waitTurn()
    res = await deps.fetchFn(url, init())
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error('API-KEY 无效,请到设置页检查')
  }
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status} ${body.slice(0, 200)}`)
  }
  if (deps.onDelta && res.body) {
    const ct = res.headers.get('content-type') ?? ''
    if (ct.includes('event-stream') || ct.includes('text/plain')) {
      const text = await readSseText(res, deps.onDelta)
      if (text) return text
    }
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const text = data.choices?.[0]?.message?.content ?? ''
  deps.onDelta?.(text)
  return text
}

async function readSseText(res: Response, onDelta: (full: string) => void): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return ''
  const dec = new TextDecoder()
  let carry = ''
  let full = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    carry += dec.decode(value, { stream: true })
    const { rest, deltas } = splitSse(carry)
    carry = rest
    for (const d of deltas) {
      full += d
      onDelta(full)
    }
  }
  return full
}

export async function chatText(
  deps: ChatDeps,
  model: string,
  user: string,
  temperature = 0.2
): Promise<string> {
  return postChat(deps, model, '你是助手。', user, temperature)
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
      const parsed: unknown = parseLlmJson(text)
      return schema.parse(parsed)
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
    }
  }
  throw new Error(`模型输出不是合法 JSON，已重试 3 次：${lastErr.message}`)
}

export function makeDeps(hooks?: { onWait?: (ms: number) => void; aborted?: () => boolean }): ChatDeps {
  return {
    fetchFn: globalThis.fetch.bind(globalThis),
    getApiKey: (): string => {
      const row = getDb()
        .prepare("SELECT value FROM settings WHERE key = 'apikey_encrypted'")
        .get() as { value: string } | undefined
      if (!row) throw new Error('未设置 API-KEY,请到设置页配置')
      return decryptKey(row.value)
    },
    onWait: hooks?.onWait,
    aborted: hooks?.aborted,
    waitTurn: () => waitForZenmuxSlot(hooks)
  }
}
