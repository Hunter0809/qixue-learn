import { z } from "zod";

const id = z.coerce.string().min(1);
const percent = z.number().min(0).max(100);

export const taskSchema = z.object({
  id,
  title: z.string(),
  knowledge: z.string(),
  exercises: z.number().int().nonnegative(),
  minutes: z.number().int().positive(),
  status: z.enum(["todo", "done"])
});

export const weakPointSchema = z.object({
  id,
  name: z.string(),
  mastery: percent,
  severity: percent
});

const difficultyMap: Record<string, "easy" | "medium" | "hard"> = {
  "基础": "easy", "简单": "easy", "easy": "easy",
  "中等": "medium", "同步": "medium", "medium": "medium",
  "提高": "hard", "困难": "hard", "hard": "hard"
};
const typeMap: Record<string, "lecture" | "exercise" | "diagram" | "analogy" | "reading" | "video" | "animation" | "code"> = {
  "讲义": "lecture", "核心概念": "lecture", "lecture": "lecture",
  "练习题": "exercise", "练习": "exercise", "例题": "exercise", "exercise": "exercise",
  "图解": "diagram", "思维导图": "diagram", "diagram": "diagram",
  "类比解释": "analogy", "类比": "analogy", "analogy": "analogy",
  "拓展阅读": "reading", "阅读": "reading", "reading": "reading",
  "视频": "video", "视频脚本": "video", "video": "video",
  "动画": "animation", "动画分镜": "animation", "animation": "animation",
  "代码实操": "code", "实操案例": "code", "code": "code"
};

export const resourceSchema = z.object({
  id,
  title: z.string(),
  type: z.string().transform((v) => typeMap[v] || "lecture"),
  subject: z.string().optional(),
  knowledge: z.string(),
  difficulty: z.string().transform((v) => difficultyMap[v] || "medium"),
  summary: z.string(),
  content: z.string().optional()
});

export const profileSchema = z.object({
  progress: percent,
  completedKnowledge: z.number().int().nonnegative(),
  totalKnowledge: z.number().int().positive(),
  streakDays: z.number().int().nonnegative(),
  today_tasks: z.array(taskSchema),
  weak_points: z.array(weakPointSchema),
  recommended_resources: z.array(resourceSchema)
});

export const learnerProfileSchema = z.object({
  nickname: z.string().optional(),
  school: z.string().optional(),
  grade: z.string().optional(),
  region: z.string().optional(),
  difficulty: z.enum(["基础", "同步", "提高", "竞赛"]).optional(),
  major: z.string().optional(),
  learningGoal: z.string().optional(),
  knowledgeBase: z.string().optional(),
  cognitiveStyle: z.string().optional(),
  errorPreference: z.string().optional(),
  learningPreference: z.string().optional(),
  historySummary: z.string().optional(),
  targetExam: z.string().optional()
});

export const planRequestSchema = z.object({
  owner: z.string().optional(),
  subject: z.string().min(1),
  goal: z.string().min(6),
  dailyMinutes: z.number().int().min(15).max(240),
  style: z.enum(["examples", "visual", "practice"]),
  profile: learnerProfileSchema.optional()
});

export const planSchema = z.object({
  planId: id,
  summary: z.string(),
  days: z.array(z.object({
    day: z.number().int().positive(),
    title: z.string(),
    minutes: z.number().int().positive(),
    priority: z.number().int().min(1).max(5),
    knowledge: z.array(z.string()),
    resources: z.array(z.string())
  }))
});

export const questionSchema = z.object({
  id,
  type: z.enum(["choice", "blank", "coding", "short"]).optional().default("short"),
  knowledge: z.string().or(z.array(z.string())).transform((v) => Array.isArray(v) ? v.join(", ") : v).optional().default(""),
  difficulty: z.enum(["easy", "medium", "hard"]).optional().default("medium"),
  stem: z.string().optional().default(""),
  options: z.array(z.coerce.string()).nullable().default([])
});

export const quizSchema = z.object({
  quizId: id,
  title: z.string(),
  durationMinutes: z.number().int().positive(),
  questions: z.array(questionSchema)
});

