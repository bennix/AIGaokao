export type QuestionInsert = {
  stem: string
  answer: string | null
  analysis: string | null
  options: string[] | null
  year: number | null
  province: string | null
  qtype: 'choice' | 'answer'
  raw: string
}

function pick(rec: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (rec[k] !== undefined && rec[k] !== null && rec[k] !== '') return rec[k]
  }
  return undefined
}

export function mapRecord(rec: unknown): QuestionInsert | null {
  if (!rec || typeof rec !== 'object') return null
  const r = rec as Record<string, unknown>
  const stemRaw = pick(r, ['question', 'stem', '题目', 'content', 'text'])
  if (typeof stemRaw !== 'string' || !stemRaw.trim()) return null
  const answerRaw = pick(r, ['answer', '答案', 'ans'])
  const analysisRaw = pick(r, ['analysis', '解析', 'explanation'])
  const optionsRaw = pick(r, ['options', 'choices', '选项'])
  const options = Array.isArray(optionsRaw) ? optionsRaw.map(String) : null
  const yearRaw = pick(r, ['year', '年份'])
  const yearNum = yearRaw === undefined ? NaN : Number(yearRaw)
  const provinceRaw = pick(r, ['province', '地区', '省份', '卷种', 'category'])
  return {
    stem: stemRaw,
    answer: typeof answerRaw === 'string' ? answerRaw : answerRaw != null ? String(answerRaw) : null,
    analysis: typeof analysisRaw === 'string' ? analysisRaw : null,
    options,
    year: Number.isFinite(yearNum) ? yearNum : null,
    province: typeof provinceRaw === 'string' ? provinceRaw : null,
    qtype: options && options.length >= 2 ? 'choice' : 'answer',
    raw: JSON.stringify(rec)
  }
}

export function dedupKey(stem: string): string {
  return stem.replace(/\s+/g, '').slice(0, 80)
}
