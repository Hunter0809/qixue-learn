"use client";

import { addWeakPoint } from "@/lib/store";
import { getLearnerProfile, loadCurrentUsername } from "@/lib/profile-storage";

type LearningBehavior = {
  knowledge: string;
  subject: string;
  source: string;
  correct?: boolean;
};

// 正向学习行为来源（应增加掌握进度）
const POSITIVE_SOURCES = new Set([
  "video_click",
  "resource_click",
  "review_plan_view",
  "practice",
  "recitation",
]);

export function trackLearningBehavior({ knowledge, subject, source, correct }: LearningBehavior) {
  const normalizedKnowledge = knowledge.trim();
  const blockedSubjects = new Set(["lecture", "exercise", "diagram", "analogy", "resource_click"]);
  const normalizedSubject = blockedSubjects.has(subject.trim()) ? "综合" : subject.trim() || "综合";
  if (!normalizedKnowledge) return;

  // 自动判断：正向学习行为视为 correct=true（增加掌握进度），错误/疑问视为 correct=false（增加薄弱程度）
  const isCorrect = correct !== undefined ? correct : POSITIVE_SOURCES.has(source);
  addWeakPoint(normalizedKnowledge, normalizedSubject, source, isCorrect);
  void fetch("/api/behavior", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner: loadCurrentUsername() || undefined,
      subject: normalizedSubject,
      knowledge: normalizedKnowledge,
      source,
      correct: isCorrect,
      profile: getLearnerProfile()
    })
  }).catch(() => undefined);
}
