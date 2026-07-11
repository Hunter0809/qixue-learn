"use client";

import { create } from "zustand";
import type { HomeworkFeature, HomeworkRequest, HomeworkResponse, PlanResponse, ProfileResponse, QuizSubmitResponse, ResourceRequest } from "@/lib/types";
import { canonicalizeKnowledge, classifyKnowledgeFromText, normalizeSubject } from "@/lib/knowledge-catalog";
import { getLearnerProfile, isGuestSession, loadCurrentUserProfile, loadCurrentUsername } from "@/lib/profile-storage";

type WorkspaceSnapshot = {
  content: string;
  subject: string;
  data?: HomeworkResponse;
  error?: string;
  isMutating: boolean;
  streamText?: string;
  imageUrl?: string;
  imagePreview?: string;
  startedAt?: number;
  pendingRequest?: HomeworkRequest;
};

type LearningState = {
  profile?: ProfileResponse;
  plan?: PlanResponse;
  quizResult?: QuizSubmitResponse;
  resourceFilter: ResourceRequest;
  workspaceStates: Partial<Record<HomeworkFeature, WorkspaceSnapshot>>;
  setProfile: (profile: ProfileResponse) => void;
  setPlan: (plan: PlanResponse) => void;
  setQuizResult: (result: QuizSubmitResponse) => void;
  setResourceFilter: (filter: ResourceRequest) => void;
  hydrateWorkspaceStates: () => void;
  setWorkspaceState: (feature: HomeworkFeature, state: Partial<WorkspaceSnapshot>) => void;
  getWorkspaceState: (feature: HomeworkFeature) => WorkspaceSnapshot;
};

const defaultWorkspace: WorkspaceSnapshot = {
  content: "",
  subject: "",
  isMutating: false
};

const WORKSPACE_STATES_KEY = "qixue_workspace_states";

function loadWorkspaceStates(): Partial<Record<HomeworkFeature, WorkspaceSnapshot>> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(WORKSPACE_STATES_KEY) || "{}") as Partial<Record<HomeworkFeature, WorkspaceSnapshot>>;
    return Object.fromEntries(
      Object.entries(parsed).map(([feature, snapshot]) => [
        feature,
        {
          ...snapshot,
          isMutating: false,
          startedAt: undefined
        }
      ])
    ) as Partial<Record<HomeworkFeature, WorkspaceSnapshot>>;
  } catch {
    return {};
  }
}

function saveWorkspaceStates(states: Partial<Record<HomeworkFeature, WorkspaceSnapshot>>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(WORKSPACE_STATES_KEY, JSON.stringify(states));
}

export const useLearningStore = create<LearningState>((set, get) => ({
  resourceFilter: {
    knowledge: "",
    type: "lecture",
    style: "plain"
  },
  workspaceStates: {},
  setProfile: (profile) => set({ profile }),
  setPlan: (plan) => set({ plan }),
  setQuizResult: (quizResult) => set({ quizResult }),
  setResourceFilter: (resourceFilter) => set({ resourceFilter }),
  hydrateWorkspaceStates: () => set({ workspaceStates: loadWorkspaceStates() }),
  setWorkspaceState: (feature, state) =>
    set((prev) => {
      const workspaceStates = {
        ...prev.workspaceStates,
        [feature]: { ...prev.workspaceStates[feature] || defaultWorkspace, ...state }
      };
      saveWorkspaceStates(workspaceStates);
      return { workspaceStates };
    }),
  getWorkspaceState: (feature) => get().workspaceStates[feature] || defaultWorkspace
}));

