"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";

interface CopilotMessageContentProps {
  content: string;
}

/**
 * Renders co-pilot assistant markdown. Memoized by content so parent re-renders
 * (stream ticks, tool rows) do not re-parse every historical message.
 */
export const CopilotMessageContent = memo(function CopilotMessageContent({
  content,
}: CopilotMessageContentProps) {
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
});
