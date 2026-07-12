import { routeJson } from "@/lib/api-route";
import { profileSchema } from "@/lib/schemas";
import { getStoredResourceFeed, getStoredUserProfile, getStoredWeakPoints, saveStoredUserProfile } from "@/lib/server-db";

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export async function GET(request: Request) {
  return routeJson(async () => {
    const url = new URL(request.url);
    const owner = url.searchParams.get("owner") || "__anonymous__";
    const [storedProfile, weakPoints, recommendedResources] = await Promise.all([
      getStoredUserProfile(owner),
      getStoredWeakPoints(owner),
      getStoredResourceFeed(80, owner)
    ]);
    const totalWeakness = weakPoints.reduce((sum, point) => sum + Math.max(0, point.weight), 0);
    const averageWeakness = weakPoints.length ? totalWeakness / weakPoints.length : 0;
    const progress = clampPercent(100 - averageWeakness);

    return profileSchema.parse({
      progress,
      completedKnowledge: progress,
      totalKnowledge: 100,
      streakDays: weakPoints.length || storedProfile ? 1 : 0,
      today_tasks: weakPoints.slice(0, 4).map((point, index) => ({
        id: `review_${point.subject}_${point.knowledge}_${index}`,
        title: `${point.subject}复习`,
        knowledge: point.knowledge,
        exercises: 3,
        minutes: 20,
        status: "todo"
      })),
      weak_points: weakPoints.slice(0, 8).map((point) => ({
        id: `wp_${point.subject}_${point.knowledge}`,
        name: point.knowledge,
        mastery: clampPercent(100 - point.weight),
        severity: clampPercent(point.weight)
      })),
      recommended_resources: recommendedResources
    });
  });
}

export async function POST(request: Request) {
  return routeJson(async () => {
    const body = await request.json() as {
      owner?: string;
      nickname?: string;
      avatarUrl?: string;
      school?: string;
      grade?: string;
      region?: string;
      difficulty?: string;
      major?: string;
      learningGoal?: string;
      knowledgeBase?: string;
      cognitiveStyle?: string;
      errorPreference?: string;
      learningPreference?: string;
      historySummary?: string;
      targetExam?: string;
    };
    const owner = body.owner?.trim();
    if (!owner) throw new Error("Missing profile owner");
    await saveStoredUserProfile({
      owner,
      nickname: body.nickname || "",
      avatarUrl: body.avatarUrl || "",
      school: body.school || "",
      grade: body.grade || "",
      region: body.region || "",
      difficulty: body.difficulty as never,
      major: body.major || "",
      learningGoal: body.learningGoal || "",
      knowledgeBase: body.knowledgeBase || "",
      cognitiveStyle: body.cognitiveStyle || "",
      errorPreference: body.errorPreference || "",
      learningPreference: body.learningPreference || "",
      historySummary: body.historySummary || "",
      targetExam: body.targetExam || "",
      updatedAt: Date.now()
    });
    return { ok: true };
  });
}
