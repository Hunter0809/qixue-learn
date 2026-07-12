import type { VideoResource } from "@/components/learning-video-card";

/** 从public/data/educational-videos.json加载爬取的教育视频 */
let _cached: VideoResource[] | null = null;

function isBilibiliVideoDetailUrl(url: string): boolean {
  return /^https:\/\/www\.bilibili\.com\/video\/BV[a-zA-Z0-9]+\/?/.test(url);
}

export async function loadEducationalVideos(): Promise<VideoResource[]> {
  if (_cached) return _cached;
  try {
    const resp = await fetch("/data/educational-videos.json");
    if (!resp.ok) return [];
    const raw = (await resp.json()) as any[];
    _cached = raw
      .filter((v: any) => typeof v.url === "string" && isBilibiliVideoDetailUrl(v.url))
      .map((v: any) => ({
        id: v.id,
        title: v.title,
        subject: v.subject,
        knowledge: v.knowledge || v.title,
        url: v.url,
        source: "bilibili",
        publisher: v.publisher || "",
        duration: v.duration || "",
        play: v.play || 0,
        level: v.level || "高中",
      }));
    return _cached;
  } catch {
    return [];
  }
}

/** 根据年级获取对应level的视频（从已缓存的爬取数据中过滤） */
export function levelForGrade(grade: string): string {
  if (!grade) return "高中";
  if (grade.includes("小学")) return "小学";
  if (grade.includes("初")) return "初中";
  if (grade.includes("高") || grade.includes("中职")) return "高中";
  return "大学";
}

/** 向后兼容：导出一个空数组，使用时通过loadEducationalVideos异步加载 */
export const videoResources: VideoResource[] = [];

/** 根据年级从爬取结果中筛选对应level的视频 */
export async function getVideosForGrade(grade: string): Promise<VideoResource[]> {
  const all = await loadEducationalVideos();
  const lv = levelForGrade(grade);
  return all.filter((v) => v.level === lv);
}
