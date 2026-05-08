"""
Quick probe of the data API to verify config and inspect response shapes.

Reads token + data API URL from config.json (next to this file).
Run:
    python probe.py
"""
from __future__ import annotations

import json
import ssl
import sys
import urllib.parse
import urllib.request
from pathlib import Path

CONFIG_PATH = Path(__file__).resolve().parent / "config.json"


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        sys.exit("config.json not found. Start app.py once or copy config.example.json to config.json.")
    cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    if not (cfg.get("upstream") or "").strip():
        sys.exit("config.json: 'upstream' is empty. Open /settings in the browser to set it.")
    if not (cfg.get("token") or "").strip():
        sys.exit("config.json: 'token' is empty. Open /settings in the browser to set it.")
    return cfg


def call(cfg: dict, path: str, params: dict | None = None) -> dict | list:
    url = cfg["upstream"].rstrip("/") + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        "X-My-Token": cfg["token"],
        "Accept-Encoding": "identity",
    })
    ctx = ssl.create_default_context()
    if not cfg.get("verifyTls"):
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
        raw = resp.read()
    return json.loads(raw)


def show(label: str, data, limit: int = 4000) -> None:
    print("=" * 80)
    print(label)
    print("-" * 80)
    text = json.dumps(data, indent=2, ensure_ascii=False)
    if len(text) > limit:
        text = text[:limit] + "\n... [truncated]"
    print(text)


if __name__ == "__main__":
    cfg = load_config()
    show("stats", call(cfg, "/chaindata/polymarket/stats"))
    show("top-events?period=1d", call(cfg, "/chaindata/polymarket/top-events", {"period": "1d", "limit": 3}))
    show("events?active=true", call(cfg, "/chaindata/polymarket/events", {"active": "true", "limit": 3}))
    show("leaderboard?period=1d", call(cfg, "/chaindata/polymarket/leaderboard", {"period": "1d", "limit": 3}))
    show("activity?eventType=trade", call(cfg, "/chaindata/polymarket/activity", {"eventType": "trade", "limit": 3}))
