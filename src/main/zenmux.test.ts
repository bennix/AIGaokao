import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
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
})
