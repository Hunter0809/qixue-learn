# -*- coding: utf-8 -*-
"""Append verified Bilibili video detail links for more stages and subjects."""
import json
import os
import sys
import time

from crawl_educational_videos import (
    clean_title,
    create_opener,
    get_cookies,
    is_educational,
    is_subject_relevant,
    search_bili,
)

sys.stdout.reconfigure(encoding="utf-8")

TARGETS = [
    ("小学", "数学", ["小学数学 应用题 解题技巧", "小学数学 分数 小数 百分数", "小学奥数 思维训练"]),
    ("小学", "语文", ["小学语文 阅读理解 答题技巧", "小学语文 作文 看图写话", "小学语文 古诗 讲解"]),
    ("小学", "英语", ["小学英语 自然拼读", "小学英语 语法 单词", "小学英语 听力 口语"]),
    ("初中", "数学", ["初中数学 二次函数 中考", "初中数学 几何证明", "初中数学 一次函数 方程"]),
    ("初中", "语文", ["初中语文 阅读理解 答题技巧", "初中语文 文言文 中考", "初中语文 作文 中考"]),
    ("初中", "英语", ["初中英语 语法 时态", "初中英语 阅读理解 中考", "初中英语 单词 词汇"]),
    ("初中", "物理", ["初中物理 电学 电路 中考", "初中物理 力学 浮力 压强", "初中物理 光学 声学"]),
    ("初中", "化学", ["初中化学 酸碱盐 中考", "初中化学 方程式 计算", "初中化学 实验"]),
    ("高中", "数学", ["高中数学 数列 高考", "高中数学 圆锥曲线 高考", "高中数学 三角函数 高考"]),
    ("高中", "英语", ["高中英语 阅读理解 高考", "高中英语 完形填空 高考", "高中英语 写作 高考"]),
    ("大学", "高等数学", ["高等数学 同济版 极限 导数", "高等数学 积分 期末", "考研数学 高等数学"]),
    ("大学", "计算机类", ["数据结构 考研 课程", "操作系统 考研 课程", "计算机网络 考研 课程"]),
]


def load_existing(path):
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def is_detail_url(url):
    return url.startswith("https://www.bilibili.com/video/BV")


def append_videos(existing, per_target=6):
    opener = create_opener()
    get_cookies(opener)
    seen = {item.get("id") for item in existing}
    seen.update(item.get("url", "").rstrip("/").rsplit("/", 1)[-1] for item in existing)
    added = []

    for level, subject, keywords in TARGETS:
      collected = 0
      for keyword in keywords:
        for item in search_bili(opener, f"{keyword} 教学 知识点", page=1):
            bvid = item.get("bvid", "")
            if not bvid or bvid in seen:
                continue
            title = clean_title(item.get("title", ""))
            tag = item.get("tag", "") or ""
            author = item.get("author", "") or ""
            description = item.get("description", "") or ""
            play = item.get("play", 0) or 0
            if play < 5000 or len(title) < 6:
                continue
            if not is_educational(title, tag, author, description):
                continue
            if not is_subject_relevant(title, tag, description, subject):
                continue
            video = {
                "id": f"bili_{bvid}",
                "title": title,
                "subject": subject,
                "knowledge": tag or keyword,
                "url": f"https://www.bilibili.com/video/{bvid}",
                "source": "bilibili",
                "publisher": author,
                "duration": item.get("duration", "") or "",
                "play": play,
                "level": level,
            }
            if not is_detail_url(video["url"]):
                continue
            existing.append(video)
            added.append(video)
            seen.add(bvid)
            collected += 1
            if collected >= per_target:
                break
        if collected >= per_target:
            break
        time.sleep(0.4)

    return added


if __name__ == "__main__":
    output_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "data", "educational-videos.json")
    videos = load_existing(output_path)
    added = append_videos(videos)
    if not added:
        raise SystemExit("未获取到新的 B 站视频详情链接，保留现有数据。")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(videos, f, ensure_ascii=False, indent=2)
    print(f"追加 {len(added)} 个视频详情链接，当前共 {len(videos)} 个。")
