export function buildQuestionsQuery(q: {
  keyword?: string
  year?: number
  province?: string
  qtype?: string
  source?: 'imported' | 'generated'
  kpIds?: number[]
  page: number
  pageSize: number
}): { where: string; params: unknown[]; offset: number } {
  const parts = ['deleted = 0']
  const params: unknown[] = []
  if (q.keyword) {
    parts.push('stem LIKE ?')
    params.push(`%${q.keyword}%`)
  }
  if (q.year !== undefined) {
    parts.push('year = ?')
    params.push(q.year)
  }
  if (q.province) {
    parts.push('province = ?')
    params.push(q.province)
  }
  if (q.qtype) {
    parts.push('qtype = ?')
    params.push(q.qtype)
  }
  if (q.source) {
    parts.push('source = ?')
    params.push(q.source)
  }
  if (q.kpIds && q.kpIds.length) {
    const ph = q.kpIds.map(() => '?').join(',')
    parts.push(`id IN (SELECT question_id FROM question_kp WHERE kp_id IN (${ph}))`)
    params.push(...q.kpIds)
  }
  return {
    where: parts.join(' AND '),
    params,
    offset: (q.page - 1) * q.pageSize
  }
}
