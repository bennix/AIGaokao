import MarkdownIt from 'markdown-it'
import katex from 'katex'

const md = new MarkdownIt({ html: false })

export function renderMarkdownLatex(src: string): string {
  const slots: string[] = []
  const replaced = src.replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, (all, block: string, inline: string) => {
    const tex = block ?? inline
    const displayMode = Boolean(block)
    let html: string
    try {
      html = katex.renderToString(tex, { throwOnError: false, displayMode })
      if (html.includes('katex-error')) html = `<code>${all}</code>`
    } catch {
      html = `<code>${all}</code>`
    }
    const i = slots.length
    slots.push(html)
    return `KATEXPH${i}X`
  })
  const html = md.render(replaced)
  return html.replace(/KATEXPH(\d+)X/g, (_, n: string) => slots[Number(n)] ?? '')
}
