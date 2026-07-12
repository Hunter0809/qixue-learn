import { routeJson } from "@/lib/api-route";
import { deleteStoredWeakPoint, saveStoredWeakPoint } from "@/lib/server-db";

export async function POST(request: Request) {
  return routeJson(async () => {
    const body = await request.json() as {
      owner?: string;
      subject?: string;
      knowledge?: string;
      weight?: number;
      source?: string;
      action?: "upsert" | "delete";
    };
    const owner = body.owner || "__anonymous__";
    if (!body.subject || !body.knowledge) throw new Error("Missing weak point identity");
    if (body.action === "delete") {
      await deleteStoredWeakPoint(owner, body.subject, body.knowledge);
      return { ok: true };
    }
    await saveStoredWeakPoint({
      owner,
      subject: body.subject,
      knowledge: body.knowledge,
      weight: typeof body.weight === "number" ? body.weight : 0,
      source: body.source || "unknown"
    });
    return { ok: true };
  });
}
