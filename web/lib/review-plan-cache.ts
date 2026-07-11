"use client";

import type { PlanResponse } from "@/lib/types";
import { loadCurrentUsername } from "@/lib/profile-storage";
import { emitServiceWarning } from "@/lib/client-warning";

const PLAN_CACHE_KEY = "qixue_review_plan_cache";
const PLAN_GENERATING_KEY = "qixue_review_plan_generating";
const PLAN_FAILED_KEY = "qixue_review_plan_failed";
const PLAN_COMPLETED_KEY = "qixue_review_plan_completed_days";
const TTL_MS = 60 * 60 * 1000;
const FAILURE_COOLDOWN_MS = 10 * 60 * 1000;
const GENERATING_TTL_MS = 3 * 60 * 1000;

type WeakPointLike = {
  knowledge: string;
  subject: string;
  weight: number;
};

type PlanCacheEntry = {
  signature: string;
  plan: PlanResponse;
  timestamp: number;
};

type GeneratingEntry = {
  signature: string;
  startedAt: number;
};

type FailedEntry = {
  signature: string;
  failedAt: number;
};

function readCache(): Record<string, PlanCacheEntry> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(PLAN_CACHE_KEY) || "{}") as Record<string, PlanCacheEntry>;
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, PlanCacheEntry>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PLAN_CACHE_KEY, JSON.stringify(cache));
}

function dayKey(subject: string, day: number) {
  return `${subject}:${day}`;
}

function readCompletedDays(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(PLAN_COMPLETED_KEY) || "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

function writeCompletedDays(state: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PLAN_COMPLETED_KEY, JSON.stringify(state));
}

export function isReviewPlanDayCompleted(subject: string, day: number) {
  return Boolean(readCompletedDays()[dayKey(subject, day)]);
}

export function setReviewPlanDayCompleted(subject: string, day: number, completed: boolean) {
  const state = readCompletedDays();
  const key = dayKey(subject, day);
  if (completed) state[key] = true;
  else delete state[key];
  writeCompletedDays(state);
  notifyReviewPlanState(subject);
}

export function deleteReviewPlanDay(subject: string, day: number) {
  const cache = readCache();
  const entry = cache[subject];
  if (!entry) return;
  entry.plan = {
    ...entry.plan,
    days: entry.plan.days.filter((item) => item.day !== day)
  };
  entry.timestamp = Date.now();
  writeCache(cache);
  const completed = readCompletedDays();
  delete completed[dayKey(subject, day)];
  writeCompletedDays(completed);
  notifyReviewPlanState(subject, { plan: entry.plan });
}

export function getAllCachedReviewPlans(): Record<string, PlanCacheEntry> {
  const cache = readCache();
  const now = Date.now();
  let changed = false;
  Object.keys(cache).forEach((subject) => {
    if (now - cache[subject].timestamp > TTL_MS) {
      delete cache[subject];
      changed = true;
    }
  });
  if (changed) writeCache(cache);
  return cache;
}

function normalizeGeneratingState(state: Record<string, boolean | GeneratingEntry>) {
  const now = Date.now();
  let changed = false;
  const next: Record<string, GeneratingEntry> = {};
  Object.entries(state).forEach(([subject, entry]) => {
    const normalized = typeof entry === "boolean"
      ? { signature: "", startedAt: 0 }
      : entry;
    if (!normalized.startedAt || now - normalized.startedAt > GENERATING_TTL_MS) {
      changed = true;
      return;
    }
    next[subject] = normalized;
  });
  return { state: next, changed };
}

function readGenerating(): Record<string, GeneratingEntry> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(PLAN_GENERATING_KEY) || "{}") as Record<string, boolean | GeneratingEntry>;
    const normalized = normalizeGeneratingState(parsed);
    if (normalized.changed) writeGenerating(normalized.state);
    return normalized.state;
  } catch {
    return {};
  }
}

function writeGenerating(state: Record<string, GeneratingEntry>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PLAN_GENERATING_KEY, JSON.stringify(state));
}

function readFailed(): Record<string, FailedEntry> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(PLAN_FAILED_KEY) || "{}") as Record<string, number | FailedEntry>;
    const now = Date.now();
    const next: Record<string, FailedEntry> = {};
    let changed = false;
    Object.entries(parsed).forEach(([subject, entry]) => {
      if (typeof entry === "number") {
        changed = true;
        return;
      }
      if (!entry.signature || !entry.failedAt || now - entry.failedAt > FAILURE_COOLDOWN_MS) {
        changed = true;
        return;
      }
      next[subject] = entry;
    });
    if (changed) writeFailed(next);
    return next;
  } catch {
    return {};
  }
}

