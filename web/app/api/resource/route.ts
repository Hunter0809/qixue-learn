import { routeJson } from "@/lib/api-route";
import { resourceAgentTraceSchema, resourceRequestSchema, resourceResponseSchema } from "@/lib/schemas";
import { canonicalizeKnowledge } from "@/lib/knowledge-catalog";
import { getStoredResources, saveStoredResources } from "@/lib/server-db";
import { logModuleRequest } from "@/lib/server-logger";
import { generateResourceBundle, resourceAgentSpecs } from "@/lib/multi-agent-orchestrator";

const SUBJECTS = ["数学", "语文", "英语", "物理", "化学", "生物", "历史", "地理", "政治", "科学", "高等数学", "线性代数", "信息论与编码", "程序设计", "数据结构", "计算机类", "电子信息类"];

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

function cacheHitAgents() {
  return resourceAgentSpecs().map((spec) => resourceAgentTraceSchema.parse({
    agentId: spec.agentId, role: spec.role, artifactType: spec.type, status: "cache_hit"
  }));
}

export async function POST(request: Request) {
  return routeJson(async () => {
    const body = resourceRequestSchema.parse(await request.json());
    await logModuleRequest("resource", body);
    const catalogPoint = canonicalizeKnowledge(body.knowledge, "", body.profile?.grade);
    const subject = catalogPoint?.subject || subjectFromRequestKnowledge(body.knowledge) || "综合";
    const knowledge = catalogPoint ? `${catalogPoint.subject} ${catalogPoint.knowledge}` : body.knowledge.trim();
    const specs = resourceAgentSpecs();
    const stored = await getStoredResources(knowledge, body.profile, body.owner);
    const storedTypes = new Set(stored.map((resource) => resource.type));
    if (stored.length >= specs.length && specs.every((spec) => storedTypes.has(spec.type))) {
      return resourceResponseSchema.parse({ resources: stored, agents: cacheHitAgents() });
    }

    const timeoutMs = Number(process.env.RESOURCE_GENERATION_TIMEOUT_MS || 60000);
    const resourceSignal = AbortSignal.timeout(Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60000);
    const today = new Date();
    const profileText = [
      body.profile?.major ? `专业：${body.profile.major}` : "",
      body.profile?.region ? `地区：${body.profile.region}` : "",
      body.profile?.school ? `学校：${body.profile.school}` : "",
      body.profile?.grade ? `年级：${body.profile.grade}` : "",
      body.profile?.learningGoal ? `学习目标：${body.profile.learningGoal}` : "",
      body.profile?.knowledgeBase ? `知识基础：${body.profile.knowledgeBase}` : "",
      body.profile?.cognitiveStyle ? `认知风格：${body.profile.cognitiveStyle}` : "",
      body.profile?.learningPreference ? `学习偏好：${body.profile.learningPreference}` : "",
      body.profile?.difficulty ? `资源难度偏好：${body.profile.difficulty}` : "",
      `当前日期：${today.toISOString().slice(0, 10)}`,
      `学习时段：${semesterPhase(today)}`
    ].filter(Boolean).join("；");

    const generated = await generateResourceBundle({
      knowledge, subject, profile: body.profile, profileText, request: body, signal: resourceSignal
    });
    const response = resourceResponseSchema.parse(generated);
    await saveStoredResources(response.resources, body.profile, body.owner);
    return response;
  });
}
