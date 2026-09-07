import { renderMarkdownLatex } from '../lib/md'

export default function MarkdownLatex(props: { text: string }): JSX.Element {
  return <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdownLatex(props.text) }} />
}
