import { canonicalizeKnowledge, classifyKnowledgeFromText, normalizeSubject } from "@/lib/knowledge-catalog";
import {
  getStoredResources,
  getStoredLearningBehaviorWeight,
  saveStoredLearningBehavior,
  saveStoredLearningRecord,
  saveStoredResources,
  saveStoredReviewPlan,
  saveStoredWeakPoint
} from "@/lib/server-db";
import type { HomeworkRequest, HomeworkResponse, LearnerProfile, PlanResponse, Resource } from "@/lib/types";

export const WEAK_POINT_THRESHOLD = 25;

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
  parent_report: 8
};

function behaviorWeight(source: string, correct?: boolean) {
  const base = BEHAVIOR_WEIGHTS[source] ?? 10;
  return correct === true ? Math.max(2, Math.round(base * 0.35)) : base;
}

function ownerFromRequest(request: { owner?: string }) {
  return request.owner?.trim().toLowerCase() || "__anonymous__";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    .replace(new RegExp(`^\\s*${escapeRegExp(subject)}\\s*[:：\\-—]*\\s*`), "")
    .trim()
    .slice(0, 80);
  return {
    subject,
    knowledge: compactKnowledge || rawKnowledge.trim().slice(0, 80)
  };
}

function resourceCountForWeight(weight: number) {
  if (weight >= 80) return 6;
  if (weight >= 55) return 4;
  if (weight >= WEAK_POINT_THRESHOLD) return 2;
  return 1;
}

function makeCoreResource(subject: string, knowledge: string, weight: number): Resource {
  const id = `core_${subject}_${knowledge}`.replace(/\s+/g, "_");
  return {
    id,
    title: `${knowledge} 核心概念解释`,
    type: "lecture",
    subject,
    knowledge: `${subject} ${knowledge}`,
    difficulty: weight >= 55 ? "medium" : "easy",
    summary: `围绕 ${knowledge} 的概念、适用条件和常见易错点建立基础理解。`,
    content: [
      `## 知识点\n${subject} ${knowledge}`,
      `## 核心解释\n先确认 ${knowledge} 的定义、基本形式和使用边界，再用一道基础例题验证理解。`,
      `## 相关课程\n搜索关键词：${subject} ${knowledge} 概念讲解；${subject} ${knowledge} 例题；${subject} ${knowledge} 易错点。`,
      `## 例题（含答案）\n围绕 ${knowledge} 写出一个基础例题，先列条件，再写关键步骤，最后核对答案。`,
      `## 练习题\n1. 复述 ${knowledge} 的定义。\n2. 找一道 ${knowledge} 的基础题并标出关键条件。`
    ].join("\n\n")
  };
}

function extraResources(subject: string, knowledge: string, weight: number): Resource[] {
  const specs: Array<Pick<Resource, "type" | "title" | "summary" | "difficulty">> = [
    { type: "exercise", title: `${knowledge} 分层练习`, summary: "用基础题、变式题和综合题逐级巩固。", difficulty: "medium" },
    { type: "diagram", title: `${knowledge} 结构图解`, summary: "把概念、公式、条件和易错点整理成结构化图谱。", difficulty: "medium" },
    { type: "analogy", title: `${knowledge} 类比理解`, summary: "通过类比场景降低理解门槛。", difficulty: "easy" },
    { type: "exercise", title: `${knowledge} 高频错题训练`, summary: "集中处理最容易失分的题型。", difficulty: weight >= 80 ? "hard" : "medium" },
    { type: "lecture", title: `${knowledge} 考点串讲`, summary: "把定义、方法和考试问法串联起来。", difficulty: weight >= 80 ? "hard" : "medium" }
  ];
  return specs.map((spec, index) => ({
    id: `${spec.type}_${index}_${subject}_${knowledge}`.replace(/\s+/g, "_"),
    type: spec.type,
    title: spec.title,
    subject,
    knowledge: `${subject} ${knowledge}`,
    difficulty: spec.difficulty,
    summary: spec.summary,
    content: [
      `## 知识点\n${subject} ${knowledge}`,
      `## 核心解释\n${spec.summary}`,
      `## 相关课程\n搜索关键词：${subject} ${knowledge} ${spec.title}`,
      `## 例题（含答案）\n选取一道和 ${knowledge} 直接相关的题，写出条件、步骤和结论。`,
      `## 练习题\n1. ${knowledge} 基础练习。\n2. ${knowledge} 变式练习。`
    ].join("\n\n")
  }));
}

function fallbackPlan(subject: string, knowledgeList: string[], owner: string): PlanResponse {
  const items = knowledgeList.length ? knowledgeList : [subject];
  return {
    planId: `auto_${owner}_${subject}_${Date.now()}`,
    summary: `围绕 ${subject} 的薄弱知识点安排 7 天复习，先补概念，再做变式训练。`,
    days: Array.from({ length: 7 }, (_, index) => {
      const knowledge = items[index % items.length];
      return {
        day: index + 1,
        title: `${knowledge} 复习`,
        minutes: 35,
        priority: Math.max(1, 5 - Math.floor(index / 2)),
        knowledge: [knowledge],
        resources: [`${knowledge} 核心概念解释`, `${knowledge} 分层练习`]
      };
    })
  };
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
  const parsed = splitSubjectKnowledge(input.subject, input.knowledge, input.profile);
  if (!parsed.knowledge) return null;
  const eventWeight = behaviorWeight(input.source, input.correct);
  await saveStoredLearningBehavior({
    owner,
    subject: parsed.subject,
    knowledge: parsed.knowledge,
    source: input.source,
    weight: eventWeight
  });
  const weight = await getStoredLearningBehaviorWeight({ owner, subject: parsed.subject, knowledge: parsed.knowledge });
  if (weight < WEAK_POINT_THRESHOLD) return { ...parsed, weight, promoted: false };

  await saveStoredWeakPoint({
    owner,
    subject: parsed.subject,
    knowledge: parsed.knowledge,
    weight,
    source: input.source
  });

  const wanted = resourceCountForWeight(weight);
  const knowledgeKey = `${parsed.subject} ${parsed.knowledge}`;
  const existing = await getStoredResources(knowledgeKey, input.profile, owner);
  if (existing.length < wanted) {
    const generated = [
      makeCoreResource(parsed.subject, parsed.knowledge, weight),
      ...extraResources(parsed.subject, parsed.knowledge, weight)
    ].slice(0, wanted);
    await saveStoredResources(generated, input.profile, owner);
  }

  await saveStoredReviewPlan({
    owner,
    subject: parsed.subject,
    plan: fallbackPlan(parsed.subject, [parsed.knowledge], owner)
  });

  return { ...parsed, weight, promoted: true };
}

export async function persistHomeworkOutcome(request: HomeworkRequest, response: HomeworkResponse) {
  const owner = ownerFromRequest(request);
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
