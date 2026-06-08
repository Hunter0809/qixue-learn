import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getStoredLearningVideos, saveStoredLearningVideos } from "@/lib/server-db";

type BilibiliResult = {
  bvid: string;
  title: string;
  author: string;
  play: number;
  duration: string;
  description: string;
  tag: string;
};

type BilibiliResponse = {
  data?: {
    result?: BilibiliResult[];
  };
};

type VideoResult = {
  bvid: string;
  title: string;
  author: string;
  play: number;
  duration: string;
  description: string;
  tag: string;
};

type CrawledVideo = {
  title?: string;
  subject?: string;
  knowledge?: string;
  url?: string;
  publisher?: string;
  duration?: string;
  play?: number;
  level?: string;
};

const CRAWLED_VIDEO_PATH = path.join(process.cwd(), "public", "data", "educational-videos.json");
const SUBJECTS = ["数学", "语文", "英语", "物理", "化学", "生物", "历史", "地理", "政治", "科学", "计算机类", "电子信息类", "机械类", "土木建筑类", "医学类", "经济管理类", "法学类"];
const UNIVERSITY_SUBJECTS = new Set(["计算机类", "电子信息类", "机械类", "土木建筑类", "医学类", "经济管理类", "法学类"]);
const BLOCKED_KEYWORDS = /直播|带货|投资|理财|股票|养生|美食|旅行|探店|测评|服装|化妆|美容|手游|端游|游戏|娱乐|明星|网红|MV|演唱|综艺/i;

const MOJIBAKE_LABELS: Record<string, string> = {
  "灏忓": "小学",
  "鍒濅腑": "初中",
  "楂樹腑": "高中",
  "澶у": "大学",
  "鏁板": "数学",
  "璇枃": "语文",
  "鑻辫": "英语",
  "鐗╃悊": "物理",
  "鍖栧": "化学",
  "鐢熺墿": "生物",
  "鍘嗗彶": "历史",
  "鍦扮悊": "地理",
  "鏀挎不": "政治",
  "绉戝": "科学",
  "璁＄畻鏈虹被": "计算机类"
};

