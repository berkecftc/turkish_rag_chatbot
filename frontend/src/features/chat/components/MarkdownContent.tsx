import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";
import "highlight.js/styles/github-dark.css";
import "./markdown.css";
import type { CitationOut } from "@/shared/types/api";
import { injectCitationsIntoChildren } from "./citationText";

interface MarkdownContentProps {
  content: string;
  citations: Record<number, CitationOut>;
  onCitationActivate?: (n: number) => void;
}

/** Extract a plain-text string from arbitrary react children (for copy). */
function childrenToText(node: React.ReactNode): string {
  if (node == null || node === false) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(childrenToText).join("");
  if (React.isValidElement(node)) {
    return childrenToText((node.props as { children?: React.ReactNode }).children);
  }
  return "";
}

function CopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      aria-label="Kodu kopyala"
      className="copy-btn inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background/80 px-2 text-xs text-muted-foreground backdrop-blur transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:opacity-100"
      onClick={() => {
        navigator.clipboard?.writeText(getText()).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Kopyalandı" : "Kopyala"}
    </button>
  );
}

/**
 * Renders assistant markdown with GFM + syntax highlighting, a copy button on
 * code blocks, and Perplexity-style inline `[n]` citation chips.
 *
 * Citation injection happens via per-element child transforms on text-bearing
 * block elements; `code`/`pre` are excluded so code is never rewritten.
 */
export function MarkdownContent({ content, citations, onCitationActivate }: MarkdownContentProps) {
  const components = React.useMemo<Components>(() => {
    const withCitations =
      (Tag: keyof React.JSX.IntrinsicElements) =>
      ({ node: _node, children, ...props }: { node?: unknown; children?: React.ReactNode }) => {
        void _node;
        return React.createElement(
          Tag,
          props,
          injectCitationsIntoChildren(children, citations, onCitationActivate),
        );
      };

    return {
      p: withCitations("p"),
      li: withCitations("li"),
      td: withCitations("td"),
      th: withCitations("th"),
      h1: withCitations("h1"),
      h2: withCitations("h2"),
      h3: withCitations("h3"),
      h4: withCitations("h4"),
      // Block code: wrap in a positioned container with a copy button.
      pre: ({ node: _node, children, ...props }) => {
        void _node;
        return (
          <div className="markdown-codeblock">
            <CopyButton getText={() => childrenToText(children)} />
            <pre {...props}>{children}</pre>
          </div>
        );
      },
    };
  }, [citations, onCitationActivate]);

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