// ============================================================
// Feature → Weight Delta Mapping (每个功能模块的权重变化映射)
// ============================================================
// correctDelta: 答对时权重减少量（薄弱程度降低）
// incorrectDelta: 答错时权重增加量（薄弱程度增加）
// progressCorrect: 答对时进度增加量
// progressIncorrect: 答错/使用时进度增加量（学习行为本身即进度）
const FEATURE_SOURCE_DELTAS: Record<string, { correctDelta: number; incorrectDelta: number; progressCorrect: number; progressIncorrect: number }> = {
  photo_search:       { correctDelta: -10, incorrectDelta: 30,  progressCorrect: 8,  progressIncorrect: 5  },
  ai_answer:          { correctDelta: -15, incorrectDelta: 25,  progressCorrect: 10, progressIncorrect: 6  },
  homework_review:    { correctDelta: -20, incorrectDelta: 35,  progressCorrect: 12, progressIncorrect: 8  },
  essay_correction:   { correctDelta: -15, incorrectDelta: 25,  progressCorrect: 10, progressIncorrect: 6  },
  oral_practice:      { correctDelta: -10, incorrectDelta: 20,  progressCorrect: 8,  progressIncorrect: 5  },
  word_lookup:        { correctDelta: -8,  incorrectDelta: 15,  progressCorrect: 4,  progressIncorrect: 3  },
  photo_translate:    { correctDelta: -8,  incorrectDelta: 15,  progressCorrect: 5,  progressIncorrect: 3  },
  mental_math_check:  { correctDelta: -15, incorrectDelta: 30,  progressCorrect: 10, progressIncorrect: 6  },
  document_scan:      { correctDelta: -5,  incorrectDelta: 10,  progressCorrect: 5,  progressIncorrect: 3  },
  recitation:         { correctDelta: -10, incorrectDelta: 20,  progressCorrect: 8,  progressIncorrect: 4  },
  course_recommend:   { correctDelta: -5,  incorrectDelta: 15,  progressCorrect: 6,  progressIncorrect: 3  },
  parent_report:      { correctDelta: -5,  incorrectDelta: 10,  progressCorrect: 4,  progressIncorrect: 2  },
  practice:           { correctDelta: -20, incorrectDelta: 30,  progressCorrect: 15, progressIncorrect: 8  },
  video_click:        { correctDelta: -3,  incorrectDelta: 8,   progressCorrect: 3,  progressIncorrect: 2  },
  resource_click:     { correctDelta: -3,  incorrectDelta: 8,   progressCorrect: 4,  progressIncorrect: 2  },
  review_plan_view:   { correctDelta: -5,  incorrectDelta: 10,  progressCorrect: 6,  progressIncorrect: 3  },
  quiz:               { correctDelta: -18, incorrectDelta: 30,  progressCorrect: 12, progressIncorrect: 7  },
  mistake_analysis:   { correctDelta: -12, incorrectDelta: 25,  progressCorrect: 8,  progressIncorrect: 5  },
};

function getDeltas(source: string) {
  return FEATURE_SOURCE_DELTAS[source] || { correctDelta: -10, incorrectDelta: 20, progressCorrect: 5, progressIncorrect: 3 };
}

// Weak Points System
export type WeakPoint = {
  id: string;
  knowledge: string;
  subject: string;
  weight: number;
  masteryProgress: number;   // 学习进度 0-100，独立于weight（weight是薄弱程度）
  lastUpdated: number;
  history: { date: number; correct: boolean; source: string }[];
};


const WEAK_POINTS_KEY = "qixue_weak_points";
const WEAK_POINT_THRESHOLD = 25;

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function weakPointStorageKey(point: Pick<WeakPoint, "subject" | "knowledge">): string {
  return `${point.subject.trim()}\u0000${point.knowledge.trim()}`;
}

function createWeakPointId(subject: string, knowledge: string): string {
  return `wp_${stableHash(`${subject}\u0000${knowledge}`)}`;
}

