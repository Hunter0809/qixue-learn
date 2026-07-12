import { NextResponse } from "next/server";
import { ZodError } from "zod";

export async function routeJson<T>(handler: () => Promise<T>) {
  try {
    return NextResponse.json(await handler());
  } catch (error) {
    if (error instanceof ZodError) {
      return new NextResponse(JSON.stringify({ error: "Agent response schema mismatch", issues: error.issues }), {
        status: 502,
        headers: { "content-type": "application/json" }
      });
    }
    const message = error instanceof Error ? error.message : "Unknown server error";
    return new NextResponse(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
}
