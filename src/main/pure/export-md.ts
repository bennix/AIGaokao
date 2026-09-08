export type MdQuestion = {
  stem: string
  options: string[] | null
  answer: string | null
  analysis: string | null
  solutions: { methodA: string; methodB: string; faster: string | null; finalAnswer: string }[]
}

export function formatQuestionsMarkdown(items: MdQuestion[]): string {
  return items
    .map((q, i) => {
      const parts = [`## 题 ${i + 1}`, '', q.stem]
      if (q.options?.length) parts.push('', ...q.options.map((o) => `- ${o}`))
      if (q.answer) parts.push('', `**答案** ${q.answer}`)
      if (q.analysis) parts.push('', '**解析**', '', q.analysis)
      for (const s of q.solutions) {
        parts.push('', '### 解法 A', '', s.methodA, '', '### 解法 B', '', s.methodB)
        if (s.faster) parts.push('', '### 更快解法', '', s.faster)
        parts.push('', `**最终答案** ${s.finalAnswer}`)
      }
      return parts.join('\n')
    })
    .join('\n\n---\n\n')
}
