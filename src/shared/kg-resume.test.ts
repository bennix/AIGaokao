import { describe, expect, it } from 'vitest'
import { kgBuildButtonLabel, kgBuildHint, shouldAdvanceKgCursor } from './kg-resume'

describe('shouldAdvanceKgCursor', () => {
  it('成功才推进断点', () => {
    expect(shouldAdvanceKgCursor('ok')).toBe(true)
    expect(shouldAdvanceKgCursor('fail')).toBe(false)
    expect(shouldAdvanceKgCursor('cancel')).toBe(false)
  })
})

describe('kgBuildHint / button', () => {
  it('未开始', () => {
    expect(kgBuildHint(0, 100)).toBe('将处理 100 题')
    expect(kgBuildButtonLabel(0, 100)).toBe('构建图谱')
  })
  it('中途可续', () => {
    expect(kgBuildHint(40, 60)).toBe('已处理 40 题，剩余 60 题，将从断点继续')
    expect(kgBuildButtonLabel(40, 60)).toBe('继续构建')
  })
  it('全部完成', () => {
    expect(kgBuildHint(100, 0)).toBe('已处理全部 100 题')
    expect(kgBuildButtonLabel(100, 0)).toBe('已完成')
  })
})
