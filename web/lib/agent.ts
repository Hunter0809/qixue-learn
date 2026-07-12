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

/**
 * 流式收集辅助函数：将 ReadableStream<string> 的所有 chunk 收集为一个完整字符串
 */
export async function collectStreamToString(
  stream: ReadableStream<string>,
  options: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<string> {
  const reader = stream.getReader();
  let result = "";
  const timeoutMs = options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let rejectTimeout: ((error: Error) => void) | undefined;
  const timeoutPromise = timeoutMs
    ? new Promise<never>((_resolve, reject) => {
        rejectTimeout = reject;
        timeout = setTimeout(() => reject(new Error("Agent stream collection timed out")), timeoutMs);
      })
    : null;
  const abortPromise = options.signal
    ? new Promise<never>((_resolve, reject) => {
        if (options.signal?.aborted) {
          reject(options.signal.reason instanceof Error ? options.signal.reason : new Error("Agent stream collection aborted"));
          return;
        }
        options.signal?.addEventListener("abort", () => {
          reject(options.signal?.reason instanceof Error ? options.signal.reason : new Error("Agent stream collection aborted"));
        }, { once: true });
      })
    : null;

  try {
    while (true) {
      const read = reader.read();
      const raced = await Promise.race([read, ...[timeoutPromise, abortPromise].filter(Boolean) as Promise<never>[]]);
      const { done, value } = raced as ReadableStreamReadResult<string>;
      if (done) break;
      result += value;
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    rejectTimeout = undefined;
  }
  return result;
}

/**
 * 判断一组 messages 中是否包含图片内容（多模态请求）
 */
export function hasImageContent(messages: AgentMessage[]): boolean {
  return messages.some((m) =>
    Array.isArray(m.content) && m.content.some((part) => part.type === "image_url")
  );
}

/**
 * MIMO 流式调用（仅多模态，不含纯文本，不设 max_tokens）
 */
export async function streamAgent(
  messages: AgentMessage[],
  signal?: AbortSignal
): Promise<ReadableStream<string>> {
  const baseUrl = requireEnv("AGENT_API_BASE_URL").replace(/\/$/, "");
  const token = requireEnv("AGENT_API_TOKEN");
  const isVision = hasImageContent(messages);
  const model = isVision
    ? (process.env.AGENT_VISION_MODEL || "mimo-v2.5")
    : (process.env.AGENT_MODEL || "mimo-v2.5");
  let response: Response;
  const requestSignal = createRequestSignal(agentTimeoutMs(isVision), signal);
  try {
    response = await fetch(baseUrl + "/chat/completions", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ model, messages, temperature: 0.15, stream: true }),
      signal: requestSignal.signal
    });
    if (!response.ok) { const t = await response.text(); throw new Error("Agent API error " + response.status + ": " + t); }
  } catch (error) {
    requestSignal.cleanup();
    throw error;
  }
  if (!response.body) {
    requestSignal.cleanup();
    throw new Error("Agent API returned empty response body");
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
            requestSignal.cleanup();
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
              requestSignal.cleanup();
              break;
            }
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (typeof content === "string" && content) {
                pending.push(content);
              }
            } catch {}
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
        requestSignal.cleanup();
        controller.error(error);
      }
    },
    async cancel() {
      closed = true;
      requestSignal.cleanup();
      await reader.cancel();
    }
  });
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

  const stream = await streamAgent(messages, signal);
  const fullText = await collectStreamToString(stream, { timeoutMs: agentTimeoutMs(true), signal });
  if (logModule) await logAgentResponse(logModule, { raw: fullText });
  const extracted = extractJsonFromText(fullText);
  const parsed = schema.parse(JSON.parse(extracted));
  if (logModule) await logAgentResponse(logModule, { parsed });
  return parsed;
}
