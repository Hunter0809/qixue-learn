import { type ZodSchema } from "zod";
import { extractJsonFromText } from "@/lib/agent";
import { logAgentResponse } from "@/lib/server-logger";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";
const DEEPSEEK_MODEL = "deepseek-chat";
const DEEPSEEK_STREAM_TIMEOUT_MS = Number(process.env.DEEPSEEK_STREAM_TIMEOUT_MS || 60000);
const DEEPSEEK_MAX_TOKENS = Number(process.env.DEEPSEEK_MAX_TOKENS || 8192);
const DEEPSEEK_JSON_MODE = process.env.DEEPSEEK_JSON_MODE === "1";
function requireDeepSeekKey(): string {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("Missing DEEPSEEK_API_KEY environment variable");
  return key;
}

function createDeepSeekRequestSignal(signal?: AbortSignal) {
  const controller = new AbortController();
  const timeoutMs = Number.isFinite(DEEPSEEK_STREAM_TIMEOUT_MS) && DEEPSEEK_STREAM_TIMEOUT_MS > 0 ? DEEPSEEK_STREAM_TIMEOUT_MS : 60000;
  const timeout = setTimeout(() => controller.abort(new Error("DeepSeek request timed out")), timeoutMs);
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

export async function streamDeepSeek(
  messages: { role: "system" | "user"; content: string }[],
  signal?: AbortSignal,
  options: { jsonObject?: boolean } = {}
): Promise<ReadableStream<string>> {
  const apiKey = requireDeepSeekKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(DEEPSEEK_STREAM_TIMEOUT_MS) && DEEPSEEK_STREAM_TIMEOUT_MS > 0 ? DEEPSEEK_STREAM_TIMEOUT_MS : 60000);
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  const cleanup = () => {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  };
  let response: Response;
  try {
    response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages,
        temperature: 0.15,
        max_tokens: Number.isFinite(DEEPSEEK_MAX_TOKENS) && DEEPSEEK_MAX_TOKENS > 0 ? DEEPSEEK_MAX_TOKENS : 8192,
        ...(options.jsonObject ? { response_format: { type: "json_object" } } : {}),
        stream: true
      }),
      signal: controller.signal
    });
  } catch (error) {
    cleanup();
    throw error;
  }

  if (!response.ok) {
    const text = await response.text();
    cleanup();
    throw new Error(`DeepSeek API error ${response.status}: ${text}`);
  }

  if (!response.body) {
    cleanup();
    throw new Error("DeepSeek API returned empty response body");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let closed = false;
  const pending: string[] = [];
  return new ReadableStream({
    async pull(controller) {
      try {
        const queued = pending.shift();
        if (queued) {
          controller.enqueue(queued);
          return;
        }
        while (!closed) {
          const { done, value } = await reader.read();
          if (done) {
            closed = true;
            cleanup();
            controller.close();
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || "";
          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data) continue;
            if (data === "[DONE]") {
              closed = true;
              cleanup();
              break;
            }
            try {
              const p = JSON.parse(data);
              const d = p.choices?.[0]?.delta?.content;
              if (d) pending.push(d);
            } catch {
              // Ignore malformed stream lines.
            }
          }
          const next = pending.shift();
          if (next) {
            controller.enqueue(next);
            return;
          }
          if (closed) {
            controller.close();
            return;
          }
        }
      } catch (error) {
        closed = true;
        cleanup();
        controller.error(error);
      }
    },
    async cancel() {
      closed = true;
      cleanup();
      await reader.cancel();
    }
  });
}

export async function askDeepSeekStreamCollect<T>(
  task: string,
  schema: ZodSchema<T>,
  context: unknown,
  logModule?: string,
  signal?: AbortSignal
): Promise<T> {
  const messages = [
    {
      role: "system" as const,
      content: [
        "你是个性化学习系统的多智能体编排层。",
        "除语言学习、词典查询、翻译等明确需要目标语言的内容外，所有自然语言内容必须使用中文。固定 JSON 字段名、枚举值、代码符号保持原样。",
        "只输出一个合法 JSON 对象，不输出 Markdown、解释、代码围栏或额外文本。",
        "严格匹配字段和类型。百分比必须在 0 到 100 之间。"
      ].join("\n")
    },
    {
      role: "user" as const,
      content: JSON.stringify({ task, context })
    }
  ];

  const apiKey = requireDeepSeekKey();
  const requestSignal = createDeepSeekRequestSignal(signal);
  let fullText = "";
  try {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages,
        temperature: 0.15,
        max_tokens: Number.isFinite(DEEPSEEK_MAX_TOKENS) && DEEPSEEK_MAX_TOKENS > 0 ? DEEPSEEK_MAX_TOKENS : 8192,
        ...(DEEPSEEK_JSON_MODE ? { response_format: { type: "json_object" } } : {}),
        stream: false
      }),
      signal: requestSignal.signal
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`DeepSeek API error ${response.status}: ${text}`);
    }
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    fullText = payload.choices?.[0]?.message?.content || "";
  } finally {
    requestSignal.cleanup();
  }
  if (logModule) await logAgentResponse(logModule, { raw: fullText });
  const extracted = extractJsonFromText(fullText);
  const parsed = schema.parse(JSON.parse(extracted));
  if (logModule) await logAgentResponse(logModule, { parsed });
  return parsed;
}
