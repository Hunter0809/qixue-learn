import { askAgentStreamCollect } from "@/lib/agent";
import { routeJson } from "@/lib/api-route";
import { mistakeAnalysisSchema } from "@/lib/schemas";
import { logModuleRequest } from "@/lib/server-logger";

export async function POST(request: Request) {
  return routeJson(async () => {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new Error("Missing uploaded file");
    }

    const imageUrl = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
    const context = {
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size
    };
    await logModuleRequest("mistake_upload", context);
    return askAgentStreamCollect(
      "Multimodal/OCR Tutor Agent: 用户上传了错题图片。仔细分析图片内容，提取题目文本并生成分析。必须返回且只返回这些英文字段：mistakeId(string), recognizedText(string), cause(string), knowledge(string[]), hints(string[]), fullExplanation(string), similarQuestions(array)。similarQuestions 每项包含 id, type('choice'|'blank'|'coding'|'short'), knowledge, difficulty('easy'|'medium'|'hard'), stem, options 可选。",
      mistakeAnalysisSchema,
      context,
      imageUrl,
      "mistake_upload"
    );
  });
}
