import { describe, expect, it } from 'vitest'
import {
  FALLBACK_PDF_DIRS,
  isPdfUnderDir,
  parseGitTree,
  pdfsUnder,
  rawPdfUrl,
  topDirs,
  zipEntryRel
} from './github-tree'

describe('parseGitTree', () => {
  it('抽出 path/type/size', () => {
    expect(
      parseGitTree({
        tree: [
          { path: '普通高考', type: 'tree' },
          { path: '普通高考/2024/a.pdf', type: 'blob', size: 12 }
        ]
      })
    ).toEqual([
      { path: '普通高考', type: 'tree' },
      { path: '普通高考/2024/a.pdf', type: 'blob', size: 12 }
    ])
  })
  it('非数组 → 空', () => {
    expect(parseGitTree({ message: 'Not Found' })).toEqual([])
  })
})

describe('topDirs / pdfsUnder', () => {
  const nodes = parseGitTree({
    tree: [
      { path: 'LICENSE', type: 'blob', size: 1 },
      { path: '春季高考', type: 'tree' },
      { path: '普通高考', type: 'tree' },
      { path: '春季高考/2000/上海.pdf', type: 'blob', size: 9 },
      { path: '普通高考/2024/全国.pdf', type: 'blob', size: 8 },
      { path: '普通高考/2024/说明.txt', type: 'blob', size: 2 }
    ]
  })
  it('只要顶层目录', () => {
    expect(topDirs(nodes)).toEqual([
      { path: '春季高考', name: '春季高考' },
      { path: '普通高考', name: '普通高考' }
    ])
  })
  it('只收目录下的 PDF，不串目录', () => {
    expect(pdfsUnder(nodes, '普通高考')).toEqual([{ path: '普通高考/2024/全国.pdf', size: 8 }])
  })
})

describe('rawPdfUrl / zip 路径', () => {
  it('分段编码中文路径', () => {
    expect(rawPdfUrl('春季高考/2000/上海.pdf')).toBe(
      'https://raw.githubusercontent.com/deekur/gaokaomath/main/%E6%98%A5%E5%AD%A3%E9%AB%98%E8%80%83/2000/%E4%B8%8A%E6%B5%B7.pdf'
    )
  })
  it('去掉 zip 根目录', () => {
    expect(zipEntryRel('gaokaomath-main/春季高考/2000/a.pdf')).toBe('春季高考/2000/a.pdf')
  })
  it('isPdfUnderDir 按路径边界匹配', () => {
    expect(isPdfUnderDir('春季高考/2000/a.pdf', '春季高考')).toBe(true)
    expect(isPdfUnderDir('普通高考/2024/a.pdf', '春季高考')).toBe(false)
    expect(isPdfUnderDir('春季高考/2000/a.txt', '春季高考')).toBe(false)
  })
  it('兜底目录已知', () => {
    expect(FALLBACK_PDF_DIRS.map((d) => d.path)).toEqual(['春季高考', '普通高考'])
  })
})
