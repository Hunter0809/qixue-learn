"use client";

import React, { useEffect, useRef } from "react";
import { renderKatex } from "./latex-renderer";

/* ── LaTeX 内联/块级渲染组件 ── */

function normalizeMathDelimiters(text: string) {
  return text
    .replace(/\\\\\(/g, "\\(")
    .replace(/\\\\\)/g, "\\)")
    .replace(/\\\\\[/g, "\\[")
    .replace(/\\\\\]/g, "\\]");
}

const bareMathPattern = /((?:Δ|[A-Za-z])[\sA-Za-z0-9²³⁴⁵⁶⁷⁸⁹^()+\-×*/.,=<>]{0,80})/g;

function isBareMath(value: string) {
  return /[=<>²³⁴⁵⁶⁷⁸⁹^×√]/.test(value) && /(?:[A-Za-zΔ].*[=<>]|[²³⁴⁵⁶⁷⁸⁹^×√])/.test(value);
}

function renderTextFragment(text: string, keyPrefix: string) {
  const plainParts = text.split(bareMathPattern).filter(Boolean);
  return plainParts.map((plainPart, index) => (
    isBareMath(plainPart)
      ? <LatexInline key={`${keyPrefix}-math-${index}`} latex={plainPart.trim()} />
      : <React.Fragment key={`${keyPrefix}-text-${index}`}>{plainPart}</React.Fragment>
  ));
}

function LatexInline({ latex }: { latex: string }) {
  return <span className="latex-inline" dangerouslySetInnerHTML={{ __html: renderKatex(latex, false) }} />;
}

function LatexBlock({ latex }: { latex: string }) {
  return <div className="latex-block" dangerouslySetInnerHTML={{ __html: renderKatex(latex, true) }} />;
}

/* ── 行内渲染 ── */

function renderInline(text: string) {
  // 同时处理 **bold**、`code`、$inline latex$
  const normalized = normalizeMathDelimiters(text);
  const parts = normalized.split(/(\*\*[^*]+\*\*|`[^`]+`|\\\([\s\S]+?\\\)|\$[^$]+?\$)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("$") && part.endsWith("$")) {
      return <LatexInline key={index} latex={part.slice(1, -1)} />;
    }
    if (part.startsWith("\\(") && part.endsWith("\\)")) {
      return <LatexInline key={index} latex={part.slice(2, -2)} />;
    }
    return <React.Fragment key={index}>{renderTextFragment(part, String(index))}</React.Fragment>;
  });
}

/* ── 段落渲染（支持 $$ 块级公式） ── */

function renderParagraph(text: string) {
  // 按 $$...$$ 分割，块级公式独立渲染，文本段送 renderInline
  const normalized = normalizeMathDelimiters(text);
  const parts = normalized.split(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\])/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("$$") && part.endsWith("$$")) {
          return <LatexBlock key={i} latex={part.slice(2, -2).trim()} />;
        }
        if (part.startsWith("\\[") && part.endsWith("\\]")) {
          return <LatexBlock key={i} latex={part.slice(2, -2).trim()} />;
        }
        return <p key={i}>{renderInline(part)}</p>;
      })}
    </>
  );
}

/* ── 标题 ── */

function Heading({ level, children }: { level: number; children: React.ReactNode }) {
  if (level === 1) return <h3>{children}</h3>;
  if (level === 2) return <h4>{children}</h4>;
  if (level === 3) return <h5>{children}</h5>;
  return <h6>{children}</h6>;
}

/* ── 主渲染器 ── */

function normalizeBoldSubheadings(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]*(\*\*[^*\n]+\*\*)[ \t]*/g, (match, bold, offset, source) => {
      const before = offset > 0 && source[offset - 1] !== "\n" ? "\n" : "";
      const after = source[offset + match.length] !== "\n" ? "\n" : "";
      return `${before}${bold}${after}`;
    })
    .replace(/\n{3,}/g, "\n\n");
}

export function MarkdownRenderer({ text, boldAsSubheading = false }: { text: string; boldAsSubheading?: boolean }) {
  const lines = (boldAsSubheading ? normalizeBoldSubheadings(text) : text.replace(/\r\n/g, "\n")).split("\n");
  const nodes: React.ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      nodes.push(<pre className="markdown-code" key={nodes.length}><code>{code.join("\n")}</code></pre>);
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      nodes.push(<Heading level={heading[1].length} key={nodes.length}>{renderInline(heading[2])}</Heading>);
      index += 1;
      continue;
    }

    const boldSubheading = boldAsSubheading ? line.match(/^\*\*([^*]+)\*\*$/) : null;
    if (boldSubheading) {
      nodes.push(<Heading level={3} key={nodes.length}>{boldSubheading[1]}</Heading>);
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ""));
        index += 1;
      }
      nodes.push(
        <ul key={nodes.length}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderParagraph(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+[.)]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+[.)]\s+/, ""));
        index += 1;
      }
      nodes.push(
        <ol key={nodes.length}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderParagraph(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,4})\s+/.test(lines[index].trim()) &&
      !/^[-*]\s+/.test(lines[index].trim()) &&
      !/^\d+[.)]\s+/.test(lines[index].trim()) &&
      !lines[index].trim().startsWith("```")
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    nodes.push(<div key={nodes.length}>{renderParagraph(paragraph.join(" "))}</div>);
  }

  return <div className="markdown-content">{nodes}</div>;
}
