import { askDeepSeekStreamCollect } from "@/lib/agent-deepseek";
import { routeJson } from "@/lib/api-route";
import { getStoredLearningRecords, getStoredUserProfile, getStoredWeakPoints } from "@/lib/server-db";
import { quizSchema } from "@/lib/schemas";
import { logModuleRequest } from "@/lib/server-logger";

export async function GET(request: Request) {
  return routeJson(async () => {
    const url = new URL(request.url);
    const owner = url.searchParams.get("owner")?.trim().toLowerCase() || "__anonymous__";
    const [profile, weakPoints, records] = await Promise.all([
      getStoredUserProfile(owner),
      getStoredWeakPoints(owner, 20),
      getStoredLearningRecords(owner, 30)
    ]);
    const context = {
      owner,
      desiredQuestionCount: 6,
      adaptiveBasis: "history-profile",
      locale: "zh-CN",
      learnerProfile: profile,
      weakPoints: weakPoints.map((item) => ({ subject: item.subject, knowledge: item.knowledge, weight: item.weight })),
      recentLearning: records.slice(0, 8).map((item) => ({ feature: item.feature, subject: item.subject, knowledge: item.response.knowledge }))
    };
    await logModuleRequest("quiz", context);
    return askDeepSeekStreamCollect(
      "Quiz Agent：生成一套能力诊断测试。必须依据 learnerProfile、weakPoints 和 recentLearning 调整专业、年级、地区、难度和知识点覆盖。除语言题目中必须保留的外语原文、例句、译文外，其他所有自然语言内容使用中文。必须返回且只返回这些英文字段：quizId(string), title(string), durationMinutes(number), questions(array)。questions 每项必须包含 id(string), type('choice'|'blank'|'coding'|'short'), knowledge(string), difficulty('easy'|'medium'|'hard'), stem(string), options(string[] 可选)。题型必须覆盖 choice, blank, coding, short。",
      quizSchema,
      context,
      "quiz"
    );
  });
}
