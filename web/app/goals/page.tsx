"use client";

import { FormEvent, useState } from "react";
import useSWRMutation from "swr/mutation";
import { Save, SlidersHorizontal } from "lucide-react";
import { postJson } from "@/lib/fetcher";
import { loadCurrentUsername } from "@/lib/profile-storage";
import { useLearningStore } from "@/lib/store";
import type { PlanRequest, PlanResponse } from "@/lib/types";
import { ErrorBlock } from "@/components/status";

const styles: { value: PlanRequest["style"]; label: string }[] = [
  { value: "examples", label: "例题型" },
  { value: "visual", label: "图解型" },
  { value: "practice", label: "实践型" }
];

export default function GoalsPage() {
  const setPlan = useLearningStore((state) => state.setPlan);
  const storedPlan = useLearningStore((state) => state.plan);
  const [form, setForm] = useState<PlanRequest>({
    subject: "数学",
    goal: "",
    dailyMinutes: 45,
    style: "examples"
  });
  const { trigger, data, error, isMutating } = useSWRMutation(
    "/api/plan",
    (_url: string, { arg }: { arg: PlanRequest }) => postJson<PlanResponse, PlanRequest>("/api/plan", arg),
    { onSuccess: setPlan }
  );
  const plan = data || storedPlan;
  const valid = form.subject.trim() && form.goal.trim().length >= 6;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (valid) void trigger({ ...form, owner: loadCurrentUsername() || undefined });
  }

  return (
    <>
      <header className="page-hero">
        <div>
          <span className="eyebrow">Planner Agent</span>
        <h1 className="page-title">学习目标设置</h1>
        <p className="page-kicker">把目标、时间和偏好交给 Planner Agent，生成可调整的每日路径。</p>
        </div>
      </header>

      <section className="section io-stack">
        <form className="card" onSubmit={submit}>
          <h2 className="card-title">目标输入</h2>
          <div className="field">
            <label htmlFor="subject">学科</label>
            <input id="subject" className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="goal">学习目标</label>
            <textarea id="goal" className="textarea" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} placeholder="例如：两周内掌握函数单调性与导数应用" />
          </div>
          <div className="field">
            <label htmlFor="dailyMinutes">每日可学习时间：{form.dailyMinutes} 分钟</label>
            <input id="dailyMinutes" className="input" type="range" min={15} max={180} step={5} value={form.dailyMinutes} onChange={(e) => setForm({ ...form, dailyMinutes: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>偏好学习风格</label>
            <div className="segmented">
              {styles.map((item) => (
                <button
                  className={form.style === item.value ? "segment active" : "segment"}
                  key={item.value}
                  onClick={() => setForm({ ...form, style: item.value })}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <button className="button" disabled={!valid || isMutating} type="submit">
            <Save size={16} />
            {isMutating ? "生成中" : "生成学习路径"}
          </button>
        </form>

        <div>
          {error ? <ErrorBlock error={error} /> : null}
          <div className="card">
            <h2 className="card-title">每日学习计划</h2>
            {!plan ? (
              <div className="result-sections">
                <section className="result-card">
                  <div className="result-card-head"><h4>计划摘要</h4></div>
                  <div className="result-card-body"><p className="muted">{isMutating ? "AI 正在生成学习路径，会在这里展示摘要。" : "提交目标后，学习路径摘要会显示在这里。"}</p></div>
                </section>
                <section className="result-card">
                  <div className="result-card-head"><h4>每日安排</h4></div>
                  <div className="result-card-body"><p className="muted">每天的主题、时间、优先级、知识点和资源会按卡片展示。</p></div>
                </section>
              </div>
            ) : (
              <div className="list">
                <p>{plan.summary}</p>
                {plan.days.map((day) => (
                  <details className="plan-day" key={day.day} open={day.day === 1}>
                    <summary>
                      <span>第 {day.day} 天：{day.title}</span>
                      <span className="pill"><SlidersHorizontal size={13} /> {day.minutes} 分钟</span>
                    </summary>
                    <div className="plan-body">
                      <label>学习量</label>
                      <input className="input" type="number" min={15} defaultValue={day.minutes} />
                      <label>优先级</label>
                      <input className="input" type="number" min={1} max={5} defaultValue={day.priority} />
                      <p className="muted">知识点：{day.knowledge.join("、")}</p>
                      <p className="muted">资源：{day.resources.join("、")}</p>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
