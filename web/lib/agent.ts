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
    ? (process.env.AGENT_VISION_TIMEOUT_MS || 60000)
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

async function requestAgentJson(messages: AgentMessage[], signal?: AbortSignal): Promise<string> {
  const baseUrl = requireEnv("AGENT_API_BASE_URL").replace(/\/$/, "");
  const token = requireEnv("AGENT_API_TOKEN");
  const model = process.env.AGENT_VISION_MODEL || "mimo-v2.5";
  const requestSignal = createRequestSignal(agentTimeoutMs(true), signal);
  try {
    const response = await fetch(baseUrl + "/chat/completions", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ model, messages, temperature: 0.15, stream: false }),
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
  const parsed = schema.parse(JSON.parse(extracted));
  if (logModule) await logAgentResponse(logModule, { parsed });
  return parsed;
}
