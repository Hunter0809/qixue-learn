"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWRMutation from "swr/mutation";
import { Wand2 } from "lucide-react";
import { postJson } from "@/lib/fetcher";
import { useLearningStore } from "@/lib/store";
import { deleteResource, getResourceFeed, preGenerateResources, setCachedResources, waitForResourceJob } from "@/lib/resource-cache";
import type { Resource, ResourceJobAccepted, ResourceRequest, ResourceResponse } from "@/lib/types";
import { ErrorBlock } from "@/components/status";
import {
  ResourceCard,
  ResourceCategoryCard,
  ResourceGroupCard,
  groupResourcesByKnowledge,
  groupResourcesBySubject,
  subjectFromKnowledge
} from "@/components/resource-card";
import { LoginModal } from "@/components/login-modal";
import { ConfirmPopup, type ConfirmAction } from "@/components/confirm-popup";
import { getLearnerProfile, isGuestSession, loadCurrentUserProfile, loadCurrentUsername, logoutUser } from "@/lib/profile-storage";

function mergeResources(primary: Resource[], secondary: Resource[]) {
  const map = new Map<string, Resource>();
  [...primary, ...secondary].forEach((resource) => {
    map.set(resource.id, resource);
  });
  return Array.from(map.values());
}

function ResourcesContent() {
  const params = useSearchParams();
  const selectedCategory = params.get("category") || "";
  const selectedKnowledge = params.get("knowledge") || "";
  const saved = useLearningStore((state) => state.resourceFilter);
  const setResourceFilter = useLearningStore((state) => state.setResourceFilter);
  const [filter, setFilter] = useState<ResourceRequest>(saved);
  const [page, setPage] = useState(0);
  const [feedResources, setFeedResources] = useState<Resource[]>([]);
  const [agentTraces, setAgentTraces] = useState<ResourceResponse["agents"]>([]);
  const [loginOpen, setLoginOpen] = useState(false);
  const [canUsePersonalizedResources, setCanUsePersonalizedResources] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const { trigger, data, error, isMutating } = useSWRMutation(
    "/api/resource",
    (_url: string, { arg }: { arg: ResourceRequest }) => postJson<ResourceResponse | ResourceJobAccepted, ResourceRequest>("/api/resource", arg)
  );

  const PAGE_SIZE = 10;
  const generatedResources = data && "jobId" in data ? [] : (data?.resources || []);
  const resources = mergeResources(generatedResources, feedResources);
  const resourceCategories = groupResourcesBySubject(resources);
  const categoryResources = selectedCategory
    ? resourceCategories.find((category) => category.subject === selectedCategory)?.resources || []
    : resources;
  const resourceGroups = groupResourcesByKnowledge(categoryResources);
  const selectedGroup = selectedKnowledge
    ? resourceGroups.find((group) => group.key === selectedKnowledge)
    : undefined;
  const visibleItems = selectedKnowledge ? selectedGroup?.resources || [] : selectedCategory ? resourceGroups : resourceCategories;
  const totalPages = Math.ceil(visibleItems.length / PAGE_SIZE);
  const pagedItems = visibleItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const categoryHref = selectedCategory ? `/resources?category=${encodeURIComponent(selectedCategory)}` : "/resources";

  async function resolveResourceResponse(response: ResourceResponse | ResourceJobAccepted) {
    return "jobId" in response
      ? waitForResourceJob(response.jobId, loadCurrentUsername() || "__anonymous__")
      : response;
  }

  function applyResourceResponse(response: ResourceResponse, request: ResourceRequest) {
    if (!response.resources.length) return;
    setAgentTraces(response.agents || []);
    setCachedResources(request.knowledge, response.resources);
    setFeedResources(getResourceFeed());
    setPage(0);
  }
  useEffect(() => {
    setCanUsePersonalizedResources(Boolean(loadCurrentUserProfile()) && !isGuestSession());
    setFeedResources(getResourceFeed());

    function reloadFeed() {
      setFeedResources(getResourceFeed());
      setPage(0);
    }

    window.addEventListener("qixue:resources-ready", reloadFeed);
    return () => window.removeEventListener("qixue:resources-ready", reloadFeed);
  }, []);

  useEffect(() => {
    setPage(0);
  }, [selectedCategory, selectedKnowledge]);

  useEffect(() => {
    const knowledge = filter.knowledge.trim();
    const subject = subjectFromKnowledge(knowledge);
    if (!knowledge || !subject) return;
    void preGenerateResources(knowledge, subject);
  }, [filter.knowledge]);

  useEffect(() => {
    if (selectedCategory) return;
    const knowledge = params.get("knowledge");
    const type = params.get("type") as ResourceRequest["type"] | null;
    const style = params.get("style") as ResourceRequest["style"] | null;
    if (knowledge) {
      const next = {
        ...filter,
        knowledge,
        type: type || filter.type,
        style: style || filter.style
      };
      setFilter(next);
      setResourceFilter(next);
      void trigger({ ...next, owner: loadCurrentUsername() || undefined }).then(resolveResourceResponse).then((response) => applyResourceResponse(response, next)).catch(() => undefined);
    }
  }, [params]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canUsePersonalizedResources) return;
    setResourceFilter(filter);
    const request = { ...filter, owner: loadCurrentUsername() || undefined, profile: getLearnerProfile() };
    void trigger(request).then(resolveResourceResponse).then((response) => applyResourceResponse(response, request)).catch(() => undefined);
  }

  function removeResource(resourceId: string, event?: React.MouseEvent) {
    const x = event ? event.clientX : window.innerWidth / 2;
    const y = event ? event.clientY : window.innerHeight / 2;
    setConfirmAction({
      message: "删除这个个性化资源？",
      x,
      y,
      onConfirm: () => {
        deleteResource(resourceId);
        setFeedResources(getResourceFeed());
        setPage(0);
        setConfirmAction(null);
      }
    });
  }

  return (
    <>
      <header className="page-hero">
        <div>
          <span className="eyebrow">Resource Agent</span>
          <h1 className="page-title">个性化资源生成</h1>
        </div>
      </header>

      {!canUsePersonalizedResources ? (
        <section className="section card personalized-resource-notice">
          <div>
            <span className="eyebrow">Personalized Resources</span>
            <h2 className="card-title">登录 / 注册后查看个性化资源</h2>
            <p className="muted">游客或未登录状态仅可查看已有内容，不会生成新的个性化资源。</p>
          </div>
          <button className="button" onClick={() => { logoutUser(); setLoginOpen(true); }} type="button">登录 / 注册</button>
        </section>
      ) : null}

      <form className="section card resource-filter" onSubmit={submit}>
        <div className="field">
          <label htmlFor="knowledge">知识点</label>
          <input id="knowledge" className="input" value={filter.knowledge} onChange={(event) => setFilter({ ...filter, knowledge: event.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="type">资源类型</label>
          <select id="type" className="select" value={filter.type} onChange={(event) => setFilter({ ...filter, type: event.target.value as ResourceRequest["type"] })}>
            <option value="lecture">讲义</option>
            <option value="exercise">练习题</option>
            <option value="diagram">图解</option>
            <option value="analogy">类比解释</option>
            <option value="reading">拓展阅读</option>
            <option value="video">视频脚本</option>
            <option value="animation">动画分镜</option>
            <option value="code">代码实操</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="style">风格</label>
          <select id="style" className="select" value={filter.style} onChange={(event) => setFilter({ ...filter, style: event.target.value as ResourceRequest["style"] })}>
            <option value="plain">易懂</option>
            <option value="exam">考点强化</option>
            <option value="practice">实践型</option>
          </select>
        </div>
        <button className="button" disabled={!canUsePersonalizedResources || !filter.knowledge.trim() || isMutating} type="submit">
          <Wand2 size={16} /> {isMutating ? "生成中" : "生成资源"}
        </button>
      </form>

      {agentTraces?.length ? (
        <section className="section card agent-trace-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Multi-Agent Orchestration</span>
              <h2 className="card-title">本次资源协同轨迹</h2>
            </div>
            <span className="pill">{agentTraces.length} 个专职 Agent</span>
          </div>
          <div className="agent-trace-grid">
            {agentTraces.map((trace) => (
              <div className="agent-trace-card" key={trace.agentId}>
                <strong>{trace.role}</strong>
                <span className="muted">{trace.artifactType} · {trace.status === "cache_hit" ? "命中缓存" : `已完成${trace.latencyMs ? ` · ${trace.latencyMs}ms` : ""}`}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="section">
        <div className="resource-breadcrumb">
          <Link className="button secondary small" href="/resources">主要类别</Link>
          {selectedCategory ? <Link className="button secondary small" href={categoryHref}>{selectedCategory} 知识点</Link> : null}
          {selectedKnowledge && selectedGroup ? <span className="pill">{selectedGroup.subject} · {selectedGroup.title}</span> : null}
        </div>
        <div className="panel-heading" style={{ marginBottom: "var(--space-3)" }}>
          <h2 className="card-title">
            {selectedKnowledge ? `${selectedGroup?.subject || selectedCategory} · ${selectedGroup?.title || "资源内容"}` : selectedCategory ? `${selectedCategory} 知识点` : "资源主要类别"}
            <span className="pill">{visibleItems.length} 个</span>
          </h2>
        </div>
        {error ? <ErrorBlock error={error} /> : null}
        {canUsePersonalizedResources && resources.length ? (
          <>
            <div className="resource-double-layout">
              {selectedKnowledge
                ? (pagedItems as Resource[]).map((resource) => <ResourceCard key={resource.id} resource={resource} parentGroup={selectedGroup} onDelete={(item, event) => removeResource(item.id, event)} />)
                : selectedCategory
                ? (pagedItems as ReturnType<typeof groupResourcesByKnowledge>).map((group) => <ResourceGroupCard key={group.key} group={group} />)
                : (pagedItems as ReturnType<typeof groupResourcesBySubject>).map((category) => <ResourceCategoryCard key={category.key} category={category} />)}
            </div>
            {totalPages > 1 ? (
              <div className="pagination">
                <button className="button secondary" disabled={page === 0} onClick={() => setPage(0)} type="button">首页</button>
                <button className="button secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)} type="button">上一页</button>
                <span className="muted">{page + 1} / {totalPages}</span>
                <button className="button secondary" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} type="button">下一页</button>
                <button className="button secondary" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)} type="button">尾页</button>
              </div>
            ) : null}
          </>
        ) : !canUsePersonalizedResources ? (
          <div className="result-sections">
            <section className="result-card">
              <div className="result-card-head"><h4>个性化资源</h4></div>
              <div className="result-card-body"><p className="muted">请先登录 / 注册，系统会结合地区、学校、年级、资源难度和当前学期阶段生成资源。</p></div>
            </section>
          </div>
        ) : (
          <div className="result-sections">
            <section className="result-card">
              <div className="result-card-head"><h4>资源概览</h4></div>
              <div className="result-card-body"><p className="muted">{isMutating ? "AI 正在生成资源，会在这里展示结果。" : "提交知识点后，这里会展示生成的资源列表。"}</p></div>
            </section>
            <section className="result-card">
              <div className="result-card-head"><h4>讲解内容</h4></div>
              <div className="result-card-body"><p className="muted">核心概念、例题拆解和训练内容会分卡片展示。</p></div>
            </section>
          </div>
        )}
      </section>
      {loginOpen ? (
        <LoginModal
          onClose={() => setLoginOpen(false)}
          onDone={() => { setLoginOpen(false); setCanUsePersonalizedResources(Boolean(loadCurrentUserProfile()) && !isGuestSession()); setFeedResources(getResourceFeed()); }}
        />
      ) : null}
      {confirmAction ? (
        <ConfirmPopup action={confirmAction} onClose={() => setConfirmAction(null)} />
      ) : null}
    </>
  );
}

export default function ResourcesPage() {
  return (
    <Suspense fallback={<div className="skeleton" />}>
      <ResourcesContent />
    </Suspense>
  );
}
