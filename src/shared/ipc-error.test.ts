import { describe, expect, it } from 'vitest'
import { unwrapIpcError } from './ipc-error'

describe('unwrapIpcError', () => {
  it('去掉 Electron IPC 前缀', () => {
    expect(
      unwrapIpcError(new Error("Error invoking remote method 'modelsRemove': Error: 该模型正被角色占用,请先改指派"))
    ).toBe('该模型正被角色占用,请先改指派')
  })
  it('普通 Error 原样返回', () => {
    expect(unwrapIpcError(new Error('网络中断'))).toBe('网络中断')
  })
})
