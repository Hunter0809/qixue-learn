# -*- coding: utf-8 -*-
"""Download real white-noise ambience recordings used by the Pomodoro module."""

from __future__ import annotations

import os
import urllib.parse
import urllib.request


ROOT = os.path.dirname(os.path.dirname(__file__))
OUT_DIR = os.path.join(ROOT, "public", "audio", "white-noise")

FILES = [
    {
        "id": "rain",
        "filename": "Rain.ogg",
        "source": "https://commons.wikimedia.org/wiki/File:Rain.ogg",
        "target": "rain.ogg",
    },
    {
        "id": "waves",
        "filename": "Waves.ogg",
        "source": "https://commons.wikimedia.org/wiki/File:Waves.ogg",
        "target": "waves.ogg",
    },
    {
        "id": "campfire",
        "filename": "Campfire sound ambience.ogg",
        "source": "https://commons.wikimedia.org/wiki/File:Campfire_sound_ambience.ogg",
        "target": "campfire.ogg",
    },
    {
        "id": "forest",
        "filename": "20090610 0 ambience.ogg",
        "direct": "https://upload.wikimedia.org/wikipedia/commons/0/0a/20090610_0_ambience.ogg",
        "source": "https://commons.wikimedia.org/wiki/File:20090610_0_ambience.ogg",
        "target": "forest.ogg",
    },
    {
        "id": "cafe",
        "filename": "Restaurant ambience.ogg",
        "direct": "https://upload.wikimedia.org/wikipedia/commons/b/b5/Restaurant_ambience.ogg",
        "source": "https://commons.wikimedia.org/wiki/File:Restaurant_ambience.ogg",
        "target": "cafe.ogg",
    },
]


def redirect_url(filename: str) -> str:
    return "https://commons.wikimedia.org/wiki/Special:Redirect/file/" + urllib.parse.quote(filename)


def download_file(item: dict[str, str]) -> None:
    target = os.path.join(OUT_DIR, item["target"])
    if os.path.exists(target) and os.path.getsize(target) > 0:
      print(f"{item['id']}: kept existing {target}")
      return
    req = urllib.request.Request(
        item.get("direct") or redirect_url(item["filename"]),
        headers={"User-Agent": "QixueLearningOS/1.0 (educational ambience downloader)"},
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        data = response.read()
    if not data.startswith(b"OggS"):
        raise RuntimeError(f"{item['filename']} did not download as an Ogg file")
    with open(target, "wb") as handle:
        handle.write(data)
    print(f"{item['id']}: {len(data)} bytes <- {item['source']}")


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for item in FILES:
        download_file(item)


if __name__ == "__main__":
    main()
