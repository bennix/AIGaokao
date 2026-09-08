import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'

vi.mock('./db', () => ({ getDb: vi.fn() }))
vi.mock('./secure', () => ({ decryptKey: vi.fn() }))

import { stripFence, chatJSON, type ChatDeps } from './zenmux'

const okResponse = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })

const deps = (fetchFn: typeof fetch): ChatDeps => ({ fetchFn, getApiKey: () => 'k' })

describe('stripFence', () => {
  it('剥离 ```json 围栏', () => {
    expect(stripFence('```json\n{"a":1}\n```')).toBe('{"a":1}')
  })
  it('无围栏原样返回', () => {
    expect(stripFence(' {"a":1} ')).toBe('{"a":1}')
  })
})

describe('chatJSON', () => {
  const schema = z.object({ a: z.number() })

  it('合法 JSON 一次通过', async () => {
    const f = vi.fn(async () => okResponse('{"a":1}'))
    const r = await chatJSON(deps(f as never), 'm', 'sys', 'usr', schema)
    expect(r).toEqual({ a: 1 })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('非法 JSON 重试 2 次,重试时追加提醒', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(okResponse('oops'))
      .mockResolvedValueOnce(okResponse('still bad'))
      .mockResolvedValueOnce(okResponse('{"a":2}'))
    const r = await chatJSON(deps(f as never), 'm', 'sys', 'usr', schema)
    expect(r).toEqual({ a: 2 })
    expect(f).toHaveBeenCalledTimes(3)
    const lastBody = JSON.parse((f.mock.calls[2] as never[])[1]!['body'])
    expect(lastBody.messages[1].content).toContain('不是合法 JSON')
  })

  it('3 次全失败抛错', async () => {
    const f = vi.fn(async () => okResponse('bad'))
    await expect(chatJSON(deps(f as never), 'm', 's', 'u', schema)).rejects.toThrow()
    expect(f).toHaveBeenCalledTimes(3)
  })

  it('401 抛出 KEY 无效提示', async () => {
    const f = vi.fn(async () => new Response('x', { status: 401 }))
    await expect(chatJSON(deps(f as never), 'm', 's', 'u', schema)).rejects.toThrow('API-KEY 无效')
  })

  it('围栏外说明 + 未转义 LaTeX 仍能通过', async () => {
    const f = vi.fn(async () => okResponse('如下\n```json\n{"a":1}\n```'))
    await expect(chatJSON(deps(f as never), 'm', 'sys', 'usr', schema)).resolves.toEqual({ a: 1 })
  })

  it('onDelta 时按 SSE 拼接', async () => {
    const sse =
      'data: {"choices":[{"delta":{"content":"{\\"a\\":"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"1}"}}]}\n\n' +
      'data: [DONE]\n\n'
    const f = vi.fn(
      async () => new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    )
    const chunks: string[] = []
    const r = await chatJSON(
      { ...deps(f as never), onDelta: (t) => chunks.push(t) },
      'm',
      's',
      'u',
      schema
    )
    expect(r).toEqual({ a: 1 })
    expect(chunks.at(-1)).toBe('{"a":1}')
  })
})
