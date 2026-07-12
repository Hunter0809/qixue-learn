import { routeJson } from "@/lib/api-route";
import {
  getStoredLearningRecords,
  getStoredResourceFeed,
  getStoredReviewPlans,
  getStoredUserProfile,
  getStoredWeakPoints
} from "@/lib/server-db";

export async function GET(request: Request) {
  return routeJson(async () => {
    const url = new URL(request.url);
    const owner = (url.searchParams.get("owner") || "__anonymous__").trim().toLowerCase();
    const [profile, learningRecords, weakPoints, reviewPlans, resources] = await Promise.all([
      getStoredUserProfile(owner),
      getStoredLearningRecords(owner, 120),
      getStoredWeakPoints(owner, 120),
      getStoredReviewPlans(owner, 60),
      getStoredResourceFeed(180, owner)
    ]);

    return {
      owner,
      profile,
      learningRecords,
      weakPoints,
      reviewPlans,
      resources
    };
  });
}
