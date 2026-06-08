import { askDeepSeekStreamCollect } from "@/lib/agent-deepseek";
import { routeJson } from "@/lib/api-route";
import { planRequestSchema, planSchema } from "@/lib/schemas";
import { logModuleRequest } from "@/lib/server-logger";

export async function POST(request: Request) {
  return routeJson(async () => {
    const body = planRequestSchema.parse(await request.json());
    await logModuleRequest("plan", body);
    return askDeepSeekStreamCollect(
      [
        "Planner Agent: 将学习目标拆解为 7 天中文复习计划。",
        "除语言学习计划中必须保留的单词、例句、译文外，summary、title、knowledge、resources 等所有自然语言字段值必须使用中文。",
        "必须返回且只返回 JSON 对象，字段为 planId(string), summary(string), days(array)。",
        "days 每项必须包含 day(number), title(string), minutes(number), priority(number 1-5), knowledge(string[]), resources(string[])。",
        "不要输出英文标题、英文解释、Markdown 或 JSON 之外的文本。"
      ].join("\n"),
      planSchema,
      body,
      "plan"
    );
  });
}
