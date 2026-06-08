import { routeJson } from "@/lib/api-route";
import { reportSchema } from "@/lib/schemas";

export async function GET(request: Request) {
  return routeJson(async () => {
    const url = new URL(request.url);
    const range = url.searchParams.get("range") === "month" ? "month" : "week";
    return reportSchema.parse({
      range,
      studyHours: 0,
      masteredKnowledge: 0,
      mistakeCount: 0,
      accuracyTrend: [],
      reviewPlan: [],
      weakPoints: []
    });
  });
}
