import { routeJson } from "@/lib/api-route";
import { clearHomeworkResponseCache } from "@/lib/homework-response-cache";

export async function POST() {
  return routeJson(async () => ({
    homeworkResponses: await clearHomeworkResponseCache()
  }));
}
