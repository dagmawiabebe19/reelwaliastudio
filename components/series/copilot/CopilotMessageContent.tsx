"use client";

import ReactMarkdown from "react-markdown";

interface CopilotMessageContentProps {
  content: string;
}

/**
 * Renders co-pilot assistant/system markdown. react-markdown omits raw HTML by default (safe).
 */
export function CopilotMessageContent({ content }: CopilotMessageContentProps) {
  if (!content.trim()) return null;

  return (
    <div className="prose-brief prose-copilot max-w-none">
      <ReactMarkdown
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
