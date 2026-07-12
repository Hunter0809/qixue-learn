import { emitServiceWarning } from "@/lib/client-warning";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function parseApiMessage(text: string, fallback: string) {
  try {
    const payload = JSON.parse(text) as { error?: string };
    return payload.error || fallback;
  } catch {
    return text || fallback;
  }
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    const message = parseApiMessage(text, response.statusText || "请求失败");
    emitServiceWarning(`请求链路异常：${message}`);
    throw new ApiError(message, response.status);
  }
  try {
    return await response.json() as T;
  } catch {
    emitServiceWarning("请求链路异常：服务已响应，但没有返回有效结果。");
    throw new ApiError("服务没有返回有效结果", response.status);
  }
}

export async function fetcher<T>(url: string): Promise<T> {
  try {
    return await readJsonResponse<T>(await fetch(url));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    emitServiceWarning("请求链路异常：无法连接到服务，请检查网络或稍后重试。");
    throw error;
  }
}

export async function postJson<TResponse, TBody>(url: string, body: TBody): Promise<TResponse> {
  try {
    return await readJsonResponse<TResponse>(await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    emitServiceWarning("请求链路异常：无法连接到服务，请检查网络或稍后重试。");
    throw error;
  }
}
