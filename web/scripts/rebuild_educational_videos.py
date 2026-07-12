# -*- coding: utf-8 -*-
"""Rebuild educational video data with verified Bilibili detail links.

The crawler keeps separate quotas for primary, middle, high-school and college
resources so the Learning Space can filter reliably by learning stage.
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.parse
import urllib.request
from html import unescape


ROOT = os.path.dirname(os.path.dirname(__file__))
OUTPUT = os.path.join(ROOT, "public", "data", "educational-videos.json")
STAGE_TARGET = 500

STAGE_QUERIES = {
    "小学": [
        ("数学", "小学数学 应用题 解题技巧"),
        ("数学", "小学数学 分数 小数 计算"),
        ("语文", "小学语文 阅读理解 作文"),
        ("语文", "小学语文 古诗 课文 讲解"),
        ("英语", "小学英语 自然拼读 语法"),
        ("英语", "小学英语 单词 口语"),
        ("科学", "小学科学 实验 知识点"),
    ],
    "初中": [
        ("数学", "初中数学 函数 几何 讲解"),
        ("数学", "初中数学 中考 压轴题"),
        ("语文", "初中语文 阅读理解 作文"),
        ("英语", "初中英语 语法 阅读"),
        ("物理", "初中物理 力学 电学"),
        ("化学", "初中化学 酸碱盐 方程式"),
        ("历史", "初中历史 中考 复习"),
        ("地理", "初中地理 会考 复习"),
    ],
    "高中": [
        ("数学", "高中数学 函数 导数 高考"),
        ("数学", "高中数学 圆锥曲线 数列"),
        ("语文", "高中语文 古诗文 作文 高考"),
        ("英语", "高中英语 阅读 语法 高考"),
        ("物理", "高中物理 力学 电磁学"),
        ("化学", "高中化学 有机化学 实验"),
        ("生物", "高中生物 遗传 细胞"),
        ("历史", "高中历史 高考 复习"),
        ("地理", "高中地理 自然地理 人文地理"),
        ("政治", "高中政治 哲学 经济"),
    ],
    "大学": [
        ("高等数学", "高等数学 微积分 期末 考研"),
        ("线性代数", "线性代数 矩阵 考研"),
        ("大学英语", "大学英语 四级 六级"),
        ("大学物理", "大学物理 力学 电磁学"),
        ("计算机", "数据结构 操作系统 计算机考研"),
        ("计算机", "计算机网络 数据库 课程"),
        ("电子信息", "电路 信号与系统 通信原理"),
        ("机械", "机械原理 工程力学"),
        ("经济管理", "微观经济学 管理学 会计"),
        ("法学", "民法 刑法 法考"),
    ],
}

EDU_RE = re.compile(
    r"教学|讲解|知识点|课程|复习|考试|高考|中考|考研|例题|解题|语法|函数|物理|化学|数学|语文|英语|大学|小学|初中|高中"
)
BAD_RE = re.compile(r"游戏|手游|直播带货|娱乐|明星|美食|旅游|穿搭|化妆|vlog|电影|电视剧")


def request_json(url: str) -> dict:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.bilibili.com/",
        },
    )
    with urllib.request.urlopen(req, timeout=25) as response:
        return json.loads(response.read().decode("utf-8", errors="replace"))


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", "", text or ""))).strip()


def search(keyword: str, page: int) -> list[dict]:
    params = urllib.parse.urlencode({
        "search_type": "video",
        "keyword": keyword,
        "page": page,
        "pagesize": 30,
        "order": "click",
    })
    data = request_json(f"https://api.bilibili.com/x/web-interface/search/type?{params}")
    if data.get("code") != 0:
        return []
    return (data.get("data") or {}).get("result") or []


def is_educational(title: str, tags: str, desc: str, keyword: str) -> bool:
    text = f"{title} {tags} {desc} {keyword}"
    return bool(title and not BAD_RE.search(text) and EDU_RE.search(text))


def video_from_result(result: dict, level: str, subject: str, keyword: str) -> dict | None:
    bvid = result.get("bvid") or ""
    if not re.fullmatch(r"BV[0-9A-Za-z]+", bvid):
        return None

    title = clean(result.get("title", ""))
    tags = clean(result.get("tag", ""))
    desc = clean(result.get("description", ""))
    if not is_educational(title, tags, desc, keyword):
        return None

    author = clean(result.get("author", ""))
    duration = result.get("duration", "") or ""
    play = int(result.get("play") or 0)
    return {
        "id": f"bili_{bvid}",
        "title": title,
        "subject": subject,
        "knowledge": tags or desc[:120] or title,
        "url": f"https://www.bilibili.com/video/{bvid}",
        "source": "bilibili",
        "publisher": author or "Bilibili",
        "duration": duration,
        "play": play,
        "level": level,
    }


def crawl_stage(level: str, queries: list[tuple[str, str]], seen: set[str]) -> list[dict]:
    stage_videos: list[dict] = []
    query_index = 0
    while len(stage_videos) < STAGE_TARGET and query_index < len(queries) * 35:
        subject, keyword = queries[query_index % len(queries)]
        page = query_index // len(queries) + 1
        query_index += 1
        try:
            results = search(keyword, page)
        except Exception:
            time.sleep(1.0)
            continue
        if not results:
            continue
        for result in results:
            item = video_from_result(result, level, subject, keyword)
            if not item:
                continue
            bvid = item["id"].replace("bili_", "")
            if bvid in seen:
                continue
            seen.add(bvid)
            stage_videos.append(item)
            if len(stage_videos) >= STAGE_TARGET:
                break
        time.sleep(0.18)
    return stage_videos


def rebuild() -> list[dict]:
    seen: set[str] = set()
    videos: list[dict] = []
    stage_counts: dict[str, int] = {}

    for level, queries in STAGE_QUERIES.items():
        stage_videos = crawl_stage(level, queries, seen)
        stage_counts[level] = len(stage_videos)
        if len(stage_videos) < STAGE_TARGET:
            raise RuntimeError(f"{level} only collected {len(stage_videos)} videos; target is {STAGE_TARGET}")
        videos.extend(stage_videos[:STAGE_TARGET])

    videos.sort(key=lambda item: (item["level"], item["subject"], -item.get("play", 0), item["title"]))
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as handle:
        json.dump(videos, handle, ensure_ascii=False, indent=2)
    print(json.dumps(stage_counts, ensure_ascii=False))
    return videos


if __name__ == "__main__":
    data = rebuild()
    print(f"rebuilt {len(data)} videos -> {OUTPUT}")
