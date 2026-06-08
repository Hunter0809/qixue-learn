import { createHash } from "crypto";
import { mkdir, appendFile } from "fs/promises";
import os from "os";
import path from "path";

type LogEvent = {
  type: string;
  payload: unknown;
};

const LOG_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "qixue-logs")
  : path.join(process.cwd(), "logs");

function safeModuleName(module: string) {
  return module.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
}

function normalizeForLog(value: unknown): unknown {
  if (typeof value === "string") {
    const dataUrl = value.match(/^data:([^;,]+);base64,(.+)$/);
    if (dataUrl) {
      const bytes = Buffer.byteLength(dataUrl[2], "base64");
      return {
        kind: "data-url",
        mime: dataUrl[1],
        bytes,
        sha256: createHash("sha256").update(dataUrl[2]).digest("hex")
      };
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(normalizeForLog);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeForLog(item)])
    );
  }
  return value;
}

export async function writeModuleLog(module: string, event: LogEvent) {
  try {
    await mkdir(LOG_DIR, { recursive: true });
    const file = path.join(LOG_DIR, `${safeModuleName(module)}.jsonl`);
    const record = {
      timestamp: new Date().toISOString(),
      module,
      type: event.type,
      payload: normalizeForLog(event.payload)
    };
    await appendFile(file, `${JSON.stringify(record)}\n`, "utf8");
  } catch (error) {
    console.warn("[server-logger] skipped file log", error);
  }
}

export async function logModuleRequest(module: string, payload: unknown) {
  await writeModuleLog(module, { type: "request", payload });
}

export async function logAgentResponse(module: string, payload: unknown) {
  await writeModuleLog(module, { type: "agent_response", payload });
}
