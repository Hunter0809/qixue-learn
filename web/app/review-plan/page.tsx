"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Check, Trash2 } from "lucide-react";
import type { PlanResponse } from "@/lib/types";
import { getWeakPoints, addWeakPoint } from "@/lib/store";
import { deleteReviewPlanDay, getCachedReviewPlan, isReviewPlanDayCompleted, preGenerateReviewPlans, setReviewPlanDayCompleted } from "@/lib/review-plan-cache";
import { PersonalizedGate } from "@/components/personalized-gate";

type PlanEntry = {
  subject: string;
  plan: PlanResponse;
};

function loadPlans(): PlanEntry[] {
  const weakPoints = getWeakPoints();
  const subjects = Array.from(new Set(weakPoints.map((point) => point.subject)));
  return subjects.flatMap((subject) => {
    const subjectPoints = weakPoints.filter((point) => point.subject === subject);
    const plan = getCachedReviewPlan(subject, subjectPoints);
    return plan ? [{ subject, plan }] : [];
  });
}

export default function ReviewPlanPage() {
  const [plans, setPlans] = useState<PlanEntry[]>([]);
  const [weakCount, setWeakCount] = useState(0);

  useEffect(() => {
    function refresh() {
      setPlans(loadPlans());
      setWeakCount(getWeakPoints().length);
    }

    window.addEventListener("qixue:review-plan-ready", refresh);
    window.addEventListener("qixue:review-plan-generating", refresh);
    window.addEventListener("qixue:weak-point-updated", refresh);
    refresh();
    void preGenerateReviewPlans(getWeakPoints()).then(refresh);
    return () => {
      window.removeEventListener("qixue:review-plan-ready", refresh);
      window.removeEventListener("qixue:review-plan-generating", refresh);
      window.removeEventListener("qixue:weak-point-updated", refresh);
    };
  }, []);

  function toggleDayCompleted(subject: string, day: PlanResponse["days"][number]) {
    const nextCompleted = !isReviewPlanDayCompleted(subject, day.day);
    setReviewPlanDayCompleted(subject, day.day, nextCompleted);
    if (nextCompleted) {
      day.knowledge.forEach((knowledge) => {
        addWeakPoint(knowledge, subject, "review_plan_view", true);
      });
    }
  }

  return (
    <PersonalizedGate>
      <section className="section io-stack clean-top">
        <div className="card review-plan-module-head">
          <span className="pill"><CalendarDays size={14} /> 自动复习计划</span>
          <h1 className="page-title">复习计划</h1>
          <p className="page-kicker">根据薄弱知识点自动生成 7 天详细复习路径，包含每日目标、时间、知识点和资源建议。</p>
          <span className="pill">当前薄弱点 {weakCount} 个</span>
        </div>

        {plans.length ? (
          plans.map(({ subject, plan }) => (
            <article className="card review-plan-detail" key={subject}>
              <div className="panel-heading">
                <div>
                  <span className="pill">{subject}</span>
                  <h2 className="card-title">{plan.summary}</h2>
                </div>
              </div>
              <div className="review-plan-days-detail">
                {plan.days.map((day) => (
                  <section className={`result-card filled${isReviewPlanDayCompleted(subject, day.day) ? " review-plan-day-done" : ""}`} key={`${subject}_${day.day}`}>
                    <div className="result-card-head">
                      <h4>第 {day.day} 天：{day.title}</h4>
                    </div>
                    <div className="result-card-body">
                      <div className="review-plan-day-actions">
                        <button className="button secondary small" onClick={() => toggleDayCompleted(subject, day)} type="button">
                          <Check size={14} /> {isReviewPlanDayCompleted(subject, day.day) ? "取消完成" : "标记完成"}
                        </button>
                        <button className="button secondary small" onClick={() => { deleteReviewPlanDay(subject, day.day); setPlans(loadPlans()); }} type="button">
                          <Trash2 size={14} /> 删除
                        </button>
                      </div>
                      <div className="subject-row">
                        <span className="pill">{day.minutes} 分钟</span>
                        <span className="pill">优先级 {day.priority}</span>
                      </div>
                      <div>
                        <strong>复习知识点</strong>
                        <p>{day.knowledge.join("、")}</p>
                      </div>
                      <div>
                        <strong>推荐资源</strong>
                        <p>{day.resources.length ? day.resources.join("、") : "资源生成中"}</p>
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            </article>
          ))
        ) : (
          <article className="card">
            <h2 className="card-title">暂无复习计划</h2>
            <p className="muted">产生薄弱知识点后，系统会自动生成详细复习计划。</p>
          </article>
        )}
      </section>
    </PersonalizedGate>
  );
}
