import { type ZodSchema } from "zod";
import { logAgentResponse } from "@/lib/server-logger";

export type AgentContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type AgentMessage = {
  role: "system" | "user";
  content: string | AgentContentPart[];
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.startsWith("replace-with-")) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function agentTimeoutMs(isVision: boolean) {
  const raw = isVision
    ? (process.env.AGENT_VISION_TIMEOUT_MS || 90000)
    : (process.env.AGENT_API_TIMEOUT_MS || 60000);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60000;
}

function createRequestSignal(timeoutMs: number, signal?: AbortSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Agent API request timed out")), timeoutMs);
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  };
}

export function extractJsonFromText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match) return match[0];
  return trimmed;
}

const latexCommands = new Set([
  "frac", "dfrac", "tfrac", "sqrt", "sin", "cos", "tan", "cot", "sec", "csc",
  "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "ln", "log", "exp", "lim",
  "sum", "prod", "int", "iint", "iiint", "oint", "partial", "nabla", "infty",
  "alpha", "beta", "gamma", "delta", "epsilon", "theta", "lambda", "mu", "nu", "pi",
  "rho", "sigma", "tau", "phi", "chi", "psi", "omega", "Delta", "Gamma", "Theta",
  "Lambda", "Pi", "Sigma", "Phi", "Psi", "Omega", "cdot", "times", "div", "pm", "mp",
  "le", "leq", "ge", "geq", "ne", "neq", "approx", "equiv", "propto", "in", "notin",
  "subset", "supset", "subseteq", "supseteq", "cup", "cap", "to", "rightarrow",
  "leftarrow", "leftrightarrow", "Rightarrow", "Leftarrow", "Leftrightarrow", "implies",
  "iff", "forall", "exists", "neg", "land", "lor", "text", "mathrm", "mathbf", "mathit",
  "mathbb", "mathcal", "operatorname", "left", "right", "begin", "end", "overline",
  "underline", "hat", "bar", "vec", "dot", "ddot"
]);

function isAsciiLetter(value: string) {
  const code = value.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function normalizeLatexJsonEscapes(value: string) {
  const slash = String.fromCharCode(92);
  let normalized = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== slash) {
      normalized += char;
      continue;
    }
    if (value[index + 1] === slash) {
      normalized += slash + slash;
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < value.length && isAsciiLetter(value[end])) end += 1;
    const command = value.slice(index + 1, end);
    normalized += latexCommands.has(command) ? slash + slash : slash;
  }
  return normalized;
}

export function parseAgentJson(text: string): unknown {
  const extracted = normalizeLatexJsonEscapes(extractJsonFromText(text));
  try {
    return JSON.parse(extracted);
  } catch (firstError) {
    let repaired = "";
    for (let index = 0; index < extracted.length; index += 1) {
      const char = extracted[index];
      if (char !== "\\") {
        repaired += char;
        continue;
      }
      const next = extracted[index + 1] || "";
      if (next === "\\") {
        repaired += "\\\\";
        index += 1;
        continue;
      }
      const validSimpleEscape = ["\\", "\"", "/", "b", "f", "n", "r", "t"].includes(next);
      const validUnicodeEscape = next === "u" && /^[0-9a-fA-F]{4}$/.test(extracted.slice(index + 2, index + 6));
      if (validSimpleEscape || validUnicodeEscape) {
        repaired += char;
      } else {
        repaired += "\\\\";
      }
    }
    try {
      return JSON.parse(repaired);
    } catch {
      throw firstError;
    }
  }
}
async function requestAgentJson(messages: AgentMessage[], signal?: AbortSignal): Promise<string> {
  const baseUrl = requireEnv("AGENT_API_BASE_URL").replace(/\/$/, "");
  const token = requireEnv("AGENT_API_TOKEN");
  const model = process.env.AGENT_VISION_MODEL || "mimo-v2.5";
  const maxTokens = Number(process.env.AGENT_VISION_MAX_TOKENS || 6144);
  const requestSignal = createRequestSignal(agentTimeoutMs(true), signal);
  try {
    const response = await fetch(baseUrl + "/chat/completions", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.15,
        top_p: 0.95,
        max_tokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 6144,
        chat_template_kwargs: { enable_thinking: process.env.AGENT_VISION_ENABLE_THINKING === "1" },
        stream: false
      }),
      signal: requestSignal.signal
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error("Agent API error " + response.status + ": " + detail);
    }
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content || "";
    if (!content.trim()) throw new Error("Agent API returned empty content");
    return content;
  } finally {
    requestSignal.cleanup();
  }
}
/**
 * MIMO 多模态 -> 流式收集 -> 提取 JSON
 * 仅用于有图片的视觉推理
 */
export async function askAgentStreamCollect<T>(
  task: string,
  schema: ZodSchema<T>,
  context: unknown,
  imageUrl: string,
  logModule?: string,
  signal?: AbortSignal
): Promise<T> {
  const messages: AgentMessage[] = [
    {
      role: "system",
      content: [
        "你是个性化学习系统的多智能体编排层。",
        "你收到了一张图片和用户的文字描述，请仔细分析图片内容并解答问题。",
        "除语言学习、词典查询、翻译等明确需要目标语言的内容外，所有自然语言内容必须使用中文。固定 JSON 字段名、枚举值、代码符号保持原样。",
        "只输出一个合法 JSON 对象，不输出 Markdown、解释、代码围栏或额外文本。",
        "严格匹配字段和类型。百分比必须在 0 到 100 之间。"
      ].join("\n")
    }, {
      role: "user",
      content: [
        { type: "text", text: JSON.stringify({ task, context }) } as AgentContentPart,
        { type: "image_url", image_url: { url: imageUrl } } as AgentContentPart
      ]
    }
  ];

  const fullText = await requestAgentJson(messages, signal);
  if (logModule) await logAgentResponse(logModule, { raw: fullText });
  const extracted = extractJsonFromText(fullText);
  const parsed = schema.parse(parseAgentJson(fullText));
  if (logModule) await logAgentResponse(logModule, { parsed });
  return parsed;
}



