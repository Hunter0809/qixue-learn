"use client";
import katex from "katex";
import { useEffect, useRef, useState } from "react";

type Segment = { type: "text" | "latex-display" | "latex-inline"; content: string };

function normalizeMathDelimiters(text: string) {
  return text
    .replace(/\\\\\(/g, "\\(")
    .replace(/\\\\\)/g, "\\)")
    .replace(/\\\\\[/g, "\\[")
    .replace(/\\\\\]/g, "\\]");
}

export function parseLatex(text: string): Segment[] {
  const normalized = normalizeMathDelimiters(text);
  const segments: Segment[] = [];
  const regex = /\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$([^\$]+?)\$/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: normalized.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined || match[2] !== undefined) {
      segments.push({ type: "latex-display", content: (match[1] ?? match[2] ?? "").trim() });
    } else if (match[3] !== undefined) {
      segments.push({ type: "latex-inline", content: match[3].trim() });
    } else {
      segments.push({ type: "latex-inline", content: (match[4] ?? "").trim() });
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < normalized.length) {
    segments.push({ type: "text", content: normalized.slice(lastIndex) });
  }
  return segments;
}

export function renderKatex(latex: string, displayMode: boolean): string {
  try {
    const normalizedLatex = latex
      .replace(/Δ/g, "\\Delta")
      .replace(/×/g, "\\times ")
      .replace(/²/g, "^2")
      .replace(/³/g, "^3")
      .replace(/⁴/g, "^4")
      .replace(/⁵/g, "^5")
      .replace(/⁶/g, "^6")
      .replace(/⁷/g, "^7")
      .replace(/⁸/g, "^8")
      .replace(/⁹/g, "^9")
      .replace(/[\u4e00-\u9fff]+/g, (text) => `\\text{${text}}`);
    return katex.renderToString(normalizedLatex, { displayMode, throwOnError: false, trust: true });
  } catch {
    return latex;
  }
}

const funcPattern = /(?:y\s*=\s*|f\s*\(\s*x\s*\)\s*=\s*)(.+)/i;

function isFunctionExpr(text: string): boolean {
  return funcPattern.test(text.trim());
}

function compileExpr(raw: string): ((x: number) => number) | null {
  try {
    const cleaned = raw
      .replace(/\^/g, "**")
      .replace(/\bsin\b/g, "Math.sin")
      .replace(/\bcos\b/g, "Math.cos")
      .replace(/\btan\b/g, "Math.tan")
      .replace(/\bsqrt\b/g, "Math.sqrt")
      .replace(/\babs\b/g, "Math.abs")
      .replace(/\blog\b/g, "Math.log10")
      .replace(/\bln\b/g, "Math.log")
      .replace(/\bpi\b/gi, "Math.PI")
      .replace(/\be\b(?![a-zA-Z])/g, "Math.E");
    const fn = new Function("x", "return " + cleaned + ";") as (x: number) => number;
    fn(0);
    return fn;
  } catch {
    return null;
  }
}

function FunctionGraph({ expr }: { expr: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const m = funcPattern.exec(expr.trim());
    if (!m) { setErr(true); return; }
    const fn = compileExpr(m[1]);
    if (!fn) { setErr(true); return; }

    const W = 400, H = 300;
    canvas.width = W;
    canvas.height = H;
    const xMin = -6, xMax = 6;
    const yMin = -4, yMax = 4;
    const toCanvasX = (x: number) => ((x - xMin) / (xMax - xMin)) * W;
    const toCanvasY = (y: number) => H - ((y - yMin) / (yMax - yMin)) * H;

    ctx.fillStyle = "#f7f2e9";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "#d5c6b7";
    ctx.lineWidth = 0.5;
    for (let gx = Math.ceil(xMin); gx <= Math.floor(xMax); gx++) {
      ctx.beginPath();
      ctx.moveTo(toCanvasX(gx), 0);
      ctx.lineTo(toCanvasX(gx), H);
      ctx.stroke();
    }
    for (let gy = Math.ceil(yMin); gy <= Math.floor(yMax); gy++) {
      ctx.beginPath();
      ctx.moveTo(0, toCanvasY(gy));
      ctx.lineTo(W, toCanvasY(gy));
      ctx.stroke();
    }

    ctx.strokeStyle = "#1f4b6e";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(toCanvasX(xMin), toCanvasY(0));
    ctx.lineTo(toCanvasX(xMax), toCanvasY(0));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(toCanvasX(0), toCanvasY(yMin));
    ctx.lineTo(toCanvasX(0), toCanvasY(yMax));
    ctx.stroke();

    ctx.strokeStyle = "#c0392b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    const steps = W * 2;
    for (let i = 0; i <= steps; i++) {
      const x = xMin + (i / steps) * (xMax - xMin);
      const y = fn(x);
      if (!isFinite(y) || Math.abs(y) > 100) { started = false; continue; }
      const cx = toCanvasX(x);
      const cy = toCanvasY(y);
      if (!started) { ctx.moveTo(cx, cy); started = true; }
      else ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }, [expr]);

  if (err) return null;
  return (
    <canvas
      ref={canvasRef}
      className="function-graph"
      width={400}
      height={300}
      style={{ width: 400, height: 300 }}
    />
  );
}

function LatexSegment({ seg }: { seg: Segment }) {
  if (seg.type === "latex-display") {
    return <span className="latex-block" dangerouslySetInnerHTML={{ __html: renderKatex(seg.content, true) }} />;
  }
  if (seg.type === "latex-inline") {
    return <span className="latex-inline" dangerouslySetInnerHTML={{ __html: renderKatex(seg.content, false) }} />;
  }
  return <>{seg.content}</>;
}

export function LatexRenderer({ text }: { text: string }) {
  const segments = parseLatex(text);
  const fnExpr = text.match(funcPattern);

  return (
    <div className="latex-content">
      {segments.map((seg, i) => (
        <LatexSegment key={i} seg={seg} />
      ))}
      {fnExpr && <FunctionGraph expr={fnExpr[0]} />}
    </div>
  );
}
