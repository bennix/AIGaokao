import { describe, expect, it } from 'vitest'
import { parseLlmJson } from './llm-json'

describe('parseLlmJson', () => {
  it('合法 JSON 原样通过', () => {
    expect(parseLlmJson('{"a":1}')).toEqual({ a: 1 })
  })
  it('围栏外有说明也能抽出', () => {
    expect(parseLlmJson('如下：\n```json\n{"a":2}\n```\n完')).toEqual({ a: 2 })
  })
  it('未转义 LaTeX 反斜杠可解析', () => {
    expect(parseLlmJson('{"s":"\\sqrt{x}"}')).toEqual({ s: '\\sqrt{x}' })
  })
  it('已转义反斜杠保持', () => {
    expect(parseLlmJson('{"s":"\\\\sqrt{x}"}')).toEqual({ s: '\\sqrt{x}' })
  })
  it('字符串内真实换行可解析', () => {
    expect(parseLlmJson('{"s":"a\nb"}')).toEqual({ s: 'a\nb' })
  })
  it('尾逗号可解析', () => {
    expect(parseLlmJson('{"a":1,}')).toEqual({ a: 1 })
  })
})
