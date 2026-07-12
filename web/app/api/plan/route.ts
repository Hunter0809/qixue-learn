import { askDeepSeekStreamCollect } from "@/lib/agent-deepseek";
import { routeJson } from "@/lib/api-route";
import { planRequestSchema, planSchema } from "@/lib/schemas";
import { logModuleRequest } from "@/lib/server-logger";
import { getStoredLearningRecords, getStoredReviewPlans, getStoredUserProfile, getStoredWeakPoints, saveStoredReviewPlan } from "@/lib/server-db";

export async function POST(request: Request) {
  return routeJson(async () => {
    const body = planRequestSchema.parse(await request.json());
    await logModuleRequest("plan", body);
    const owner = body.owner?.trim().toLowerCase() || "__anonymous__";
    const [storedProfile, weakPoints, learningRecords, previousPlans] = await Promise.all([
      getStoredUserProfile(owner),
      getStoredWeakPoints(owner, 18),
      getStoredLearningRecords(owner, 30),
      getStoredReviewPlans(owner, 3)
    ]);
    const persistedProfile = storedProfile ? {
      nickname: storedProfile.nickname,
      school: storedProfile.school,
      grade: storedProfile.grade,
      region: storedProfile.region,
      difficulty: storedProfile.difficulty,
      major: storedProfile.major,
      learningGoal: storedProfile.learningGoal,
      knowledgeBase: storedProfile.knowledgeBase,
      cognitiveStyle: storedProfile.cognitiveStyle,
      errorPreference: storedProfile.errorPreference,
      learningPreference: storedProfile.learningPreference,
      historySummary: storedProfile.historySummary,
      targetExam: storedProfile.targetExam
    } : {};
    const profile = { ...persistedProfile, ...(body.profile || {}) };
    const profileText = [
      profile.major ? `专业：${profile.major}` : "",
      profile.learningGoal ? `画像目标：${profile.learningGoal}` : "",
      profile.region ? `地区：${profile.region}` : "",
      profile.school ? `学校：${profile.school}` : "",
      profile.grade ? `年级：${profile.grade}` : "",
      profile.targetExam ? `目标考试：${profile.targetExam}` : "",
      profile.knowledgeBase ? `知识基础：${profile.knowledgeBase}` : "",
      profile.cognitiveStyle ? `认知风格：${profile.cognitiveStyle}` : "",
      profile.errorPreference ? `易错点偏好：${profile.errorPreference}` : "",
      profile.learningPreference ? `学习偏好：${profile.learningPreference}` : "",
      profile.difficulty ? `难度偏好：${profile.difficulty}` : ""
    ].filter(Boolean).join("；");
    const weakPointText = weakPoints.length
      ? weakPoints.map((point) => `${point.subject}·${point.knowledge}（薄弱权重 ${point.weight}，来源 ${point.source}）`).join("；")
      : "暂无已持久化薄弱点，必须根据本次目标和画像规划诊断步骤";
    const recentRecords = learningRecords.slice(0, 12);
    const progressText = recentRecords.length
      ? `已有 ${learningRecords.length} 条学习记录；近期开启模块：${recentRecords.map((record) => `${record.subject}/${record.title}`).join("、")}`
      : "暂无已持久化学习记录，计划第 1 天必须包含基线诊断和目标拆解";
    const previousPlanText = previousPlans[0]?.plan.summary || "暂无历史计划，需要从当前画像和行为重新规划";
    const enrichedRequest = { ...body, profile: Object.keys(profile).length ? profile : undefined };
    const plan = await askDeepSeekStreamCollect(
      [
        "Planner Agent: 将学习目标拆解为 7 天中文复习计划。",
        `必须根据用户画像生成，而不是只复述薄弱点。当前用户画像：${profileText || "未提供"}。`,
        `数据库中的薄弱点：${weakPointText}。必须在 days.knowledge 和 days.resources 中优先覆盖这些薄弱点，并注明先后顺序。`,
        `数据库中的学习进度：${progressText}。历史计划摘要：${previousPlanText}。计划必须根据已有进度避免重复，并为缺少记录的用户安排基线诊断。`,
        "地区用于匹配当地学段/考试语境和资源例子；年级用于限定知识深度、题型和每天任务量；专业用于选择案例；不得生成与画像不符的内容。",
        "计划的每一天都必须围绕 goal、画像和薄弱知识点，并在知识点、任务难度和资源建议中体现地区、专业与年级。",
        "除语言学习计划中必须保留的单词、例句、译文外，summary、title、knowledge、resources 等所有自然语言字段值必须使用中文。",
        "必须返回且只返回 JSON 对象，字段为 planId(string), summary(string), days(array)。",
        "days 每项必须包含 day(number), title(string), minutes(number), priority(number 1-5), knowledge(string[]), resources(string[])。",
        "不要输出英文标题、英文解释、Markdown 或 JSON 之外的文本。"
      ].join("\n"),
      planSchema,
      enrichedRequest,
      "plan"
    );
    if (body.owner) {
      await saveStoredReviewPlan({ owner: body.owner, subject: body.subject, plan });
    }
    return plan;
  });
}
