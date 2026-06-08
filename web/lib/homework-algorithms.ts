import type { HomeworkRequest } from "@/lib/types";
import { searchDictionary } from "@/lib/dictionary-search";

export type AlgorithmOutput = {
  kind: string;
  summary: string;
  facts: Record<string, unknown>;
};

function splitLines(text: string) {
  return text
    .split(/\r?\n|[；;]/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function safeEvalExpression(expression: string): number | null {
  const normalized = expression
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/（/g, "(")
    .replace(/）/g, ")");

  if (!/^[\d+\-*/().\s]+$/.test(normalized)) return null;

  const matchedTokens = normalized.match(/\d+(?:\.\d+)?|[+\-*/()]/g);
  if (!matchedTokens) return null;

  const tokens: string[] = matchedTokens;
  let index = 0;

  function factor(): number {
    const token = tokens[index++];
    if (token === "(") {
      const value = expr();
      if (tokens[index] === ")") index++;
      return value;
    }
    if (token === "-") return -factor();
    return Number(token);
  }

  function term(): number {
    let value = factor();
    while (tokens[index] === "*" || tokens[index] === "/") {
      const op = tokens[index++];
      const right = factor();
      value = op === "*" ? value * right : value / right;
    }
    return value;
  }

  function expr(): number {
    let value = term();
    while (tokens[index] === "+" || tokens[index] === "-") {
      const op = tokens[index++];
      const right = term();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }

  const result = expr();
  return Number.isFinite(result) ? result : null;
}

function mentalMath(content: string): AlgorithmOutput {
  const items = splitLines(content).map((line) => {
    const [left, right] = line.split("=").map((part) => part?.trim());
    const expected = left ? safeEvalExpression(left) : null;
    const given = right === undefined ? null : Number(right);
    const correct = expected !== null && given !== null ? Math.abs(expected - given) < 1e-9 : null;
    return { line, expression: left, given, expected, correct };
  });

  return {
    kind: "mental_math_check",
    summary: `共解析 ${items.length} 道口算，错误 ${items.filter((item) => item.correct === false).length} 道。`,
    facts: { items }
  };
}

function essay(content: string): AlgorithmOutput {
  const paragraphs = content.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  const punctuation = content.match(/[，。！？；：、,.!?;:]/g)?.length || 0;

  return {
    kind: "essay_correction",
    summary: `作文 ${content.length} 字，${paragraphs.length} 段，标点 ${punctuation} 个。`,
    facts: { charCount: content.length, paragraphCount: paragraphs.length, punctuationCount: punctuation, paragraphs }
  };
}

function documentScan(content: string): AlgorithmOutput {
  const lines = splitLines(content);
  const headings = lines.filter((line) => /^第.+[章节课]|^[一二三四五六七八九十]+[、.-]/.test(line) || line.length <= 16);
  const todos = lines.filter((line) => /完成|提交|订正|复习|背诵|练习|作业/.test(line));

  return {
    kind: "document_scan",
    summary: `提取 ${headings.length} 个标题候选，${todos.length} 个待办。`,
    facts: { headings, todos, lineCount: lines.length }
  };
}

function recitation(content: string): AlgorithmOutput {
  const units = splitLines(content);
  const cloze = units.map((line) => line.replace(/[\u4e00-\u9fa5]{2}/g, "____"));

  return {
    kind: "recitation",
    summary: `生成 ${cloze.length} 条遮词材料。`,
    facts: { units, cloze }
  };
}

function wordLookup(content: string): AlgorithmOutput {
  const words = content.match(/[A-Za-z]+(?:'[A-Za-z]+)?|[\u4e00-\u9fa5]+/g) || [];
  const entries = searchDictionary(content);

  return {
    kind: "word_lookup",
    summary: `识别 ${words.length} 个词项，词典命中 ${entries.length} 条。`,
    facts: {
      words: Array.from(new Set(words)).slice(0, 30),
      dictionarySource: "skywind3000/ECDICT, MIT License",
      dictionaryEntries: entries
    }
  };
}

function generic(feature: string, content: string): AlgorithmOutput {
  const lines = splitLines(content);

  return {
    kind: feature,
    summary: `输入 ${content.length} 字，${lines.length} 行。`,
    facts: { lineCount: lines.length, lines: lines.slice(0, 20) }
  };
}

export function runHomeworkAlgorithm(request: HomeworkRequest): AlgorithmOutput {
  switch (request.feature) {
    case "mental_math_check":
      return mentalMath(request.content);
    case "essay_correction":
      return essay(request.content);
    case "document_scan":
      return documentScan(request.content);
    case "recitation":
      return recitation(request.content);
    case "word_lookup":
      return wordLookup(request.content);
    default:
      return generic(request.feature, request.content);
  }
}
