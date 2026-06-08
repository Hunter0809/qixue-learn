import { askDeepSeekStreamCollect } from "@/lib/agent-deepseek";
import { routeJson } from "@/lib/api-route";
import { quizSubmitRequestSchema, quizSubmitSchema } from "@/lib/schemas";
import { logModuleRequest } from "@/lib/server-logger";

export async function POST(request: Request) {
  return routeJson(async () => {
    const body = quizSubmitRequestSchema.parse(await request.json());
    await logModuleRequest("quiz_submit", body);
    return askDeepSeekStreamCollect(
      "Evaluator Agent: 对诊断测试答案评分，更新薄弱知识点。除语言题目中必须引用的外语原文、例句、译文外，其他所有自然语言内容使用中文。必须返回且只返回这些英文字段：totalScore(number 0-100), feedback(array), updatedWeakPoints(array)。feedback 每项包含 questionId(string), score(number 0-100), feedback(string), weakPoint(string 可选)。updatedWeakPoints 每项包含 id, name, mastery(number), severity(number)。",
      quizSubmitSchema,
      body,
      "quiz_submit"
    );
  });
}
