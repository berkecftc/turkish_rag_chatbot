import * as React from "react";
import type { CitationOut } from "@/shared/types/api";
import { CitationChip } from "./CitationChip";

const CITATION_RE = /\[(\d+)\]/g;

/**
 * Replace `[n]` tokens inside a plain string with <CitationChip> elements.
 * Operates ONLY on raw strings — callers must never pass code/pre content here,
 * so markdown code blocks stay untouched.
 */
export function injectCitationsIntoString(
  text: string,
  citations: Record<number, CitationOut>,
  onActivate?: (n: number) => void,
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  CITATION_RE.lastIndex = 0;

  while ((match = CITATION_RE.exec(text)) !== null) {
    const [token, numStr] = match;
    const start = match.index;
    if (start > lastIndex) out.push(text.slice(lastIndex, start));
    const n = Number(numStr);
    out.push(
      <CitationChip
        key={`cite-${start}-${n}`}
        number={n}
        citation={citations[n]}
        onActivate={onActivate}
      />,
    );
    lastIndex = start + token.length;
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return out;
}

/**
 * Recursively walk react-markdown children and inject citation chips into any
 * string leaves. Non-string nodes (already-rendered elements, including code)
 * are passed through unchanged. We deliberately do NOT recurse into <code>
 * elements so `[n]`-looking tokens inside inline code are preserved verbatim.
 */
export function injectCitationsIntoChildren(
  children: React.ReactNode,
  citations: Record<number, CitationOut>,
  onActivate?: (n: number) => void,
): React.ReactNode {
  return React.Children.map(children, (child, i) => {
    if (typeof child === "string") {
      return <React.Fragment key={i}>{injectCitationsIntoString(child, citations, onActivate)}</React.Fragment>;
    }
    if (React.isValidElement(child)) {
      const type = child.type;
      // Skip code/pre so inline-code and code-block content is never transformed.
      if (type === "code" || type === "pre") return child;
      const props = child.props as { children?: React.ReactNode };
      if (props?.children != null) {
        return React.cloneElement(
          child,
          undefined,
          injectCitationsIntoChildren(props.children, citations, onActivate),
        );
      }
    }
    return child;
  });
}
