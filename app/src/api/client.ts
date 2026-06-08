import type { HomeworkRequest, HomeworkResponse, ProfileResponse } from "../types/domain";

const DEFAULT_BASE_URL = "http://10.0.2.2:3000";

export type ApiClientConfig = {
  baseUrl?: string;
  owner?: string;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function requestJson<TResponse, TBody = unknown>(
  path: string,
  options: { method?: "GET" | "POST"; body?: TBody; baseUrl?: string } = {}
): Promise<TResponse> {
  const response = await fetch(`${options.baseUrl || DEFAULT_BASE_URL}${path}`, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    throw new ApiError(await response.text(), response.status);
  }

  return response.json() as Promise<TResponse>;
}

export function fetchProfile(config?: ApiClientConfig) {
  const query = config?.owner ? `?owner=${encodeURIComponent(config.owner)}` : "";
  return requestJson<ProfileResponse>(`/api/profile${query}`, { baseUrl: config?.baseUrl });
}

export function runHomework(request: HomeworkRequest, config?: ApiClientConfig) {
  return requestJson<HomeworkResponse, HomeworkRequest>("/api/homework", {
    method: "POST",
    body: request,
    baseUrl: config?.baseUrl
  });
}
