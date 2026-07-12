import { canonicalizeKnowledge, classifyKnowledgeFromText, normalizeSubject } from "@/lib/knowledge-catalog";
import {
  getStoredLearningBehaviorWeight,
  saveStoredLearningBehavior,
  saveStoredLearningRecord,
  saveStoredWeakPoint
} from "@/lib/server-db";
import type { HomeworkRequest, HomeworkResponse, LearnerProfile } from "@/lib/types";

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
  const parsed = splitSubjectKnowledge(input.subject, input.knowledge, input.profile);
  if (!parsed.knowledge) return null;
  await saveStoredLearningBehavior({
    owner,
    subject: parsed.subject,
    knowledge: parsed.knowledge,
    source: input.source,
    weight: behaviorWeight(input.source, input.correct),
    correct: input.correct
  });
  const weight = await getStoredLearningBehaviorWeight({ owner, subject: parsed.subject, knowledge: parsed.knowledge });
  if (weight < WEAK_POINT_THRESHOLD) return { ...parsed, weight, promoted: false, needsRefresh: false };
  await saveStoredWeakPoint({ owner, subject: parsed.subject, knowledge: parsed.knowledge, weight, source: input.source });
  return { ...parsed, weight, promoted: true, needsRefresh: true };
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
