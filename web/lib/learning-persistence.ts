import { canonicalizeKnowledge, classifyKnowledgeFromText, normalizeSubject } from "@/lib/knowledge-catalog";
import {
  getStoredLearningBehaviorWeight,
  getStoredResources,
  getStoredUserProfile,
  saveStoredLearningBehavior,
  saveStoredLearningRecord,
  saveStoredResources,
  saveStoredUserProfile,
  saveStoredWeakPoint
} from "@/lib/server-db";
import type { HomeworkRequest, HomeworkResponse, LearnerProfile } from "@/lib/types";
import { generateResourceBundle, resourceAgentSpecs } from "@/lib/multi-agent-orchestrator";

export const WEAK_POINT_THRESHOLD = 25;
const pendingBehaviorResources = new Set<string>();

function profileText(profile?: LearnerProfile) {
  if (!profile) return "";
  return [
    profile.major && `专业：${profile.major}`,
    profile.region && `地区：${profile.region}`,
    profile.grade && `年级：${profile.grade}`,
    profile.learningGoal && `目标：${profile.learningGoal}`,
    profile.knowledgeBase && `基础：${profile.knowledgeBase}`,
    profile.cognitiveStyle && `认知风格：${profile.cognitiveStyle}`,
    profile.errorPreference && `易错偏好：${profile.errorPreference}`,
    profile.learningPreference && `学习偏好：${profile.learningPreference}`,
    profile.historySummary && `学习历史：${profile.historySummary}`,
    profile.targetExam && `考试目标：${profile.targetExam}`
  ].filter(Boolean).join("；");
}

function updateHistorySummary(existing: string | undefined, subject: string, knowledge: string, source: string) {
  const entry = `${new Date().toLocaleDateString("zh-CN")}：${source}关注${subject}·${knowledge}`;
  return [entry, ...(existing || "").split(/\n+/).filter(Boolean).filter((item) => item !== entry)].slice(0, 12).join("\n");
}

async function updateBehaviorProfile(owner: string, inputProfile: LearnerProfile | undefined, subject: string, knowledge: string, source: string) {
  const stored = await getStoredUserProfile(owner);
  const profile = {
    ...(stored || {}),
    ...(inputProfile || {}),
    owner,
    historySummary: updateHistorySummary(stored?.historySummary || inputProfile?.historySummary, subject, knowledge, source),
    updatedAt: Date.now()
  } as Parameters<typeof saveStoredUserProfile>[0];
  await saveStoredUserProfile(profile);
  return profile;
}

export async function refreshBehaviorResources(input: {
  owner: string;
  subject: string;
  knowledge: string;
  profile?: LearnerProfile;
}) {
  const key = `${input.owner}|${input.subject}|${input.knowledge}`;
  if (pendingBehaviorResources.has(key)) return;
  pendingBehaviorResources.add(key);
  try {
    const stored = await getStoredResources(input.knowledge, input.profile, input.owner);
    const types = new Set(stored.map((resource) => resource.type));
    const specs = resourceAgentSpecs();
    if (specs.every((spec) => types.has(spec.type))) return;
    const generated = await generateResourceBundle({
      knowledge: input.knowledge,
      subject: input.subject,
      profile: input.profile,
      profileText: profileText(input.profile),
      request: { owner: input.owner, source: "learning_behavior" },
      signal: AbortSignal.timeout(60000)
    });
    await saveStoredResources(generated.resources, input.profile, input.owner);
  } finally {
    pendingBehaviorResources.delete(key);
  }
}

const BEHAVIOR_WEIGHTS: Record<string, number> = {
  video_click: 4,
  resource_click: 5,
  word_lookup: 7,
  photo_translate: 10,
  ai_answer: 14,
  oral_practice: 12,
  course_recommend: 8,
  document_scan: 9,
  recitation: 9,
  essay_correction: 18,
  homework_review: 20,
  mental_math_check: 18,
  photo_search: 34,
  mistake_analysis: 22,
  practice: 16,
  parent_report: 8,
  quiz_submit: 16
};

function behaviorWeight(source: string, correct?: boolean) {
  const base = BEHAVIOR_WEIGHTS[source] ?? 10;
  return correct === true ? Math.max(2, Math.round(base * 0.35)) : base;
}

function splitSubjectKnowledge(rawSubject: string, rawKnowledge: string, profile?: LearnerProfile) {
  const subject = normalizeSubject(rawSubject || "综合");
  const canonical = canonicalizeKnowledge(rawKnowledge, subject, profile?.grade)
    || classifyKnowledgeFromText(rawKnowledge, subject, profile?.grade)[0];
  if (canonical) return {
    subject: normalizeSubject(canonical.subject),
    knowledge: canonical.knowledge.replace(/\s+/g, " ").split(/[。！？.!?；;，,\n]/)[0].trim().slice(0, 80)
  };
  const compactKnowledge = rawKnowledge
    .replace(/\s+/g, " ")
    .split(/[。！？.!?；;，,\n]/)[0]
    .replace(new RegExp(`^\\s*${subject.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*[:：\\-—]*\\s*`), "")
    .trim()
    .slice(0, 80);
  return { subject, knowledge: compactKnowledge || rawKnowledge.trim().slice(0, 80) };
}

export async function persistLearningBehavior(input: {
  owner?: string;
  subject: string;
  knowledge: string;
  source: string;
  profile?: LearnerProfile;
  correct?: boolean;
}) {
  const owner = input.owner?.trim().toLowerCase() || "__anonymous__";
  const storedProfile = await getStoredUserProfile(owner);
  const effectiveProfile = input.profile || storedProfile || undefined;
  const parsed = splitSubjectKnowledge(input.subject, input.knowledge, effectiveProfile);
  if (!parsed.knowledge) return null;
  const profile = await updateBehaviorProfile(owner, effectiveProfile, parsed.subject, parsed.knowledge, input.source);
  await saveStoredLearningBehavior({
    owner,
    subject: parsed.subject,
    knowledge: parsed.knowledge,
    source: input.source,
    weight: behaviorWeight(input.source, input.correct),
    correct: input.correct
  });
  const weight = await getStoredLearningBehaviorWeight({ owner, subject: parsed.subject, knowledge: parsed.knowledge });
  await saveStoredWeakPoint({
    owner,
    subject: parsed.subject,
    knowledge: parsed.knowledge,
    weight: Math.max(1, Math.min(100, weight)),
    source: input.source
  });
  return { ...parsed, weight, promoted: weight >= WEAK_POINT_THRESHOLD, needsRefresh: true, profile };
}
export async function persistHomeworkOutcome(request: HomeworkRequest, response: HomeworkResponse) {
  const owner = request.owner?.trim().toLowerCase() || "__anonymous__";
  await saveStoredLearningRecord({ owner, request, response });
  const correct = !["photo_search", "homework_review", "essay_correction", "mental_math_check"].includes(request.feature);
  await Promise.all((response.knowledge || []).slice(0, 3).map((knowledge) => persistLearningBehavior({
    owner,
    subject: request.subject,
    knowledge,
    source: request.feature,
    profile: request.profile,
    correct
  })));
}
