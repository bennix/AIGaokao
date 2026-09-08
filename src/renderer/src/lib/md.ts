import MarkdownIt from 'markdown-it'
import katex from 'katex'

const md = new MarkdownIt({ html: false })

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** JSON `\frac` 曾被当成 \f 控制符，这里还原。 */
export function prepareTex(tex: string): string {
  return tex.replace(/\u000c/g, '\\f').replace(/\u0008/g, '\\b')
}

function renderTex(tex: string, displayMode: boolean, fallback: string): string {
  try {
    const html = katex.renderToString(prepareTex(tex), { throwOnError: false, displayMode })
    if (!html.includes('katex-error')) return html
  } catch {
    /* try raw next */
  }
  try {
    const html = katex.renderToString(tex, { throwOnError: false, displayMode })
    if (!html.includes('katex-error')) return html
  } catch {
    /* keep fallback */
  }
  return `<code>${escapeHtml(fallback)}</code>`
}

export function renderMarkdownLatex(src: string): string {
  const slots: string[] = []
  const replaced = src.replace(
    /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g,
    (all, dd: string, brack: string, paren: string, inline: string) => {
      const tex = dd ?? brack ?? paren ?? inline
      const html = renderTex(tex, Boolean(dd || brack), all)
      const i = slots.length
      slots.push(html)
      return `KATEXPH${i}X`
    }
  )
  const html = md.render(replaced)
  return html.replace(/KATEXPH(\d+)X/g, (_, n: string) => slots[Number(n)] ?? '')
}