function cleanTitle(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLabel(value: string | undefined) {
  if (!value) return "";
  return MOJIBAKE_LABELS[value] || value;
}

function normalizeKeyword(keyword: string) {
  return Object.entries(MOJIBAKE_LABELS).reduce((value, [bad, good]) => value.replaceAll(bad, good), keyword);
}

function extractSubjectFromKeyword(keyword: string): string {
  const normalized = normalizeKeyword(keyword);
  return SUBJECTS.find((subject) => normalized.includes(subject)) || "";
}

function extractLevelFromKeyword(keyword: string): string {
  const normalized = normalizeKeyword(keyword);
  if (normalized.includes("小学")) return "小学";
  if (normalized.includes("初中") || normalized.includes("中考")) return "初中";
  if (normalized.includes("高中") || normalized.includes("高考")) return "高中";
  if (normalized.includes("大学") || normalized.includes("高等") || normalized.includes("考研")) return "大学";
  const subject = extractSubjectFromKeyword(normalized);
  return UNIVERSITY_SUBJECTS.has(subject) ? "大学" : "";
}

function bvidFromUrl(url: string): string {
  return url.match(/\/video\/(BV[a-zA-Z0-9]+)/)?.[1] || "";
}

function tokenize(value: string): string[] {
  return Array.from(new Set(
    normalizeKeyword(value)
      .match(/[\u4e00-\u9fa5]{2,}|[a-z0-9]{2,}/gi) || []
  ))
    .map((term) => term.toLowerCase())
    .filter((term) => term.length >= 2 && !["教学", "课程", "讲解", "视频", "全部"].includes(term));
}

function isStageCompatible(text: string, level: string) {
  if (!level) return true;
  const normalized = normalizeKeyword(text);
  const hasPrimary = /小学|小升初/.test(normalized);
  const hasMiddle = /初中|中考|初一|初二|初三/.test(normalized);
  const hasHigh = /高中|高考|高一|高二|高三/.test(normalized);
  const hasUniversity = /大学|高等数学|高数|考研|线性代数|概率论|离散数学|数据结构|程序设计|计算机/.test(normalized);

  if (level === "小学") return !hasMiddle && !hasHigh && !hasUniversity;
  if (level === "初中") return !hasPrimary && !hasHigh && !hasUniversity;
  if (level === "高中") return !hasPrimary && !hasMiddle && !hasUniversity;
  if (level === "大学") return !hasPrimary && !hasMiddle && !hasHigh;
  return true;
}

async function storedResults(keyword: string, subject: string, level: string, limit: number): Promise<VideoResult[]> {
  return (await getStoredLearningVideos({ keyword, subject, level, limit })).map((item) => ({
    bvid: item.bvid,
    title: item.title,
    author: item.author,
    play: item.play,
    duration: item.duration,
    description: item.description,
    tag: item.tag
  }));
}

function localCrawledVideos(keyword: string, subject: string, level: string, pageSize: number, existingBvids = new Set<string>()): VideoResult[] {
  let raw: CrawledVideo[] = [];
  try {
    raw = JSON.parse(readFileSync(CRAWLED_VIDEO_PATH, "utf8")) as CrawledVideo[];
  } catch {
    return [];
  }

  const normalizedKeyword = normalizeKeyword(keyword);
  const terms = tokenize(normalizedKeyword);
  const querySubject = subject || extractSubjectFromKeyword(normalizedKeyword);
  if (!terms.length && !querySubject) return [];

  return raw
    .filter((item) => !level || normalizeLabel(item.level) === level)
    .map((item) => {
      const bvid = bvidFromUrl(item.url || "");
      const title = item.title || "";
      const knowledge = item.knowledge || "";
      const itemSubject = normalizeLabel(item.subject);
      const itemLevel = normalizeLabel(item.level);
      const text = `${title} ${knowledge} ${itemSubject} ${itemLevel}`;
      const haystack = normalizeKeyword(text).toLowerCase();
      const textScore = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      const subjectScore = querySubject && itemSubject === querySubject ? 2 : 0;
      const stageScore = level && itemLevel === level ? 3 : 0;
      return { item, bvid, itemSubject, itemLevel, text, score: textScore + subjectScore + stageScore };
    })
    .filter(({ item, bvid, text, score }) => Boolean(bvid) && !existingBvids.has(bvid) && score > 0 && isStageCompatible(text, level) && !BLOCKED_KEYWORDS.test(`${item.title || ""} ${item.knowledge || ""}`))
    .sort((a, b) => b.score - a.score || (b.item.play || 0) - (a.item.play || 0))
    .slice(0, pageSize)
    .map(({ item, bvid, itemSubject, itemLevel }) => ({
      bvid,
      title: item.title || item.knowledge || "学习视频",
      author: item.publisher || "",
      play: item.play || 0,
      duration: item.duration || "",
      description: item.knowledge || item.title || "",
      tag: [itemSubject, itemLevel].filter(Boolean).join(",")
    }));
}

async function persistVideos(videos: VideoResult[], keyword: string, subject: string, level: string) {
  await saveStoredLearningVideos(videos.map((item) => ({
    id: `bili_${item.bvid}`,
    bvid: item.bvid,
    title: item.title,
    author: item.author,
    play: item.play,
    duration: item.duration,
    description: item.description,
    tag: item.tag,
    keyword,
    subject,
    level,
    url: `https://www.bilibili.com/video/${item.bvid}`
  })));
}

function responseFromVideos(videos: VideoResult[], keyword: string, level: string) {
  return NextResponse.json({ videos, total: videos.length, keyword, level });
}

async function searchBilibili(keyword: string, page: number, pageSize: number, broad: boolean, level: string): Promise<VideoResult[]> {
  const normalizedKeyword = normalizeKeyword(keyword);
  const variants = broad
    ? [normalizedKeyword, `${normalizedKeyword} 教学`, `${normalizedKeyword} 课程`, `${normalizedKeyword} 讲解`, `${normalizedKeyword} 知识点`]
    : [`${normalizedKeyword} 教学 知识点`];
  const merged = new Map<string, VideoResult>();

  for (const query of variants) {
    const encodedKeyword = encodeURIComponent(query);
    const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodedKeyword}&page=${page}&pagesize=${Math.min(pageSize * 2, 50)}&order=click`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Referer: "https://www.bilibili.com"
        },
        signal: controller.signal
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) continue;
      const data = await response.json() as BilibiliResponse;
      for (const item of data.data?.result || []) {
        if (!item.bvid) continue;
        const title = cleanTitle(item.title || "");
        const text = `${title} ${item.description || ""} ${item.tag || ""}`;
        if (title.length < 4 || !isStageCompatible(text, level) || BLOCKED_KEYWORDS.test(text)) continue;
        merged.set(item.bvid, {
          bvid: item.bvid,
          title,
          author: item.author || "",
          play: item.play || 0,
          duration: item.duration || "",
          description: cleanTitle((item.description || "").slice(0, 200)),
          tag: item.tag || ""
        });
      }
      if (merged.size >= pageSize) break;
    } finally {
      clearTimeout(timeout);
    }
  }

  return Array.from(merged.values()).slice(0, pageSize);
}

export async function POST(request: NextRequest) {
  const { keyword, page = 1, pageSize = 20, broad = false, level: requestedLevel = "" } = await request.json();
  const normalizedKeyword = normalizeKeyword(String(keyword || ""));
  const subject = extractSubjectFromKeyword(normalizedKeyword);
  const level = normalizeLabel(requestedLevel) || extractLevelFromKeyword(normalizedKeyword);
  const merged = new Map<string, VideoResult>();

  (await storedResults(normalizedKeyword, subject, level, pageSize)).forEach((video) => merged.set(video.bvid, video));

  if (merged.size < pageSize) {
    try {
      const searched = await searchBilibili(normalizedKeyword, page, pageSize - merged.size, broad, level);
      searched.forEach((video) => {
        if (!merged.has(video.bvid)) merged.set(video.bvid, video);
      });
    } catch {
      // Local crawled videos are queried below after network search errors.
    }
  }

  if (merged.size < pageSize) {
    localCrawledVideos(normalizedKeyword, subject, level, pageSize - merged.size, new Set(merged.keys()))
      .forEach((video) => merged.set(video.bvid, video));
  }

  const videos = Array.from(merged.values()).slice(0, pageSize);
  await persistVideos(videos, normalizedKeyword, subject, level);
  return responseFromVideos(videos, normalizedKeyword, level);
}