function mergeWeakPoints(points: WeakPoint[]): WeakPoint[] {
  const merged = new Map<string, WeakPoint>();
  points.forEach((point) => {
    if (!point.subject.trim() || !point.knowledge.trim()) return;
    const key = weakPointStorageKey(point);
    const existing = merged.get(key);
    const normalizedPoint = {
      ...point,
      id: createWeakPointId(point.subject, point.knowledge),
      history: Array.isArray(point.history) ? point.history : []
    };
    if (!existing) {
      merged.set(key, normalizedPoint);
      return;
    }
    merged.set(key, {
      ...existing,
      weight: Math.max(existing.weight, normalizedPoint.weight),
      masteryProgress: Math.max(existing.masteryProgress || 0, normalizedPoint.masteryProgress || 0),
      lastUpdated: Math.max(existing.lastUpdated, normalizedPoint.lastUpdated),
      history: [...existing.history, ...normalizedPoint.history]
        .sort((a, b) => a.date - b.date)
        .slice(-50)
    });
  });
  return Array.from(merged.values());
}

function loadWeakPoints(): WeakPoint[] {
  if (typeof window === "undefined") return [];
  try {
    return mergeWeakPoints(JSON.parse(localStorage.getItem(WEAK_POINTS_KEY) || "[]") as WeakPoint[]);
  } catch { return []; }
}

function saveWeakPoints(points: WeakPoint[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(WEAK_POINTS_KEY, JSON.stringify(mergeWeakPoints(points)));
}

function normalizeKnowledgeItems(value: string): string[] {
  const sentencePunctuation = /[。！？!?]/;
  return value
    .split(/[,，、;；\n]/)
    .map((item) => item.replace(/^[-*•\d.、\s]+/, "").trim())
    .filter((item) => item.length > 0)
    .filter((item) => !sentencePunctuation.test(item))
    .filter((item) => isSpecificKnowledgePoint(item));
}

function splitSubjectAndKnowledge(subject: string, knowledge: string): { subject: string; knowledge: string } {
  const subjects = ["数学", "语文", "英语", "物理", "化学", "生物", "历史", "地理", "政治", "科学", "综合"];
  const blockedSubjects = new Set(["lecture", "exercise", "diagram", "analogy", "resource_click"]);
  const fallbackSubject = blockedSubjects.has(subject) ? "综合" : subject;
  for (const candidate of subjects) {
    const patterns = [
      `${candidate} `,
      `${candidate}:`,
      `${candidate}：`,
      `${candidate}-`,
      `${candidate}—`
    ];
    const matched = patterns.find((prefix) => knowledge.startsWith(prefix));
    if (matched) {
      const nextKnowledge = knowledge.slice(matched.length).trim();
      if (nextKnowledge) return { subject: candidate, knowledge: nextKnowledge };
    }
  }
  return { subject: fallbackSubject, knowledge };
}

function isSpecificKnowledgePoint(item: string): boolean {
  if (item.length < 2 || item.length > 30) return false;
  const genericItems = new Set([
    "数学", "语文", "英语", "物理", "化学", "生物", "历史", "地理", "政治", "科学", "综合",
    "力学", "电学", "光学", "热学", "化学", "语法", "阅读", "写作", "函数", "几何", "代数"
  ]);
  if (genericItems.has(item)) return false;
  return /[\u4e00-\u9fa5A-Za-z0-9]/.test(item);
}

function compactKnowledgeTerm(item: string): string {
  const cleaned = item
    .replace(/^(关于|掌握|理解|熟悉|复习|练习|学习)/, "")
    .replace(/(相关知识点|知识点|概念|应用|方法|问题)$/g, "")
    .trim();
  const match = cleaned.match(/[\u4e00-\u9fa5A-Za-z0-9]+/g);
  if (!match?.length) return cleaned;
  const joined = match.join("");
  return joined.length <= 12 ? joined : joined.slice(0, 12);
}

export function getWeakPoints(): WeakPoint[] {
  return loadWeakPoints().filter((point) => point.weight >= WEAK_POINT_THRESHOLD).sort((a, b) => b.weight - a.weight);
}

export function deleteWeakPoint(point: Pick<WeakPoint, "subject" | "knowledge">) {
  const next = loadWeakPoints().filter((item) => weakPointStorageKey(item) !== weakPointStorageKey(point));
  saveWeakPoints(next);
  if (typeof window !== "undefined") {
    void fetch("/api/weak-points", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", owner: loadCurrentUsername() || "__anonymous__", subject: point.subject, knowledge: point.knowledge })
    }).catch(() => undefined);
    window.dispatchEvent(new CustomEvent("qixue:weak-point-updated", { detail: { deleted: true, subject: point.subject, knowledge: point.knowledge } }));
  }
}

