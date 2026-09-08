import { describe, expect, it } from 'vitest'
import { pdfAppUrl, relFromAppPdfUrl } from './pdf-url'

describe('pdfAppUrl / relFromAppPdfUrl', () => {
  it('中文路径往返', () => {
    const rel = '春季高考/2000/2000春季上海.pdf'
    expect(relFromAppPdfUrl(pdfAppUrl(rel))).toBe(rel)
  })
  it('兼容旧 pathname 形式', () => {
    const u = 'app-pdf:///%E6%98%A5%E5%AD%A3%E9%AB%98%E8%80%83/2000/a.pdf'
    expect(relFromAppPdfUrl(u)).toBe('春季高考/2000/a.pdf')
  })
})
