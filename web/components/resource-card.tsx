"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { trackLearningBehavior } from "@/lib/behavior-tracking";
import { canonicalizeKnowledge, normalizeSubject } from "@/lib/knowledge-catalog";
import type { Resource } from "@/lib/types";

const SUBJECTS = ["数学", "语文", "英语", "物理", "化学", "生物", "历史", "地理", "政治", "科学"];

export function subjectFromKnowledge(knowledge: string): string {
  const trimmed = knowledge.trim();
  const explicit = SUBJECTS.find((subject) => new RegExp(`^${subject}(?:\\s|[:：-])`).test(trimmed));
  if (explicit) return explicit;
  return canonicalizeKnowledge(trimmed, "")?.subject || "";
}

export function resourceSubject(resource: Resource) {
  const explicit = resource.subject ? normalizeSubject(resource.subject) : "";
  return explicit && explicit !== "综合" ? explicit : subjectFromKnowledge(resource.knowledge || resource.title);
}

export function knowledgeName(knowledge: string, subject = subjectFromKnowledge(knowledge)) {
  if (!subject) return knowledge.trim();
  return knowledge
    .replace(new RegExp(`^${subject}\\s*[:：-]?\\s*`), "")
    .trim() || knowledge;
}

function typeLabel(type: Resource["type"]) {
  if (type === "lecture") return "核心概念";
  if (type === "exercise") return "巩固题目";
  if (type === "diagram") return "图解";
  return "类比";
}

function difficultyLabel(difficulty: Resource["difficulty"]) {
  if (difficulty === "easy") return "基础";
  if (difficulty === "medium") return "同步";
  return "提高";
}

export type ResourceGroup = {
  key: string;
  knowledge: string;
  subject: string;
  title: string;
  resources: Resource[];
};

export type ResourceCategory = {
  key: string;
  subject: string;
  resources: Resource[];
};

function resourceKnowledge(resource: Resource) {
  return (resource.knowledge || resource.title).trim();
}

export function resourceGroupKey(resource: Resource) {
  const knowledge = resourceKnowledge(resource);
  const subject = resourceSubject(resource);
  return `${subject}:${knowledgeName(knowledge, subject)}`;
}

function persistResourceDetail(resource: Resource, subject: string) {
  localStorage.setItem(`qixue_resource_detail_${resource.id}`, JSON.stringify(resource));
  trackLearningBehavior({
    knowledge: resource.knowledge || resource.title,
    subject,
    source: "resource_click"
  });
}

export function groupResourcesByKnowledge(resources: Resource[]): ResourceGroup[] {
  const groups = new Map<string, ResourceGroup>();

  resources.forEach((resource) => {
    const knowledge = resourceKnowledge(resource);
    const subject = resourceSubject(resource);
    if (!subject) return;
    const title = knowledgeName(knowledge, subject);
    const key = resourceGroupKey(resource);
    const existing = groups.get(key);

    if (existing) {
      existing.resources.push(resource);
      return;
    }

    groups.set(key, {
      key,
      knowledge,
      subject,
      title,
      resources: [resource]
    });
  });

  return Array.from(groups.values());
}

export function groupResourcesBySubject(resources: Resource[]): ResourceCategory[] {
  const groups = new Map<string, ResourceCategory>();

  resources.forEach((resource) => {
    const subject = resourceSubject(resource);
    if (!subject) return;
    const existing = groups.get(subject);

    if (existing) {
      existing.resources.push(resource);
      return;
    }

    groups.set(subject, {
      key: subject,
      subject,
      resources: [resource]
    });
  });

  return Array.from(groups.values());
}

export function ResourceCard({ resource, showContent = false, onDelete, parentGroup }: { resource: Resource; showContent?: boolean; onDelete?: (resource: Resource, event: React.MouseEvent) => void; parentGroup?: ResourceGroup }) {
  const subject = resourceSubject(resource);
  const knowledge = knowledgeName(resource.knowledge || resource.title, subject);
  const summary = resource.summary || resource.title;
  const groupKey = parentGroup?.key || resourceGroupKey(resource);
  const parentSubject = parentGroup?.subject || subject;
  const href = `/resources/detail?id=${encodeURIComponent(resource.id)}&category=${encodeURIComponent(parentSubject)}&knowledge=${encodeURIComponent(groupKey)}`;

  function persistDetail() {
    persistResourceDetail(resource, subject);
  }

  return (
    <Link
      className={`card resource-card resource-card-link resource-card-${resource.type}`}
      href={href}
      onClick={persistDetail}
      onContextMenu={(event) => {
        if (!onDelete) return;
        event.preventDefault();
        onDelete(resource, event);
      }}
      title={onDelete ? "右键删除该资源" : undefined}
    >
      <span className="resource-head">
        <span className="resource-main">
          <h3 className="card-title resource-title-line">{knowledge}</h3>
          <span className="resource-card-subline">
            <span className="resource-meta">
              <span className="pill">{subject}</span>
              <span className="pill">{typeLabel(resource.type)}</span>
              <span className="pill">{difficultyLabel(resource.difficulty)}</span>
            </span>
          </span>
          <p className="resource-preview">{summary}</p>
        </span>
        <ChevronRight size={18} />
      </span>
      {showContent && resource.content ? (
        <pre className="resource-content">{resource.content}</pre>
      ) : null}
    </Link>
  );
}

export function ResourceCategoryCard({ category }: { category: ResourceCategory }) {
  return (
    <Link className="card resource-group-card resource-card-link" href={`/resources?category=${encodeURIComponent(category.subject)}`}>
      <div className="resource-group-head">
        <span className="resource-main">
          <h3 className="card-title resource-title-line">{category.subject} 资源类别</h3>
          <span className="resource-card-subline">
            <span className="resource-meta">
              <span className="pill">主要类别</span>
              <span className="pill">{groupResourcesByKnowledge(category.resources).length} 个知识点</span>
            </span>
          </span>
          <p className="resource-preview">点击查看该类别下的知识点分类。</p>
        </span>
        <ChevronRight size={18} />
      </div>
    </Link>
  );
}

export function ResourceGroupCard({ group }: { group: ResourceGroup }) {
  return (
    <Link className="card resource-group-card resource-card-link" href={`/resources?category=${encodeURIComponent(group.subject)}&knowledge=${encodeURIComponent(group.key)}`}>
      <div className="resource-group-head">
        <span className="resource-main">
          <h3 className="card-title resource-title-line">{group.subject} · {group.title}</h3>
          <span className="resource-card-subline">
            <span className="resource-meta">
              <span className="pill">{group.subject}</span>
              <span className="pill">{group.resources.length} 个资源</span>
            </span>
          </span>
          <p className="resource-preview">点击查看该知识点下的资源内容。</p>
        </span>
        <ChevronRight size={18} />
      </div>
    </Link>
  );
}