export const quizSubmitRequestSchema = z.object({
  quizId: id,
  answers: z.record(z.string(), z.string())
});

export const quizSubmitSchema = z.object({
  totalScore: percent,
  feedback: z.array(z.object({
    questionId: id,
    score: percent,
    feedback: z.string(),
    weakPoint: z.string().optional()
  })),
  updatedWeakPoints: z.array(weakPointSchema)
});

export const resourceRequestSchema = z.object({
  owner: z.string().optional(),
  knowledge: z.string().min(1),
  type: z.enum(["lecture", "exercise", "diagram", "analogy", "reading", "video", "animation", "code"]),
  style: z.enum(["plain", "exam", "practice"]),
  profile: learnerProfileSchema.optional()
});

export const resourceAgentTraceSchema = z.object({
  agentId: z.string(),
  role: z.string(),
  artifactType: z.enum(["lecture", "exercise", "diagram", "analogy", "reading", "video", "animation", "code"]),
  status: z.enum(["completed", "cache_hit"]),
  latencyMs: z.number().nonnegative().optional()
});

export const resourceResponseSchema = z.object({
  resources: z.array(resourceSchema),
  agents: z.array(resourceAgentTraceSchema).optional()
});

export const mistakeAnalysisSchema = z.object({
  mistakeId: id,
  recognizedText: z.string(),
  cause: z.string(),
  knowledge: z.array(z.string()),
  hints: z.array(z.string()),
  fullExplanation: z.string(),
  similarQuestions: z.array(questionSchema)
});

export const reportSchema = z.object({
  range: z.enum(["week", "month"]),
  studyHours: z.number().nonnegative(),
  masteredKnowledge: z.number().int().nonnegative(),
  mistakeCount: z.number().int().nonnegative(),
  accuracyTrend: z.array(z.object({
    label: z.string(),
    accuracy: percent
  })),
  reviewPlan: z.array(z.object({
    id,
    date: z.string(),
    title: z.string(),
    minutes: z.number().int().positive(),
    reminder: z.string()
  })),
  weakPoints: z.array(weakPointSchema)
});

export const homeworkRequestSchema = z.object({
  owner: z.string().optional(),
  feature: z.enum([
    "photo_search",
    "ai_answer",
    "homework_review",
    "essay_correction",
    "oral_practice",
    "word_lookup",
    "photo_translate",
    "mental_math_check",
    "document_scan",
    "recitation",
    "course_recommend",
    "parent_report"
  ]),
  subject: z.string().min(1),
  content: z.string().min(1),
  imageUrl: z.string().optional(),
  forceAI: z.boolean().optional().default(false),
  profile: learnerProfileSchema.optional()
});

export const tutorArtifactsSchema = z.object({
  diagram: z.string().min(1),
  videoScript: z.string().min(1),
  animationStoryboard: z.string().min(1)
});
export const homeworkResponseSchema = z.object({
  feature: homeworkRequestSchema.shape.feature,
  title: z.string(),
  answer: z.string(),
  sections: z.array(z.object({
    title: z.string(),
    items: z.array(z.string())
  })).optional(),
  artifacts: tutorArtifactsSchema.optional(),
  steps: z.preprocess((value) => {
    if (typeof value === "string") {
      return value.split(/\r?\n|[；;]/).map((item) => item.trim()).filter(Boolean);
    }
    return value;
  }, z.array(z.string()).optional().default([])),
  knowledge: z.array(z.string()).optional().default([]),
  similarPractice: z.array(questionSchema).optional().default([]),
  nextAction: z.unknown().optional().transform((value) => {
    if (typeof value === "string") return value;
    if (value == null) return "";
    if (typeof value === "object" && "detail" in value && typeof value.detail === "string") return value.detail;
    if (typeof value === "object" && "action" in value && typeof value.action === "string") return value.action;
    return JSON.stringify(value);
  })
});

export const homeworkTutorResponseSchema = homeworkResponseSchema.extend({ artifacts: tutorArtifactsSchema });



