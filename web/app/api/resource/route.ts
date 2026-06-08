import { routeJson } from "@/lib/api-route";
import { resourceRequestSchema, resourceResponseSchema, resourceSchema } from "@/lib/schemas";
import { z } from "zod";
import { askDeepSeekStreamCollect } from "@/lib/agent-deepseek";
import { canonicalizeKnowledge } from "@/lib/knowledge-catalog";
import { getStoredResources, saveStoredResources } from "@/lib/server-db";
import { logModuleRequest } from "@/lib/server-logger";

const SUBJECTS = ["数学", "语文", "英语", "物理", "化学", "生物", "历史", "地理", "政治", "科学"];

function subjectFromRequestKnowledge(knowledge: string) {
  const trimmed = knowledge.trim();
  return SUBJECTS.find((subject) => new RegExp(`^${subject}(?:\\s|[:：-])`).test(trimmed)) || "";
}

function semesterPhase(date = new Date()) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (month === 2 || (month === 3 && day <= 20) || month === 9) return "学期初";
  if ((month >= 4 && month <= 5) || (month >= 10 && month <= 11)) return "学期中";
  return "学期末";
}

const resourceSpecs = [
  { type: "lecture", focus: "核心概念", titleHint: "核心概念讲义" },
  { type: "lecture", focus: "板书解释", titleHint: "板书式讲解" },
  { type: "exercise", focus: "例题拆解", titleHint: "例题拆解" },
  { type: "exercise", focus: "巩固训练", titleHint: "巩固训练" },
  { type: "diagram", focus: "结构梳理", titleHint: "图解梳理" },
  { type: "analogy", focus: "类比理解", titleHint: "类比理解" }
] as const;

async function generateResourceWithRetry(
  task: string,
  context: unknown,
  retries = 3,
  logModule = "resource"
): Promise<z.infer<typeof resourceSchema>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const strictTask = `${task}\nStability requirement: attempt ${attempt}/${retries}. Return exactly one JSON object that validates against the provided schema. Do not omit required fields, do not return Markdown, and do not include commentary.`;
      return await askDeepSeekStreamCollect(strictTask, resourceSchema, context, logModule);
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
    }
  }
  throw lastError;
}

export async function POST(request: Request) {
  return routeJson(async () => {
    const body = resourceRequestSchema.parse(await request.json());
    await logModuleRequest("resource", body);
    const catalogPoint = canonicalizeKnowledge(body.knowledge, "", body.profile?.grade);
    const subject = catalogPoint?.subject || subjectFromRequestKnowledge(body.knowledge);
    const knowledge = catalogPoint ? `${catalogPoint.subject} ${catalogPoint.knowledge}` : body.knowledge.trim();
    const stored = await getStoredResources(knowledge, body.profile);
    if (stored.length > 0) {
      return resourceResponseSchema.parse({ resources: stored });
    }
    const today = new Date();
    const profileText = [
      body.profile?.region ? `地区：${body.profile.region}` : "",
      body.profile?.school ? `学校：${body.profile.school}` : "",
      body.profile?.grade ? `年级：${body.profile.grade}` : "",
      body.profile?.difficulty ? `资源难度偏好：${body.profile.difficulty}` : "",
      `当前日期：${today.toISOString().slice(0, 10)}`,
      `学习时段：${semesterPhase(today)}`
    ].filter(Boolean).join("；");
    const resources = [];

    for (const [index, spec] of resourceSpecs.entries()) {
      const generated = await generateResourceWithRetry(
        [
          "Resource Agent: 根据教材目录数据库中的知识点生成一张完整学习资源卡片。",
          `用户画像：${profileText || "未提供登录用户信息"}。内容难度、例题情境、复习节奏必须贴合该用户画像。`,
          "除语言学习资源中的例句、原文、译文、词汇本身外，所有自然语言内容必须使用中文。",
          "返回 JSON 对象，字段为 id(string), title(string), type(string), subject(string), knowledge(string), difficulty(string), summary(string), content(string)。",
          `本次只生成第 ${index + 1} 张卡片，定位为：${spec.focus}，标题应体现：${spec.titleHint}。`,
          `type 固定为 ${spec.type}。subject 必须固定为：${subject}。knowledge 必须固定为：${knowledge}。`,
          "content 必须用以下分节标题组织：## 知识点、## 核心解释、## 相关课程、## 例题（含答案）、## 练习题。",
          "content 必须完整包含五个分节，不能缺少任何分节。",
          "content 中每个 **加粗文本** 都表示该部分的小标题；小标题后面的正文必须另起一行，不能和加粗文本写在同一行。",
          "核心解释要像老师板书一样写：先写定义，再写关键公式/规则，再写易错点。",
          "相关课程给出 3 个适合继续学习的视频或课程检索关键词。",
          "例题必须包含题目、答案、关键步骤。",
          "练习题必须包含 2 道题，每道题给出答案。",
          "content 必须是实际内容，不能是模板、占位符或泛泛建议。",
          "必须返回且只返回 JSON。"
        ].join("\n"),
        { ...body, knowledge, type: spec.type, focus: spec.focus, titleHint: spec.titleHint },
        3,
        "resource"
      );
      resources.push({
        ...generated,
        id: `${spec.type}_${index + 1}_${knowledge}`,
        subject,
        type: spec.type,
        knowledge
      });
    }

    const response = resourceResponseSchema.parse({ resources });
    await saveStoredResources(response.resources, body.profile);
    return response;
  });
}
