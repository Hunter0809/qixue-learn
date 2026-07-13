import { after } from "next/server";
import { askDeepSeekStreamCollect } from "@/lib/agent-deepseek";
import { routeJson } from "@/lib/api-route";
import { getStoredUserProfile } from "@/lib/server-db";
import { quizSubmitRequestSchema, quizSubmitSchema } from "@/lib/schemas";
import { persistLearningBehavior, refreshBehaviorResources } from "@/lib/learning-persistence";
import { logModuleRequest } from "@/lib/server-logger";

export async function POST(request: Request) {
  return routeJson(async () => {
    const body = quizSubmitRequestSchema.parse(await request.json());
    const owner = body.owner?.trim().toLowerCase() || "__anonymous__";
    const storedProfile = await getStoredUserProfile(owner);
    const profile = body.profile || storedProfile || undefined;
    const questionMap = new Map(body.questions.map((question) => [question.id, question]));
    const context = {
      owner,
      learnerProfile: profile,
      quizId: body.quizId,
      questions: body.questions,
      answers: body.answers
    };
    await logModuleRequest("quiz_submit", context);
    const result = await askDeepSeekStreamCollect(
      "Evaluator Agent：严格依据 questions 和 answers 逐题评分，输出可执行的薄弱点。必须返回且只返回这些英文字段：totalScore(number 0-100), feedback(array), updatedWeakPoints(array)。feedback 每项包含 questionId(string), score(number 0-100), feedback(string), weakPoint(string 可选)。updatedWeakPoints 每项包含 id, name, mastery(number), severity(number)。除语言题目中必须引用的外语原文、例句、译文外，其他所有自然语言内容使用中文。",
      quizSubmitSchema,
      context,
      "quiz_submit"
    );
    const behaviorResults = await Promise.all(result.feedback.map((item) => {
      const question = questionMap.get(item.questionId);
      const knowledge = item.weakPoint || question?.knowledge || "诊断测试综合能力";
      return persistLearningBehavior({
        owner,
        subject: profile?.major || "综合",
        knowledge,
        source: "quiz_submit",
        profile: profile || undefined,
        correct: item.score >= 60
      });
    }));
    after(() => Promise.all(behaviorResults.filter(Boolean).map((behavior) => refreshBehaviorResources({
      owner,
      subject: behavior!.subject,
      knowledge: behavior!.knowledge,
      profile: behavior!.profile
    }))).then(() => undefined).catch(() => undefined));
    return result;
  });
}
