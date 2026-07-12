"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import type { PlanResponse, ReportResponse, WeakPoint as ReportWeakPoint } from "@/lib/types";
import { WeakHeatmap } from "@/components/weak-heatmap";
import { PersonalizedGate } from "@/components/personalized-gate";
import { buildReportFromActualData } from "@/lib/learning-analytics";
import { getActivityStats } from "@/lib/activity-tracker";
import { deleteWeakPoint, getWeakPoints, getWeakPointProgress, getMasteryLevel, type WeakPoint } from "@/lib/store";
import { type ConfirmAction } from "@/components/confirm-popup";
import { loadLearningHistory } from "@/lib/profile-storage";
import { getAllCachedReviewPlans, preGenerateReviewPlans } from "@/lib/review-plan-cache";

const AccuracyLineChart = dynamic(
  () => import("@/components/charts").then((module) => module.AccuracyLineChart),
  { ssr: false, loading: () => <div className="skeleton" /> }
);

function reportWeakPointsFromTracked(points: WeakPoint[]): (ReportWeakPoint & { progress?: number; level?: string })[] {
  return points.map((point) => ({
    id: point.id,
    name: `${point.subject} ${point.knowledge}`,
    mastery: Math.max(0, Math.min(100, 100 - Math.round(point.weight))),
    severity: Math.round(point.weight),
    progress: getWeakPointProgress(point),
    level: getMasteryLevel(point)
  }));
}


function cachedPlanList() {
  return Object.entries(getAllCachedReviewPlans()).map(([subject, entry]) => ({
    subject,
    plan: entry.plan
  }));
}

function emptyReport(range: "week" | "month"): ReportResponse {
  return {
    range,
    studyHours: 0,
    masteredKnowledge: 0,
    mistakeCount: 0,
    accuracyTrend: [],
    reviewPlan: [],
    weakPoints: []
  };
}

