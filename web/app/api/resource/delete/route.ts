import { routeJson } from "@/lib/api-route";
import { deleteStoredResource } from "@/lib/server-db";

export async function POST(request: Request) {
  return routeJson(async () => {
    const body = await request.json() as { id?: string };
    if (!body.id) throw new Error("Missing resource id");
    await deleteStoredResource(body.id);
    return { ok: true };
  });
}
