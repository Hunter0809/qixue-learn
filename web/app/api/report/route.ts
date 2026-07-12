import { routeJson } from "@/lib/api-route";
import { reportSchema } from "@/lib/schemas";
import { getStoredLearningBehaviors, getStoredLearningRecords, getStoredReviewPlans, getStoredWeakPoints } from "@/lib/server-db";

const DAY_MS = 24 * 60 * 60 * 1000;
const SOURCE_MINUTES: Record<string, number> = {
  resource_click: 3,
  video_click: 8,
  practice: 12,
  quiz_submit: 15,
  mistake_analysis: 10,
  photo_search: 8,
  ai_answer: 8,
  homework_review: 15,
  essay_correction: 15,
  mental_math_check: 10
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function ownerKey(value: string | null) {
  return value?.trim().toLowerCase() || "__anonymous__";
}

function dateKey(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function eventAccuracy(events: Array<{ correct?: boolean }>) {
  const known = events.filter((event) => event.correct !== undefined);
  if (!known.length) return 0;
  return Math.round((known.filter((event) => event.correct === true).length / known.length) * 100);
}

export async function GET(request: Request) {
  return routeJson(async () => {
    const url = new URL(request.url);
    const range = url.searchParams.get("range") === "month" ? "month" : "week";
    const owner = ownerKey(url.searchParams.get("owner"));
    const days = range === "month" ? 30 : 7;
    const since = Date.now() - (days - 1) * DAY_MS;
    const [allRecords, behaviors, weakPoints, plans] = await Promise.all([
      getStoredLearningRecords(owner, 500),
      getStoredLearningBehaviors(owner, since, 1000),
      getStoredWeakPoints(owner, 24),
      getStoredReviewPlans(owner, 12)
    ]);
    const records = allRecords.filter((record) => record.updatedAt >= since);
    const knowledge = new Set(records.flatMap((record) => record.response.knowledge || []));
    const weakKnowledge = new Set(weakPoints.map((point) => `${point.subject} ${point.knowledge}`));
    const masteredFromBehavior = new Set(
      behaviors.filter((event) => event.correct === true).map((event) => `${event.subject} ${event.knowledge}`)
    );
    const masteredKnowledge = new Set([...masteredFromBehavior].filter((item) => !weakKnowledge.has(item)));
    const resourceInteractions = behaviors.filter((event) => ["resource_click", "video_click", "course_recommend"].includes(event.source)).length;
    const practiceAttempts = behaviors.filter((event) => ["practice", "quiz_submit"].includes(event.source)).length;
    const correctAttempts = behaviors.filter((event) => event.correct === true).length;
    const knownAttempts = behaviors.filter((event) => event.correct !== undefined).length;
    const pendingPlanDays = plans.reduce((sum, item) => sum + item.plan.days.filter((day) => day.day > 0).length, 0);
    const activeDates = new Set([
      ...records.map((record) => dateKey(record.updatedAt)),
      ...behaviors.map((event) => dateKey(event.createdAt))
    ]);
    const studyMinutes = records.reduce((sum, record) => sum + Math.max(6, Math.min(45, Math.ceil(record.input.length / 18))), 0)
      + behaviors.reduce((sum, event) => sum + (SOURCE_MINUTES[event.source] || 3), 0);
    const adjustmentActions = weakPoints.length
      ? [
          `优先复习 ${weakPoints.slice(0, 3).map((point) => `${point.subject} ${point.knowledge}`).join("、")}，并按薄弱权重排序资源。`,
          "新行为和练习结果将继续更新薄弱权重，下一次计划会重新调整顺序。"
        ]
      : ["当前没有达到阈值的薄弱点；继续完成练习或资源交互后，系统会基于真实记录调整计划。"];
    const trendLabels = range === "month"
      ? ["第1周", "第2周", "第3周", "第4周"]
      : ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    const accuracyTrend = trendLabels.map((label, index) => {
      const bucketEvents = range === "month"
        ? behaviors.filter((event) => {
            const weekIndex = Math.min(3, Math.floor((event.createdAt - since) / (7 * DAY_MS)));
            return weekIndex === index;
          })
        : behaviors.filter((event) => new Date(event.createdAt).getDay() === (index + 1) % 7);
      return { label, accuracy: eventAccuracy(bucketEvents) };
    });
    const reviewPlan = plans
      .flatMap((item) => item.plan.days.slice(0, 6).map((day, index) => ({
        id: `${item.subject}_${item.plan.planId}_${day.day}`,
        date: new Date(Date.now() + index * DAY_MS).toISOString().slice(0, 10),
        title: `${item.subject} · ${day.title}`,
        minutes: day.minutes,
        reminder: "19:30"
      })))
      .slice(0, 12);
    const weakPointResponse = weakPoints.map((point) => ({
      id: `${point.subject}_${point.knowledge}`,
      name: `${point.subject} ${point.knowledge}`,
      mastery: clamp(100 - point.weight),
      severity: clamp(point.weight)
    }));
    return reportSchema.parse({
      range,
      studyHours: Number((studyMinutes / 60).toFixed(1)),
      masteredKnowledge: masteredKnowledge.size,
      mistakeCount: records.filter((record) => record.feature.includes("review") || record.feature.includes("correction") || record.feature === "mental_math_check").length
        + behaviors.filter((event) => event.source === "mistake_analysis").length,
      accuracyTrend,
      reviewPlan,
      weakPoints: weakPointResponse,
      plans: plans.map((item) => ({ subject: item.subject, plan: item.plan })),
      evaluation: {
        totalInteractions: records.length + behaviors.length,
        resourceInteractions,
        practiceAttempts,
        correctAttempts,
        accuracy: knownAttempts ? Math.round((correctAttempts / knownAttempts) * 100) : 0,
        completionRate: Math.round((records.length / Math.max(1, records.length + pendingPlanDays)) * 100),
        activeDays: activeDates.size,
        masteryScore: knowledge.size ? Math.round((masteredKnowledge.size / knowledge.size) * 100) : 0,
        adjustmentActions
      }
    });
  });
}
