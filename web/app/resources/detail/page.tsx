"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { knowledgeName, resourceGroupKey, resourceSubject } from "@/components/resource-card";
import type { Resource, ResourceResponse } from "@/lib/types";

const REQUIRED_SECTIONS = ["知识点", "核心解释", "相关课程", "例题（含答案）", "练习题"];

function hasDetailedContent(resource: Resource | null) {
  const content = resource?.content || "";
  return REQUIRED_SECTIONS.every((section) => content.includes(`## ${section}`));
}

function sectionFromContent(content: string | undefined, title: string) {
  if (!content) return "";
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`##\\s*${escaped}\\s*([\\s\\S]*?)(?=\\n##\\s|$)`));
  return match?.[1]?.trim() || "";
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="result-card filled">
      <div className="result-card-head"><h4>{title}</h4></div>
      <div className="result-card-body">{children}</div>
    </section>
  );
}

function ResourceDetailContent() {
  const params = useSearchParams();
  const id = params.get("id") || "";
  const sourceCategory = params.get("category") || "";
  const sourceKnowledge = params.get("knowledge") || "";
  const [resource, setResource] = useState<Resource | null>(null);
  const [generating, setGenerating] = useState(false);
  const resourceSubjectName = resource ? resourceSubject(resource) : sourceCategory;
  const resourceKnowledgeKey = resource ? resourceGroupKey(resource) : sourceKnowledge;
  const resourceKnowledgeTitle = resource ? knowledgeName(resource.knowledge || resource.title, resourceSubjectName) : "";
  const backToKnowledgeHref =
    sourceCategory && sourceKnowledge
      ? `/resources?category=${encodeURIComponent(sourceCategory)}&knowledge=${encodeURIComponent(sourceKnowledge)}`
      : resource
      ? `/resources?category=${encodeURIComponent(resourceSubjectName)}&knowledge=${encodeURIComponent(resourceKnowledgeKey)}`
      : "/resources";

  useEffect(() => {
    if (!id) return;
    const raw = localStorage.getItem(`qixue_resource_detail_${id}`);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Resource;
    setResource(parsed);
    if (!hasDetailedContent(parsed)) {
      setGenerating(true);
      fetch("/api/resource", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ knowledge: parsed.knowledge || parsed.title, type: parsed.type, style: "plain" })
      })
        .then((response) => response.json() as Promise<ResourceResponse>)
        .then((data) => {
          const next = data.resources?.find((item) => item.type === parsed.type) || data.resources?.[0];
          if (!next) return;
          localStorage.setItem(`qixue_resource_detail_${id}`, JSON.stringify(next));
          setResource(next);
        })
        .finally(() => setGenerating(false));
    }
  }, [id]);

  return (
    <section className="section io-stack">
      <header className="page-hero">
        <div>
          <span className="eyebrow">Resource Detail</span>
          <h1 className="page-title">{resource?.title || "资源详情"}</h1>
        </div>
      </header>
      <article className="card resource-detail-page">
        <div className="resource-breadcrumb">
          <Link className="button secondary small" href="/resources">主要类别</Link>
          {resourceSubjectName ? <Link className="button secondary small" href={`/resources?category=${encodeURIComponent(resourceSubjectName)}`}>{resourceSubjectName} 知识点</Link> : null}
          {resource ? <Link className="button secondary small" href={backToKnowledgeHref}>{resourceSubjectName} · {resourceKnowledgeTitle}</Link> : null}
        </div>
        {resource ? (
          <div className="resource-detail-grid">
            {generating ? <p className="pill">正在补全知识点、例题和练习题内容</p> : null}
            <div className="resource-meta">
              <span className="pill">{resource.knowledge}</span>
              <span className="pill">{resource.type === "lecture" ? "讲义" : resource.type === "exercise" ? "练习" : resource.type === "diagram" ? "图解" : "类比"}</span>
              <span className="pill">{resource.difficulty === "easy" ? "基础" : resource.difficulty === "medium" ? "同步" : "提高"}</span>
            </div>
            <DetailSection title="知识点">
              <MarkdownRenderer text={sectionFromContent(resource.content, "知识点") || resource.knowledge} boldAsSubheading />
            </DetailSection>
            <DetailSection title="核心解释">
              <MarkdownRenderer text={sectionFromContent(resource.content, "核心解释") || resource.summary} boldAsSubheading />
            </DetailSection>
            <DetailSection title="相关课程">
              <MarkdownRenderer text={sectionFromContent(resource.content, "相关课程") || "正在生成相关课程。"} boldAsSubheading />
            </DetailSection>
            <DetailSection title="例题（含答案）">
              <MarkdownRenderer text={sectionFromContent(resource.content, "例题（含答案）") || "正在生成例题。"} boldAsSubheading />
            </DetailSection>
            <DetailSection title="练习题">
              <MarkdownRenderer text={sectionFromContent(resource.content, "练习题") || "正在生成练习题。"} boldAsSubheading />
            </DetailSection>
          </div>
        ) : (
          <p className="muted">未找到该资源详情，请从个性资源卡片重新进入。</p>
        )}
        <Link className="button secondary" href={backToKnowledgeHref}>返回上一级</Link>
      </article>
    </section>
  );
}

export default function ResourceDetailPage() {
  return (
    <Suspense fallback={<section className="section"><div className="card">加载资源详情...</div></section>}>
      <ResourceDetailContent />
    </Suspense>
  );
}
