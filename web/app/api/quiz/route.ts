import { askDeepSeekStreamCollect } from "@/lib/agent-deepseek";
import { routeJson } from "@/lib/api-route";
import { quizSchema } from "@/lib/schemas";
import { logModuleRequest } from "@/lib/server-logger";

export async function GET() {
  return routeJson(async () => {
    const context = { desiredQuestionCount: 6, adaptiveBasis: "history-profile", locale: "zh-CN" };
    await logModuleRequest("quiz", context);
    return askDeepSeekStreamCollect(
      "Quiz Agent: 生成一套能力诊断测试。除语言题目中必须保留的外语原文、例句、译文外，其他所有自然语言内容使用中文。必须返回且只返回这些英文字段：quizId(string), title(string), durationMinutes(number), questions(array)。questions 每项必须包含 id(string), type('choice'|'blank'|'coding'|'short'), knowledge(string), difficulty('easy'|'medium'|'hard'), stem(string), options(string[] 可选)。题型必须覆盖 choice, blank, coding, short。",
      quizSchema,
      context,
      "quiz"
    );
  });
}
