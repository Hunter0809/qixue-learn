"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Check, Trash2 } from "lucide-react";
import type { PlanResponse } from "@/lib/types";
import { getLearnerProfile, loadCurrentUsername } from "@/lib/profile-storage";
import { emitServiceWarning } from "@/lib/client-warning";
import { deleteReviewPlanDay, getCachedReviewPlan, isReviewPlanDayCompleted, preGenerateReviewPlans, setReviewPlanDayCompleted } from "@/lib/review-plan-cache";
import { PersonalizedGate } from "@/components/personalized-gate";

type WeakPointLike = { id: string; subject: string; knowledge: string; weight: number };
type PlanEntry = { subject: string; plan: PlanResponse };

function loadPlans(points: WeakPointLike[]): PlanEntry[] {
  const subjects = Array.from(new Set(points.map((point) => point.subject)));
  return subjects.flatMap((subject) => {
    const subjectPoints = points.filter((point) => point.subject === subject);
    const plan = getCachedReviewPlan(subject, subjectPoints);
    return plan ? [{ subject, plan }] : [];
  });
}

export default function ReviewPlanPage() {
  const [plans, setPlans] = useState<PlanEntry[]>([]);
  const [weakPoints, setWeakPoints] = useState<WeakPointLike[]>([]);
  const [loading, setLoading] = useState(true);
  const owner = loadCurrentUsername() || "__anonymous__";

  async function loadPersistedPlans() {
    const response = await fetch(`/api/report?range=week&owner=${encodeURIComponent(owner)}`);
    if (!response.ok) throw new Error(`复习计划读取失败（${response.status}）`);
    const report = await response.json() as { plans?: PlanEntry[] };
    return report.plans || [];
  }
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const response = await fetch(`/api/weak-points?owner=${encodeURIComponent(owner)}`);
        if (!response.ok) throw new Error(`薄弱点加载失败（${response.status}）`);
        const points = await response.json() as WeakPointLike[];
        if (cancelled) return;
        setWeakPoints(points);
        const cachedPlans = loadPlans(points);
        setPlans(cachedPlans);
        if (points.length) await preGenerateReviewPlans(points);
        const persistedPlans = await loadPersistedPlans();
        if (!cancelled) setPlans(persistedPlans.length ? persistedPlans : loadPlans(points));
      } catch (error) {
        if (!cancelled) emitServiceWarning(error instanceof Error ? error.message : "请求链路异常：薄弱点服务无法连接。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    function onPlanState() { void refresh(); }
    window.addEventListener("qixue:review-plan-ready", onPlanState);
    window.addEventListener("qixue:review-plan-generating", onPlanState);
    void refresh();
    return () => {
      cancelled = true;
      window.removeEventListener("qixue:review-plan-ready", onPlanState);
      window.removeEventListener("qixue:review-plan-generating", onPlanState);
    };
  }, [owner]);

  async function toggleDayCompleted(subject: string, day: PlanResponse["days"][number]) {
    const nextCompleted = !isReviewPlanDayCompleted(subject, day.day);
    setReviewPlanDayCompleted(subject, day.day, nextCompleted);
    if (!nextCompleted) return;
    await Promise.all(day.knowledge.map(async (knowledge) => {
      const response = await fetch("/api/behavior", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, subject, knowledge, source: "review_plan_view", correct: true, profile: getLearnerProfile() })
      });
      if (!response.ok) emitServiceWarning("请求链路异常：复习完成记录没有保存，请稍后重试。");
    }));
  }

  return (
    <PersonalizedGate>
      <section className="section io-stack clean-top">
        <div className="card review-plan-module-head">
          <span className="pill"><CalendarDays size={14} /> 自动复习计划</span>
          <h1 className="page-title">复习计划</h1>
          <p className="page-kicker">根据后端记录的薄弱知识点自动生成 7 天详细复习路径，包含每日目标、时间、知识点和资源建议。</p>
          <span className="pill">当前薄弱点 {weakPoints.length} 个</span>
        </div>
        {loading ? <article className="card"><p className="muted">正在读取薄弱点并生成计划…</p></article> : null}
        {!loading && plans.length ? plans.map(({ subject, plan }) => (
          <article className="card review-plan-detail" key={subject}>
            <div className="panel-heading"><div><span className="pill">{subject}</span><h2 className="card-title">{plan.summary}</h2></div></div>
            <div className="review-plan-days-detail">
              {plan.days.map((day) => (
                <section className={`result-card filled${isReviewPlanDayCompleted(subject, day.day) ? " review-plan-day-done" : ""}`} key={`${subject}_${day.day}`}>
                  <div className="result-card-head"><h4>第 {day.day} 天：{day.title}</h4></div>
                  <div className="result-card-body">
                    <div className="review-plan-day-actions">
                      <button className="button secondary small" onClick={() => void toggleDayCompleted(subject, day)} type="button"><Check size={14} /> {isReviewPlanDayCompleted(subject, day.day) ? "取消完成" : "标记完成"}</button>
                      <button className="button secondary small" onClick={() => { deleteReviewPlanDay(subject, day.day); setPlans(loadPlans(weakPoints)); }} type="button"><Trash2 size={14} /> 删除</button>
                    </div>
                    <div className="subject-row"><span className="pill">{day.minutes} 分钟</span><span className="pill">优先级 {day.priority}</span></div>
                    <div><strong>复习知识点</strong><p>{day.knowledge.join("、")}</p></div>
                    <div><strong>推荐资源</strong><p>{day.resources.length ? day.resources.join("、") : "资源生成中"}</p></div>
                  </div>
                </section>
              ))}
            </div>
          </article>
        )) : null}
        {!loading && !plans.length ? <article className="card"><h2 className="card-title">暂无复习计划</h2><p className="muted">产生达到阈值的薄弱知识点后，系统会通过 AI 生成详细复习计划。</p></article> : null}
      </section>
    </PersonalizedGate>
  );
}