function writeFailed(state: Record<string, FailedEntry>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PLAN_FAILED_KEY, JSON.stringify(state));
}

function isCoolingDown(subject: string, signature: string) {
  const entry = readFailed()[subject];
  return Boolean(entry && entry.signature === signature && Date.now() - entry.failedAt < FAILURE_COOLDOWN_MS);
}

function markFailed(subject: string, signature: string) {
  const state = readFailed();
  state[subject] = { signature, failedAt: Date.now() };
  writeFailed(state);
}

function clearFailed(subject: string) {
  const state = readFailed();
  delete state[subject];
  writeFailed(state);
}

function notifyReviewPlanState(subject: string, detail: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("qixue:review-plan-ready", { detail: { subject, ...detail } }));
}

function signatureFor(points: WeakPointLike[]) {
  return points
    .slice()
    .sort((a, b) => a.knowledge.localeCompare(b.knowledge))
    .map((point) => `${point.knowledge}:${Math.round(point.weight)}`)
    .join("|");
}

export function getCachedReviewPlan(subject: string, points: WeakPointLike[]): PlanResponse | null {
  const cache = readCache();
  const entry = cache[subject];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > TTL_MS) {
    delete cache[subject];
    writeCache(cache);
    return null;
  }
  return entry.signature === signatureFor(points) ? entry.plan : null;
}

export function isGeneratingReviewPlan(subject: string, points?: WeakPointLike[]): boolean {
  const entry = readGenerating()[subject];
  if (!entry) return false;
  return points ? entry.signature === signatureFor(points.filter((point) => point.subject === subject && point.weight > 0)) : true;
}

export async function preGenerateReviewPlanForSubject(subject: string, points: WeakPointLike[]): Promise<void> {
  const subjectPoints = points.filter((point) => point.subject === subject && point.weight > 0);
  const signature = signatureFor(subjectPoints);
  if (!subjectPoints.length || getCachedReviewPlan(subject, subjectPoints) || isGeneratingReviewPlan(subject, subjectPoints) || isCoolingDown(subject, signature)) return;

  const generating = readGenerating();
  generating[subject] = { signature, startedAt: Date.now() };
  writeGenerating(generating);
  window.dispatchEvent(new CustomEvent("qixue:review-plan-generating", { detail: { subject } }));

  try {
    const resp = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner: loadCurrentUsername() || undefined,
        subject,
        goal: subjectPoints
          .slice(0, 10)
          .map((point) => `${point.subject} ${point.knowledge}(权重${Math.round(point.weight)})`)
          .join("；"),
        dailyMinutes: 60,
        style: "practice"
      })
    });
    if (!resp.ok) {
      emitServiceWarning("请求链路异常：复习计划服务没有返回有效结果，请稍后重试。");
      markFailed(subject, signature);
      notifyReviewPlanState(subject, { error: await resp.text() });
      return;
    }
    const plan = await resp.json() as PlanResponse;
    if (!plan.planId || !Array.isArray(plan.days)) {
      markFailed(subject, signature);
      notifyReviewPlanState(subject, { error: "invalid-plan" });
      return;
    }
    const cache = readCache();
    cache[subject] = { signature, plan, timestamp: Date.now() };
    writeCache(cache);
    clearFailed(subject);
    notifyReviewPlanState(subject, { plan });
  } catch (error) {
    emitServiceWarning("请求链路异常：复习计划服务无法连接，请检查网络或稍后重试。");
    markFailed(subject, signature);
    notifyReviewPlanState(subject, { error: error instanceof Error ? error.message : "request-failed" });
  } finally {
    const nextGenerating = readGenerating();
    delete nextGenerating[subject];
    writeGenerating(nextGenerating);
    notifyReviewPlanState(subject, { generating: false });
  }
}

export function preGenerateReviewPlans(points: WeakPointLike[]): void {
  const subjects = Array.from(new Set(points.filter((point) => point.weight > 0).map((point) => point.subject)));
  subjects.forEach((subject) => {
    void preGenerateReviewPlanForSubject(subject, points);
  });
}

