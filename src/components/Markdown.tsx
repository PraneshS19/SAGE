import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeLink } from "../lib/security";
export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          img: () => null,
          a: ({ href, children }) => {
            const safe = href && safeLink(href);
            return safe ? (
              <a href={safe} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
