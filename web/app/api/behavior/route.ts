import { after } from "next/server";
import { routeJson } from "@/lib/api-route";
import { persistLearningBehavior, refreshBehaviorResources } from "@/lib/learning-persistence";
import type { LearnerProfile } from "@/lib/types";
import { learnerProfileSchema } from "@/lib/schemas";
import { z } from "zod";

const requestSchema = z.object({
  owner: z.string().optional(),
  subject: z.string().min(1),
  knowledge: z.string().min(1),
  source: z.string().min(1),
  correct: z.boolean().optional(),
  profile: learnerProfileSchema.optional()
});

export async function POST(request: Request) {
  return routeJson(async () => {
    const body = requestSchema.parse(await request.json());
    const result = await persistLearningBehavior({ ...body, profile: body.profile as LearnerProfile | undefined });
    if (result) {
      after(() => refreshBehaviorResources({
        owner: body.owner?.trim().toLowerCase() || "__anonymous__",
        subject: result.subject,
        knowledge: result.knowledge,
        profile: result.profile
      }).catch(() => undefined));
    }
    return { ok: true, result };
  });
}
