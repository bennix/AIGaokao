import { describe, expect, it } from 'vitest'
import { formatQuestionsMarkdown } from './export-md'

describe('formatQuestionsMarkdown', () => {
  it('多题导出为分节 Markdown，保留 LaTeX', () => {
    const md = formatQuestionsMarkdown([
      {
        stem: '已知 $a>0$',
        options: ['A. 1', 'B. 2'],
        answer: '$1$',
        analysis: '略',
        solutions: []
      },
      {
        stem: '第二题',
        options: null,
        answer: '2',
        analysis: null,
        solutions: [{ methodA: '法A', methodB: '法B', faster: null, finalAnswer: '2' }]
      }
    ])
    expect(md).toContain('## 题 1')
    expect(md).toContain('已知 $a>0$')
    expect(md).toContain('- A. 1')
    expect(md).toContain('## 题 2')
    expect(md).toContain('### 解法 A')
    expect(md).toContain('---')
  })
})
