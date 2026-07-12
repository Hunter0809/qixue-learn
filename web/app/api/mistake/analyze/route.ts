import { askDeepSeekStreamCollect } from "@/lib/agent-deepseek";
import { routeJson } from "@/lib/api-route";
import { mistakeAnalysisSchema } from "@/lib/schemas";
import { logModuleRequest } from "@/lib/server-logger";
import { z } from "zod";

const requestSchema = z.object({
  text: z.string().min(1)
});

export async function POST(request: Request) {
  return routeJson(async () => {
    const body = requestSchema.parse(await request.json());
    await logModuleRequest("mistake_analyze", body);
    return askDeepSeekStreamCollect(
      "Tutor/Evaluator Agent: 分析错题文本。除语言学习题目中必须保留的原文、例句、译文外，其他所有自然语言内容使用中文。必须返回且只返回这些英文字段：mistakeId(string), recognizedText(string), cause(string), knowledge(string[]), hints(string[]), fullExplanation(string), similarQuestions(array)。similarQuestions 每项包含 id, type('choice'|'blank'|'coding'|'short'), knowledge, difficulty('easy'|'medium'|'hard'), stem, options 可选。",
      mistakeAnalysisSchema,
      body,
      "mistake_analyze"
    );
  });
}
