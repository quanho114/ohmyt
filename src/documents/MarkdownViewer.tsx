import Markdown from "react-markdown";
import gfm from "remark-gfm";
export default function MarkdownViewer({ text }: { text: string }) {
  return (
    <article className="document-markdown">
      <Markdown
        remarkPlugins={[gfm]}
        components={{
          img: ({ alt }) => (
            <span>[Ảnh: {alt} — tài nguyên ngoài chưa được tải]</span>
          ),
          a: ({ children }) => (
            <span className="document-link">{children}</span>
          ),
        }}
      >
        {text}
      </Markdown>
    </article>
  );
}
