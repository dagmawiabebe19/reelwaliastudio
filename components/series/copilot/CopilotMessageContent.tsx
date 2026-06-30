"use client";

import ReactMarkdown from "react-markdown";

interface CopilotMessageContentProps {
  content: string;
}

/**
 * Renders co-pilot assistant/system markdown. react-markdown omits raw HTML by default (safe).
 */
export function CopilotMessageContent({ content }: CopilotMessageContentProps) {
  const markdown = typeof content === "string" ? content : String(content ?? "");
  if (!markdown.trim()) return null;

  return (
    <div className="prose-brief prose-copilot max-w-none break-words">
      <ReactMarkdown
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
