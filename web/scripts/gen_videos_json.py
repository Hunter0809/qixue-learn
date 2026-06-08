# -*- coding: utf-8 -*-
"""Generate educational video JSON from real Bilibili video detail results."""
import json
import os
import sys

from crawl_educational_videos import crawl

sys.stdout.reconfigure(encoding="utf-8")


def is_bilibili_detail_url(url: str) -> bool:
    return url.startswith("https://www.bilibili.com/video/BV")


if __name__ == "__main__":
    videos = [video for video in crawl() if is_bilibili_detail_url(video.get("url", ""))]
    if not videos:
        raise SystemExit("未抓取到任何 B 站视频详情链接，停止写入，避免覆盖已有有效数据。")

    out_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "data")
    os.makedirs(out_dir, exist_ok=True)
    output_path = os.path.join(out_dir, "educational-videos.json")

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(videos, f, ensure_ascii=False, indent=2)

    print(f"生成 {len(videos)} 个 B 站视频详情链接 -> {output_path}")