export function addWeakPoint(knowledge: string, subject: string, source: string, correct: boolean) {
  if (typeof window !== "undefined" && (isGuestSession() || !loadCurrentUserProfile())) return;
  const normalizedItems = normalizeKnowledgeItems(knowledge);
  if (normalizedItems.length > 1) {
    normalizedItems.forEach((item) => addWeakPoint(item, subject, source, correct));
    return;
  }
  const parsed = normalizedItems.map((item) => splitSubjectAndKnowledge(subject, item))[0];
  if (!parsed?.knowledge) return;
  const grade = getLearnerProfile()?.grade;
  const catalogPoint =
    canonicalizeKnowledge(parsed.knowledge, parsed.subject, grade) ||
    classifyKnowledgeFromText(parsed.knowledge, parsed.subject, grade)[0];

  const normalizedSubject = normalizeSubject(catalogPoint?.subject || parsed.subject);
  const normalizedKnowledge = catalogPoint?.knowledge || parsed.knowledge;
  if (!normalizedSubject || !isSpecificKnowledgePoint(normalizedKnowledge)) return;

  const points = loadWeakPoints();
  const existing = points.find((p) => p.knowledge === normalizedKnowledge && p.subject === normalizedSubject);
  const now = Date.now();
  const DAY = 86400000;
  const deltas = getDeltas(source);

  if (existing) {
    const weightDelta = correct ? deltas.correctDelta : deltas.incorrectDelta;

    // 相同的来源连续使用时，权重衰减增量（避免刷题暴涨）
    const recentSameSource = existing.history.filter(
      (h) => (now - h.date) < DAY && h.source === source
    ).length;
    const penalty = recentSameSource > 0 ? 3 * Math.min(recentSameSource, 3) : 0;
    const adjustedDelta = Math.min(0, weightDelta + penalty);

    existing.weight = Math.max(1, Math.min(100, existing.weight + adjustedDelta));

    // 短期密集强化：如果同一天内多次训练，适度降低权重（薄弱程度加速降低）
    if (correct && adjustedDelta < 0 && recentSameSource > 0) {
      existing.weight = Math.max(1, existing.weight - 5);
    }

    // 更新掌握进度（独立于薄弱程度）
    const progressDelta = correct ? deltas.progressCorrect : deltas.progressIncorrect;
    existing.masteryProgress = Math.min(100, (existing.masteryProgress || 0) + progressDelta);

    existing.lastUpdated = now;
    existing.history.push({ date: now, correct, source });
    if (existing.history.length > 50) existing.history = existing.history.slice(-50);
  } else {
    points.push({
      id: createWeakPointId(normalizedSubject, normalizedKnowledge),
      knowledge: normalizedKnowledge,
      subject: normalizedSubject,
      weight: correct ? deltas.correctDelta * -1 + 5 : Math.min(70, Math.abs(deltas.incorrectDelta) + 10),
      masteryProgress: correct ? deltas.progressCorrect : deltas.progressIncorrect,
      lastUpdated: now,
      history: [{ date: now, correct, source }]
    });
  }
  const activePoints = points.filter((point) => point.weight > 0 || point.masteryProgress > 0);
  saveWeakPoints(activePoints);
  if (typeof window !== "undefined") {
    const persisted = activePoints.find((point) => point.subject === normalizedSubject && point.knowledge === normalizedKnowledge);
    if (persisted) {
      void fetch("/api/weak-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert",
          owner: loadCurrentUsername() || "__anonymous__",
          subject: persisted.subject,
          knowledge: persisted.knowledge,
          weight: persisted.weight,
          source
        })
      }).catch(() => undefined);
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("qixue:weak-point-updated", { detail: { knowledge: normalizedKnowledge, subject: normalizedSubject, source, correct } }));
  }
  if (typeof window !== "undefined" && !correct && activePoints.some((point) => point.subject === normalizedSubject && point.knowledge === normalizedKnowledge && point.weight >= WEAK_POINT_THRESHOLD)) {
    void import("@/lib/resource-cache").then((module) => module.preGenerateResources(normalizedKnowledge, normalizedSubject));
    void import("@/lib/review-plan-cache").then((module) => module.preGenerateReviewPlanForSubject(
      normalizedSubject,
      activePoints.filter((point) => point.subject === normalizedSubject)
    ));
  }
}


