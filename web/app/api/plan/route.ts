import { askDeepSeekStreamCollect } from "@/lib/agent-deepseek";
import { routeJson } from "@/lib/api-route";
import { planRequestSchema, planSchema } from "@/lib/schemas";
import { logModuleRequest } from "@/lib/server-logger";
import { saveStoredReviewPlan } from "@/lib/server-db";

export async function POST(request: Request) {
  return routeJson(async () => {
    const body = planRequestSchema.parse(await request.json());
    await logModuleRequest("plan", body);
    const profileText = [body.profile?.region ? `地区：${body.profile.region}` : "", body.profile?.school ? `学校：${body.profile.school}` : "", body.profile?.grade ? `年级：${body.profile.grade}` : "", body.profile?.difficulty ? `难度偏好：${body.profile.difficulty}` : ""].filter(Boolean).join("；");
    const plan = await askDeepSeekStreamCollect(
      [
        "Planner Agent: 将学习目标拆解为 7 天中文复习计划。",
        `必须根据用户画像生成，而不是只复述薄弱点。当前用户画像：${profileText || "未提供"}。`,
        "地区用于匹配当地学段/考试语境和资源例子；年级用于限定知识深度、题型和每天任务量；不得生成与画像不符的内容。",
        "计划的每一天都必须围绕 goal 中的薄弱知识点，并在知识点、任务难度和资源建议中体现地区与年级。",
        "除语言学习计划中必须保留的单词、例句、译文外，summary、title、knowledge、resources 等所有自然语言字段值必须使用中文。",
        "必须返回且只返回 JSON 对象，字段为 planId(string), summary(string), days(array)。",
        "days 每项必须包含 day(number), title(string), minutes(number), priority(number 1-5), knowledge(string[]), resources(string[])。",
        "不要输出英文标题、英文解释、Markdown 或 JSON 之外的文本。"
      ].join("\n"),
      planSchema,
      body,
      "plan"
    );
    if (body.owner) {
      await saveStoredReviewPlan({ owner: body.owner, subject: body.subject, plan });
    }
    return plan;
  });
}
