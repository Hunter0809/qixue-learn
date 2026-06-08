# -*- coding: utf-8 -*-
import json
import sys
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")


def reachable(url):
    headers = {"User-Agent": "Mozilla/5.0"}
    for method in ("HEAD", "GET"):
        try:
            req = urllib.request.Request(url, headers=headers, method=method)
            with urllib.request.urlopen(req, timeout=12) as resp:
                return 200 <= resp.status < 400
        except Exception:
            continue
    return False


def verify_file(path):
    with open(path, "r", encoding="utf-8") as f:
        items = json.load(f)
    bad = []
    for item in items:
        url = item.get("url", "")
        if not reachable(url):
            bad.append((item.get("id"), url))
    return len(items), bad


if __name__ == "__main__":
    for path in sys.argv[1:]:
        total, bad = verify_file(path)
        print(f"{path}: {total - len(bad)}/{total} reachable")
        for item_id, url in bad:
            print(f"  BAD {item_id}: {url}")
        if bad:
            raise SystemExit(1)
