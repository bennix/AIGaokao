export function wrapNodeLabel(name: string, maxChars = 6): string {
  if (name.length <= maxChars) return name
  const parts: string[] = []
  for (let i = 0; i < name.length; i += maxChars) parts.push(name.slice(i, i + maxChars))
  return parts.join('\n')
}
