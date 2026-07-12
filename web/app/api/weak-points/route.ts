import { routeJson } from "@/lib/api-route";
import { deleteStoredWeakPoint, getStoredWeakPoints, saveStoredWeakPoint } from "@/lib/server-db";

function ownerKey(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "__anonymous__";
}

export async function GET(request: Request) {
  return routeJson(async () => {
    const url = new URL(request.url);
    const points = await getStoredWeakPoints(ownerKey(url.searchParams.get("owner")), 100);
    return points.map((point) => ({
      id: `${point.subject}_${point.knowledge}`,
      subject: point.subject,
      knowledge: point.knowledge,
      weight: point.weight,
      source: point.source,
      updatedAt: point.updatedAt
    }));
  });
}

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
    const owner = ownerKey(body.owner);
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
