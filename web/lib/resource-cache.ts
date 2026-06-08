"use client";

import type { Resource } from "@/lib/types";
import { getLearnerProfile, loadCurrentUsername } from "@/lib/profile-storage";

const CACHE_KEY = "qixue_resource_cache";
const GENERATING_KEY = "qixue_resource_generating";
const FEED_KEY = "qixue_resource_feed";
const FAILED_KEY = "qixue_resource_failed";
const TTL_MS = 60 * 60 * 1000;
const FAILURE_COOLDOWN_MS = 10 * 60 * 1000;

type CacheEntry = {
  resources: Resource[];
  timestamp: number;
};

function readCache(): Record<string, CacheEntry> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") as Record<string, CacheEntry>;
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, CacheEntry>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

function readGenerating(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(GENERATING_KEY) || "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

function writeGenerating(state: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(GENERATING_KEY, JSON.stringify(state));
}

function readFailed(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(FAILED_KEY) || "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function writeFailed(state: Record<string, number>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(FAILED_KEY, JSON.stringify(state));
}

function isCoolingDown(knowledge: string) {
  const failedAt = readFailed()[knowledge];
  return Boolean(failedAt && Date.now() - failedAt < FAILURE_COOLDOWN_MS);
}

function markFailed(knowledge: string) {
  const state = readFailed();
  state[knowledge] = Date.now();
  writeFailed(state);
}

function clearFailed(knowledge: string) {
  const state = readFailed();
  delete state[knowledge];
  writeFailed(state);
}

function readFeed(): Resource[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(FEED_KEY) || "[]") as Resource[];
  } catch {
    return [];
  }
}

function writeFeed(resources: Resource[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(FEED_KEY, JSON.stringify(resources));
}

export function getCachedResources(knowledge: string): Resource[] | null {
  const cache = readCache();
  const entry = cache[knowledge];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > TTL_MS) {
    delete cache[knowledge];
    writeCache(cache);
    return null;
  }
  return entry.resources;
}

export function setCachedResources(knowledge: string, resources: Resource[]) {
  const cache = readCache();
  cache[knowledge] = { resources, timestamp: Date.now() };
  writeCache(cache);
  const feed = readFeed();
  const existingIds = new Set(feed.map((resource) => resource.id));
  const appended = resources.filter((resource) => !existingIds.has(resource.id));
  if (appended.length) writeFeed([...feed, ...appended].slice(-120));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("qixue:resources-ready", { detail: { knowledge, resources } }));
  }
}

function hasDetailedContent(resource: Resource): boolean {
  const content = resource.content || "";
  return ["## 知识点", "## 核心解释", "## 相关课程", "## 例题（含答案）", "## 练习题"]
    .every((section) => content.includes(section));
}

export function isGenerating(knowledge: string): boolean {
  return !!readGenerating()[knowledge];
}

export function markGenerating(knowledge: string) {
  const state = readGenerating();
  state[knowledge] = true;
  writeGenerating(state);
}

export function clearGenerating(knowledge: string) {
  const state = readGenerating();
  delete state[knowledge];
  writeGenerating(state);
}

export function getResourceFeed(): Resource[] {
  return readFeed();
}

export function deleteResource(resourceId: string) {
  const nextFeed = readFeed().filter((resource) => resource.id !== resourceId);
  writeFeed(nextFeed);
  const cache = readCache();
  Object.keys(cache).forEach((knowledge) => {
    cache[knowledge] = {
      ...cache[knowledge],
      resources: cache[knowledge].resources.filter((resource) => resource.id !== resourceId)
    };
    if (!cache[knowledge].resources.length) delete cache[knowledge];
  });
  writeCache(cache);
  if (typeof window !== "undefined") {
    void fetch("/api/resource/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: resourceId })
    });
    window.dispatchEvent(new CustomEvent("qixue:resources-ready", { detail: { deleted: true, resourceId } }));
  }
}

export async function preGenerateResources(knowledge: string, subject: string): Promise<void> {
  const requestKnowledge = subject && !knowledge.trim().startsWith(subject)
    ? `${subject} ${knowledge.trim()}`
    : knowledge.trim();
  const cached = getCachedResources(requestKnowledge);
  if (cached && cached.length > 0 && cached.every(hasDetailedContent)) return;
  if (isGenerating(requestKnowledge) || isCoolingDown(requestKnowledge)) return;
  markGenerating(requestKnowledge);
  try {
    const resp = await fetch("/api/resource", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner: loadCurrentUsername() || undefined, knowledge: requestKnowledge, type: "lecture", style: "plain", profile: getLearnerProfile() })
    });
    if (!resp.ok) {
      markFailed(requestKnowledge);
      return;
    }
    const data = await resp.json();
    if (data.resources) {
      setCachedResources(requestKnowledge, data.resources as Resource[]);
      clearFailed(requestKnowledge);
    }
  } catch (error) {
    markFailed(requestKnowledge);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("qixue:resources-error", { detail: { knowledge: requestKnowledge, error } }));
    }
  } finally {
    clearGenerating(requestKnowledge);
  }
}
