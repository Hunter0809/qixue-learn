"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import { Bookmark, Send, SkipForward } from "lucide-react";
import { fetcher, postJson } from "@/lib/fetcher";
import type { QuizResponse, QuizSubmitRequest, QuizSubmitResponse } from "@/lib/types";
import { ErrorBlock, LoadingBlock } from "@/components/status";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { useLearningStore } from "@/lib/store";
import { getLearnerProfile, loadCurrentUsername } from "@/lib/profile-storage";

export default function QuizPage() {
  const owner = loadCurrentUsername() || "__anonymous__";
  const { data, error, isLoading } = useSWR<QuizResponse>(`/api/quiz?owner=${encodeURIComponent(owner)}`, fetcher);
  const setQuizResult = useLearningStore((state) => state.setQuizResult);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const { trigger, data: result, error: submitError, isMutating } = useSWRMutation(
    "/api/quiz/submit",
    (_url: string, { arg }: { arg: QuizSubmitRequest }) => postJson<QuizSubmitResponse, QuizSubmitRequest>("/api/quiz/submit", arg),
    { onSuccess: (response: QuizSubmitResponse) => setQuizResult(response) }
  );
  const question = data?.questions[index];
  const answeredCount = useMemo(() => Object.values(answers).filter(Boolean).length, [answers]);

  if (isLoading) return <LoadingBlock label="正在生成诊断测试" />;
  if (error) return <ErrorBlock error={error} />;
  if (!data || !question) return null;

  return (
    <>
      <header className="page-hero">
        <div>
          <span className="eyebrow">Adaptive Quiz</span>
          <h1 className="page-title">{data.title}</h1>
          <p className="page-kicker">{data.durationMinutes} 分钟 · 已答 {answeredCount}/{data.questions.length}</p>
        </div>
        <div className="hero-stat"><span>答题进度</span><strong>{answeredCount}/{data.questions.length}</strong></div>
      </header>
      <section className="section quiz-layout">
        <article className="card question-card">
          <div className="row"><span className="pill">{question.type} · {question.difficulty}</span><span className="pill">{question.knowledge}</span></div>
          <div className="quiz-question-title"><strong>{index + 1}. </strong><MarkdownRenderer text={question.stem} /></div>
          {question.options?.length ? (
            <div className="list">
              {question.options.map((option) => (
                <label className="choice" key={option}>
                  <input name={question.id} type="radio" checked={answers[question.id] === option} onChange={() => setAnswers({ ...answers, [question.id]: option })} />
                  <MarkdownRenderer text={option} />
                </label>
              ))}
            </div>
          ) : (
            <textarea className="textarea answer-box" value={answers[question.id] || ""} onChange={(event) => setAnswers({ ...answers, [question.id]: event.target.value })} placeholder="在这里作答" />
          )}
          <div className="row">
            <button className="button secondary" onClick={() => setMarked((items) => new Set(items).add(question.id))} type="button"><Bookmark size={16} /> 标记</button>
            <button className="button secondary" onClick={() => setIndex((value) => Math.min(data.questions.length - 1, value + 1))} type="button"><SkipForward size={16} /> 跳题</button>
            <button className="button" disabled={isMutating} onClick={() => void trigger({ quizId: data.quizId, answers, questions: data.questions, owner, profile: getLearnerProfile() })} type="button"><Send size={16} /> {isMutating ? "评分中" : "提交评分"}</button>
          </div>
        </article>
        <aside className="card">
          <h2 className="card-title">题号导航</h2>
          <div className="question-nav">
            {data.questions.map((item, itemIndex) => <button className={itemIndex === index ? "q active" : "q"} key={item.id} onClick={() => setIndex(itemIndex)} type="button" title={marked.has(item.id) ? "已标记" : item.knowledge}>{itemIndex + 1}</button>)}
          </div>
          {submitError ? <ErrorBlock error={submitError} /> : null}
          {!result ? <div className="result-sections"><section className="result-card"><div className="result-card-head"><h4>评分概览</h4></div><div className="result-card-body"><p className="muted">{isMutating ? "AI 正在评分，会在这里展示总分。" : "提交评分后，这里会展示总分。"}</p></div></section><section className="result-card"><div className="result-card-head"><h4>逐题反馈</h4></div><div className="result-card-body"><p className="muted">每道题的得分和薄弱点会按条目展示。</p></div></section></div> : null}
          {result ? <div className="result"><h3>总分 {result.totalScore}</h3>{result.feedback.map((item) => <p key={item.questionId}><strong>{item.score}</strong> {item.feedback}</p>)}</div> : null}
        </aside>
      </section>
    </>
  );
}
