import { routeJson } from "@/lib/api-route";
import { persistLearningBehavior } from "@/lib/learning-persistence";
import type { LearnerProfile } from "@/lib/types";
import { z } from "zod";

const requestSchema = z.object({
  owner: z.string().optional(),
  subject: z.string().min(1),
  knowledge: z.string().min(1),
  source: z.string().min(1),
  correct: z.boolean().optional(),
  profile: z.object({
    nickname: z.string().optional(),
    school: z.string().optional(),
    grade: z.string().optional(),
    region: z.string().optional(),
    difficulty: z.string().optional()
  }).optional()
});

export async function POST(request: Request) {
  return routeJson(async () => {
    const body = requestSchema.parse(await request.json());
    const result = await persistLearningBehavior({ ...body, profile: body.profile as LearnerProfile | undefined });
    return { ok: true, result };
  });
}
