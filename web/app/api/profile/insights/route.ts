import { z } from "zod";
import { askDeepSeekStreamCollect } from "@/lib/agent-deepseek";
import { routeJson } from "@/lib/api-route";
import { learnerProfileSchema } from "@/lib/schemas";
import { getStoredLearningRecords, getStoredUserProfile, saveStoredUserProfile } from "@/lib/server-db";

const requestSchema = z.object({
  owner: z.string().min(1),
  message: z.string().min(2).max(2000)
});

const responseSchema = z.object({
  reply: z.string(),
  profile: learnerProfileSchema.default({}),
  updatedDimensions: z.array(z.string()).default([]),
  missing: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0)
});

const profileFields = [
  "major",
  "learningGoal",
  "knowledgeBase",
  "cognitiveStyle",
  "errorPreference",
  "learningPreference",
  "historySummary",
  "targetExam"
] as const;

export async function POST(request: Request) {
  return routeJson(async () => {
    const body = requestSchema.parse(await request.json());
    const owner = body.owner.trim().toLowerCase();
    const current = await getStoredUserProfile(owner);
    const learningRecords = await getStoredLearningRecords(owner, 12);
    const result = await askDeepSeekStreamCollect(
      [
        "Profile Builder Agent：你负责通过自然语言对话构建和更新学生学习画像。",
        "不要要求用户填写长表单；从本轮消息、已有画像和真实学习记录中抽取信息。",
        "只根据证据更新字段，不能猜测或编造；无法确定的字段保持空值并放入 missing。",
        "画像必须覆盖 major、learningGoal、knowledgeBase、cognitiveStyle、errorPreference、learningPreference、historySummary、targetExam 八个学习维度。",
        "reply 要用中文自然对话，先确认已识别信息，再提出一个最重要的追问，帮助画像随学随新。",
        "必须只返回 JSON：reply(string), profile(object), updatedDimensions(string[]), missing(string[]), confidence(number 0-1)。",
        "profile 只允许字段：major, learningGoal, knowledgeBase, cognitiveStyle, errorPreference, learningPreference, historySummary, targetExam；没有证据的字段不要填写。"
      ].join("\n"),
      responseSchema,
      {
        currentProfile: current || {},
        recentLearningRecords: learningRecords.map((item) => ({ feature: item.feature, subject: item.subject, input: item.input })).slice(-12),
        userMessage: body.message
      },
      "profile_builder"
    );

    const patch = Object.fromEntries(
      Object.entries(result.profile).filter(([key, value]) => profileFields.includes(key as typeof profileFields[number]) && typeof value === "string" && value.trim())
    );
    const nextProfile = {
      ...(current || {}),
      ...patch,
      owner,
      updatedAt: Date.now()
    };
    await saveStoredUserProfile(nextProfile);
    return { ...result, profile: nextProfile };
  });
}
