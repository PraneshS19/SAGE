import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeLink } from "../lib/security";
export function Markdown({
  text,
  sourceLinks = true,
}: {
  text: string;
  sourceLinks?: boolean;
}) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          img: () => null,
          a: ({ href, children }) => {
            const safe = sourceLinks && href && safeLink(href);
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