/** 获取掌握进度（百分比） */
export function getWeakPointProgress(wp: WeakPoint): number {
  return Math.min(100, Math.max(0, wp.masteryProgress || 0));
}

/** 获取掌握等级文本 */
export function getMasteryLevel(wp: WeakPoint): string {
  const progress = getWeakPointProgress(wp);
  if (progress >= 90) return "精通";
  if (progress >= 70) return "良好";
  if (progress >= 40) return "一般";
  if (progress >= 20) return "初步";
  return "未开始";
}

export function getWeightExplanation(wp: WeakPoint): string {
  const parts: string[] = [];
  const now = Date.now();
  const DAY = 86400000;
  const daysSince = (now - wp.lastUpdated) / DAY;

  if (wp.weight >= 80) parts.push("非常薄弱");
  else if (wp.weight >= 50) parts.push("较薄弱");
  else if (wp.weight >= 20) parts.push("一般掌握");
  else parts.push("掌握较好");

  // 显示学习进度信息
  const progress = getWeakPointProgress(wp);
  const level = getMasteryLevel(wp);
  if (progress > 0) {
    parts.push(`学习进度 ${Math.round(progress)}% (${level})`);
  }

  const recentCorrect = wp.history.filter((h) => (now - h.date) < 7 * DAY && h.correct).length;
  const recentTotal = wp.history.filter((h) => (now - h.date) < 7 * DAY).length;
  if (recentTotal > 0) {
    parts.push(`近7天正确率: ${Math.round(recentCorrect / recentTotal * 100)}%`);
  }

  if (daysSince < 1) parts.push("近期活跃");
  else if (daysSince > 7) parts.push(`${Math.round(daysSince)}天未练习`);

  return parts.join(" · ");
}

/** 获取所有薄弱点的总学习进度统计数据 */
export function getWeakPointStats() {
  const points = getWeakPoints();
  if (!points.length) return { total: 0, avgProgress: 0, avgWeakness: 0, mastered: 0, inProgress: 0 };
  const avgProgress = points.reduce((sum, p) => sum + getWeakPointProgress(p), 0) / points.length;
  const avgWeakness = points.reduce((sum, p) => sum + p.weight, 0) / points.length;
  const mastered = points.filter((p) => getWeakPointProgress(p) >= 70).length;
  const inProgress = points.filter((p) => getWeakPointProgress(p) > 0 && getWeakPointProgress(p) < 70).length;
  return { total: points.length, avgProgress, avgWeakness, mastered, inProgress };
}


export function decayWeakPoints() {
  const points = loadWeakPoints();
  const now = Date.now();
  const DAY = 86400000;
  for (const p of points) {
    const daysSince = (now - p.lastUpdated) / DAY;
    if (daysSince > 1) {
      p.weight = Math.max(0, p.weight - Math.min(10, daysSince * 0.5));
    }
  }
  saveWeakPoints(points.filter((point) => point.weight > 0));
}

