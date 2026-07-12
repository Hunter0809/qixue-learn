import { routeJson } from "@/lib/api-route";

export async function GET() {
  const token = process.env.AGENT_API_TOKEN || "";
  const hasUsableToken = Boolean(token && !token.startsWith("replace-with-"));
  return routeJson(async () => ({
    connected: Boolean(process.env.AGENT_API_BASE_URL && hasUsableToken),
    model: process.env.AGENT_MODEL || "mimo-v2.5-pro"
  }));
}
