export function shouldAdvanceKgCursor(outcome: 'ok' | 'fail' | 'cancel'): boolean {
  return outcome === 'ok'
}

export function kgBuildHint(processed: number, remaining: number): string {
  if (remaining === 0 && processed === 0) return '导入题库后即可构建'
  if (remaining === 0) return `已处理全部 ${processed} 题`
  if (processed === 0) return `将处理 ${remaining} 题`
  return `已处理 ${processed} 题，剩余 ${remaining} 题，将从断点继续`
}

export function kgBuildButtonLabel(processed: number, remaining: number): string {
  if (remaining === 0 && processed > 0) return '已完成'
  if (processed > 0 && remaining > 0) return '继续构建'
  return '构建图谱'
}