export default function ReportPage() {
  const [range, setRange] = useState<"week" | "month">("week");
  const [data, setData] = useState<ReportResponse>(() => emptyReport("week"));
  const [trackedHours, setTrackedHours] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [reportFilter, setReportFilter] = useState<string>("all");
  const [showWrongAnswers, setShowWrongAnswers] = useState(false);
  const [weakPointVersion, setWeakPointVersion] = useState(0);
  void weakPointVersion;
  const [storeWeakPoints, setStoreWeakPoints] = useState<WeakPoint[]>([]);
  const reportWeakPoints = reportWeakPointsFromTracked(storeWeakPoints);
  const [reviewPlans, setReviewPlans] = useState<{ subject: string; plan: PlanResponse }[]>([]);
  const [history, setHistory] = useState<ReturnType<typeof loadLearningHistory>>([]);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  void confirmAction;
  const knowledgeNames = [...new Set(history.flatMap((r: { response: { knowledge?: string[] } }) => r.response.knowledge || []))];
  const wrongRecords = history.filter((r: { feature: string }) => r.feature.includes("review") || r.feature.includes("correction") || r.feature === "mental_math_check");
  const filteredWeakPoints = reportFilter === "all"
    ? reportWeakPoints
    : reportFilter === "error_prone"
    ? reportWeakPoints.filter((wp) => { const swp = storeWeakPoints.find((s) => `${s.subject} ${s.knowledge}` === wp.name); return swp && swp.history.filter((h) => !h.correct).length > swp.history.filter((h) => h.correct).length; })
    : reportWeakPoints;

  function removeReportWeakPoint(point: ReportWeakPoint, event?: React.MouseEvent) {
    const matched = storeWeakPoints.find((item) => `${item.subject} ${item.knowledge}` === point.name || item.id === point.id);
    if (!matched) return;
    const x = event ? event.clientX : window.innerWidth / 2;
    const y = event ? event.clientY : window.innerHeight / 2;
    setConfirmAction({
      message: `删除薄弱点“${matched.subject} ${matched.knowledge}”？`,
      x,
      y,
      onConfirm: () => {
        deleteWeakPoint(matched);
        setWeakPointVersion((value) => value + 1);
        setConfirmAction(null);
      }
    });
  }

  useEffect(() => {
    setData(buildReportFromActualData(range));
    const activityStats = getActivityStats();
    setTrackedHours(Math.round(activityStats.totalMinutes / 60 * 10) / 10);
    setStoreWeakPoints(getWeakPoints());
    setHistory(loadLearningHistory());
    setReviewPlans(cachedPlanList());
  }, [range]);

  useEffect(() => {
    if (storeWeakPoints.length) preGenerateReviewPlans(storeWeakPoints);

    function reloadPlans() {
      setReviewPlans(cachedPlanList());
      setData(buildReportFromActualData(range));
    }

    reloadPlans();
    window.addEventListener("qixue:review-plan-ready", reloadPlans);
    window.addEventListener("qixue:review-plan-generating", reloadPlans);
    return () => {
      window.removeEventListener("qixue:review-plan-ready", reloadPlans);
      window.removeEventListener("qixue:review-plan-generating", reloadPlans);
    };
  }, [range, storeWeakPoints]);


  async function loadFontBase64(path: string) {
    const response = await fetch(path);
    if (!response.ok) throw new Error("PDF 字体加载失败");
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary);
  }

  async function exportPdf() {
    if (!data) return;
    setExporting(true);
    try {
      const [{ default: jsPDF }, fontBase64] = await Promise.all([
        import("jspdf"),
        loadFontBase64("/fonts/TsangerJinKai02-W04.ttf")
      ]);
      const pdf = new jsPDF("p", "mm", "a4");
      pdf.addFileToVFS("TsangerJinKai02-W04.ttf", fontBase64);
      pdf.addFont("TsangerJinKai02-W04.ttf", "TsangerJinKai", "normal");
      pdf.setFont("TsangerJinKai");
      pdf.setTextColor(24, 47, 69);
      pdf.setFillColor(247, 242, 233);
      pdf.rect(0, 0, 210, 297, "F");
      pdf.setFontSize(22);
      pdf.text("学习报告与复习计划", 18, 24);
      pdf.setFontSize(11);
      pdf.text(`范围：${range === "week" ? "本周" : "本月"}`, 18, 33);
      pdf.setDrawColor(31, 75, 110);
      pdf.line(18, 39, 192, 39);

      pdf.setFontSize(14);
      pdf.text(`学习时长：${trackedHours || data.studyHours} 小时`, 18, 52);
      pdf.text(`掌握知识点：${data.masteredKnowledge}`, 18, 62);
      pdf.text(`错题数量：${data.mistakeCount}`, 18, 72);

      pdf.setFontSize(16);
      pdf.text("正确率趋势", 18, 90);
      pdf.setFontSize(11);
      data.accuracyTrend.forEach((item, index) => {
        pdf.text(`${item.label}：${item.accuracy}%`, 22 + (index % 3) * 55, 102 + Math.floor(index / 3) * 9);
      });

      let y = 128;
      pdf.setFontSize(16);
      pdf.text("复习计划", 18, y);
      pdf.setFontSize(11);
      y += 10;
      const pdfPlans = reviewPlans.flatMap(({ subject, plan }) => plan.days.slice(0, 3).map((day) => ({ subject, day })));
      pdfPlans.forEach(({ subject, day }) => {
        const lines = pdf.splitTextToSize(`${subject} · 第${day.day}天 · ${day.title} · ${day.minutes} 分钟`, 170);
        pdf.text(lines, 22, y);
        y += lines.length * 6 + 4;
      });
      if (!pdfPlans.length) {
        pdf.text("暂无已生成复习计划，请先完成一次练习或等待自动生成。", 22, y);
        y += 8;
      }

      y += 4;
      pdf.setFontSize(16);
      pdf.text("薄弱知识点", 18, y);
      pdf.setFontSize(11);
      y += 10;
      reportWeakPoints.forEach((item) => {
        pdf.text(`${item.name}：掌握 ${item.mastery}% · 薄弱程度 ${item.severity}%`, 22, y);
        y += 8;
      });

      pdf.save(`learning-report-${range}.pdf`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <PersonalizedGate>
      <section className="section clean-top">
        <div className="row report-action-row">
          <div className="segmented report-tabs">
            <button className={range === "week" ? "segment active" : "segment"} onClick={() => setRange("week")} type="button">本周</button>
            <button className={range === "month" ? "segment active" : "segment"} onClick={() => setRange("month")} type="button">本月</button>
          </div>
          <button className="button" disabled={exporting} onClick={exportPdf} type="button">
            <Download size={16} /> {exporting ? "生成中" : "导出 PDF"}
          </button>
        </div>
        <div className="grid three">
          <div className="card metric-card"><span>学习时长</span><strong>{trackedHours || data.studyHours}h</strong></div>
          <div className="card metric-card" style={{ gridColumn: "span 1" }}>
            <span>掌握知识点</span>
            <strong>{data.masteredKnowledge}</strong>
            <div className="knowledge-names-list" style={{ marginTop: "var(--space-2)", maxHeight: "120px", overflow: "auto" }}>
              {knowledgeNames.slice(0, 12).map((kn) => <span className="pill" key={kn} style={{ margin: "2px" }}>{kn}</span>)}
              {knowledgeNames.length > 12 ? <span className="muted">+{knowledgeNames.length - 12}</span> : null}
            </div>
          </div>
          <div className="card metric-card" style={{ cursor: "pointer" }} onClick={() => setShowWrongAnswers(true)}>
            <span>错题数量</span>
            <strong>{data.mistakeCount}</strong>
            <span className="muted" style={{ fontSize: "0.75rem" }}>点击查看详情</span>
          </div>
        </div>
        <div className="section grid two">
          <div className="card">
            <h2 className="card-title">正确率趋势</h2>
            <AccuracyLineChart data={data.accuracyTrend} />
          </div>
          <div className="card">
            <h2 className="card-title">复习计划</h2>
            <div className="list">
              {reviewPlans.map(({ subject, plan }) => (
                <div className="review-item report-plan-item" key={subject}>
                  <strong>{subject} · {plan.summary}</strong>
                  <span className="muted">
                    {plan.days.slice(0, 3).map((day) => `第${day.day}天 ${day.title}（${day.minutes}分钟）`).join(" / ")}
                  </span>
                </div>
              ))}
              {reviewPlans.length === 0 ? <p className="muted">暂无已生成复习计划，系统会根据薄弱知识点自动生成。</p> : null}
            </div>
          </div>
        </div>
        <div className="section card" hidden>
          <div className="report-filter-bar">
            {([["all", "全部"], ["error_prone", "易错点"], ["weak", "薄弱点"], ["wrong_review", "错题回顾"]] as [string, string][]).map(([key, label]) => (
              <button key={key} className={`report-filter-btn${reportFilter === key ? " active" : ""}`} onClick={() => setReportFilter(key)} type="button">{label}</button>
            ))}
          </div>
          <h2 className="card-title">薄弱知识点</h2>
          <WeakHeatmap points={reportFilter === "wrong_review" ? [] : filteredWeakPoints} onDelete={removeReportWeakPoint} />
          {reportFilter === "wrong_review" ? (
            <div className="list" style={{ marginTop: "var(--space-3)" }}>
              {wrongRecords.map((wr: { id: string; title: string; subject: string; feature: string }) => (
                <div className="review-item" key={wr.id}>
                  <strong>{wr.title}</strong>
                  <span className="muted">{wr.subject} · {wr.feature}</span>
                </div>
              ))}
              {wrongRecords.length === 0 ? <p className="muted">暂无错题记录</p> : null}
            </div>
          ) : null}
        </div>
        <div style={{ marginTop: "var(--space-4)" }}>
          <button className="button export-btn" type="button" onClick={() => {
            const summary = {
              range: data.range,
              studyHours: data.studyHours,
              masteredKnowledge: data.masteredKnowledge,
              mistakeCount: data.mistakeCount,
              knowledgeNames,
              weakPoints: data.weakPoints.map((wp) => ({ name: wp.name, mastery: wp.mastery, severity: wp.severity })),
              trackedWeakPoints: reportWeakPoints.map((wp) => ({ name: wp.name, mastery: wp.mastery, severity: wp.severity })),
              reviewPlans: reviewPlans.map(({ subject, plan }) => ({ subject, summary: plan.summary, days: plan.days })),
              wrongQuestions: wrongRecords.map((r: { title: string; subject: string; feature: string }) => ({ title: r.title, subject: r.subject, feature: r.feature })),
              accuracyTrend: data.accuracyTrend
            };
            const blob = new Blob([JSON.stringify(summary, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `learning-report-${data.range}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}>导出报告 (JSON)</button>
          <button className="button secondary" style={{ marginLeft: "var(--space-2)" }} type="button" onClick={() => window.print()}>打印报告</button>
        </div>
      </section>
      {showWrongAnswers ? (
        <div className="modal-backdrop" onClick={() => setShowWrongAnswers(false)}>
          <section className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "600px", maxHeight: "80vh", overflow: "auto" }}>
            <h2 className="card-title">错题详情</h2>
            <div className="list">
              {wrongRecords.map((wr: { id: string; title: string; subject: string; input: string }) => (
                <div className="review-item" key={wr.id}>
                  <strong>{wr.title}</strong>
                  <span className="muted">{wr.subject} · {wr.input.slice(0, 100)}</span>
                </div>
              ))}
              {wrongRecords.length === 0 ? <p className="muted">暂无错题记录</p> : null}
            </div>
            <button className="button secondary" style={{ marginTop: "var(--space-3)" }} onClick={() => setShowWrongAnswers(false)} type="button">关闭</button>
          </section>
        </div>
      ) : null}
    </PersonalizedGate>
  );
}
