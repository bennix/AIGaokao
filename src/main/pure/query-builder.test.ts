import { describe, it, expect } from 'vitest'
import { buildQuestionsQuery } from './query-builder'

describe('buildQuestionsQuery', () => {
  it('无条件:只排除已删,带分页', () => {
    const { where, params } = buildQuestionsQuery({ page: 1, pageSize: 20 })
    expect(where).toBe('deleted = 0')
    expect(params).toEqual([])
  })
  it('组合条件', () => {
    const { where, params } = buildQuestionsQuery({
      keyword: '函数', year: 2023, qtype: 'choice', source: 'imported', page: 2, pageSize: 20
    })
    expect(where).toBe("deleted = 0 AND stem LIKE ? AND year = ? AND qtype = ? AND source = ?")
    expect(params).toEqual(['%函数%', 2023, 'choice', 'imported'])
  })
  it('知识点过滤生成子查询', () => {
    const { where, params } = buildQuestionsQuery({ kpIds: [3, 5], page: 1, pageSize: 20 })
    expect(where).toContain('IN (SELECT question_id FROM question_kp WHERE kp_id IN (?,?))')
    expect(params).toEqual([3, 5])
  })
})
