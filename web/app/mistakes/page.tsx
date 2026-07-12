"use client";

import { FormEvent, useEffect, useState } from "react";
import useSWRMutation from "swr/mutation";
import { Eye, Lightbulb, Upload } from "lucide-react";
import { postJson } from "@/lib/fetcher";
import type { MistakeAnalysis } from "@/lib/types";
import { ErrorBlock } from "@/components/status";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { addWeakPoint } from "@/lib/store";
import { preGenerateResources } from "@/lib/resource-cache";

async function uploadMistake(_url: string, { arg }: { arg: File }) {
  const formData = new FormData();
  formData.append("file", arg);
  const response = await fetch("/api/mistake/upload", { method: "POST", body: formData });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<MistakeAnalysis>;
}

export default function MistakesPage() {
  const [text, setText] = useState("");
  const [hintCount, setHintCount] = useState(1);
  const [showFull, setShowFull] = useState(false);
  const textMutation = useSWRMutation(
    "/api/mistake/analyze",
    (_url: string, { arg }: { arg: { text: string } }) => postJson<MistakeAnalysis, { text: string }>("/api/mistake/analyze", arg)
  );
  const uploadMutation = useSWRMutation("/api/mistake/upload", uploadMistake);
  const analysis = uploadMutation.data || textMutation.data;
  const error = uploadMutation.error || textMutation.error;
  const busy = uploadMutation.isMutating || textMutation.isMutating;

  // 分析结果到达时，自动关联薄弱点追踪
  useEffect(() => {
    if (!analysis?.knowledge?.length) return;
    const subject = "综合";
    analysis.knowledge.forEach((k) => {
      addWeakPoint(k, subject, "mistake_analysis", false);
      preGenerateResources(k, subject);
    });
    if (analysis.similarQuestions?.length) {
      analysis.similarQuestions.forEach((q) => {
        if (q.knowledge) {
          addWeakPoint(q.knowledge, subject, "mistake_analysis", false);
        }
      });
    }
  }, [analysis]);

  function submitText(event: FormEvent) {
    event.preventDefault();
    if (text.trim()) void textMutation.trigger({ text });
  }

  return (

    <>
      <header className="page-hero">
        <div>
          <span className="eyebrow">Tutor Room</span>
        <h1 className="page-title">错题本与辅导室</h1>
        <p className="page-kicker">上传图片或输入题目，系统给出错因分析、相似题和逐步提示。</p>
        </div>
      </header>

      <section className="section io-stack">
        <div className="card">
          <h2 className="card-title">录入错题</h2>
          <label className="upload-zone">
            <Upload size={22} />
            <span>拖拽或点击上传错题图片</span>
            <input hidden type="file" accept="image/*" onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadMutation.trigger(file);
            }} />
          </label>
          <form onSubmit={submitText}>
            <div className="field">
              <label htmlFor="mistakeText">题目文本</label>
              <textarea id="mistakeText" className="textarea" value={text} onChange={(e) => setText(e.target.value)} />
            </div>
            <button className="button" disabled={!text.trim() || busy} type="submit">
              <Lightbulb size={16} /> {busy ? "分析中" : "分析错因"}
            </button>
          </form>
          {error ? <ErrorBlock error={error} /> : null}
        </div>

        <div className="card">
          <h2 className="card-title">辅导结果</h2>
          {!analysis ? (
            <div className="result-sections">
              <section className="result-card">
                <div className="result-card-head"><h4>识别文本</h4></div>
                <div className="result-card-body"><p className="muted">{busy ? "AI 正在分析错题，会在这里展示识别内容。" : "上传图片或提交文本后，这里会展示识别内容。"}</p></div>
              </section>
              <section className="result-card">
                <div className="result-card-head"><h4>错因与提示</h4></div>
                <div className="result-card-body"><p className="muted">错因、知识点、提示和相似题会分卡片展示。</p></div>
              </section>
            </div>
          ) : (
            <div className="list result-card-list">
              <p><strong>识别题目：</strong>{analysis.recognizedText}</p>
              <p><strong>错因：</strong>{analysis.cause}</p>
              <div>{analysis.knowledge.map((item) => <span className="pill" key={item}>{item}</span>)}</div>
              <div className="hint-panel">
                {analysis.hints.slice(0, hintCount).map((hint, index) => (
                  <p key={hint}><strong>提示 {index + 1}</strong>：{hint}</p>
                ))}
                <button className="button secondary" disabled={hintCount >= analysis.hints.length} onClick={() => setHintCount((value) => value + 1)} type="button">
                  下一提示
                </button>
              </div>
              <button className="button secondary" onClick={() => setShowFull((value) => !value)} type="button">
                <Eye size={16} /> {showFull ? "收起解析" : "显示完整解析"}
              </button>
              {showFull ? <pre className="resource-content">{analysis.fullExplanation}</pre> : null}
              <h3>相似题</h3>
              {analysis.similarQuestions.map((question) => (
                <div className="inline-panel" key={question.id}>
                  <span className="pill">{question.knowledge}</span>
                  <MarkdownRenderer text={question.stem} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
