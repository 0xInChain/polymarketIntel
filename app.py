"""
Polymarket Intel - 一个开源的 Polymarket 链上预测市场情报看板.

启动:
    1. pip install -r requirements.txt
    2. python app.py
    3. 浏览器打开 http://localhost:5000/settings 填入数据 API 地址与访问令牌
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

import requests
import urllib3
from flask import Flask, Response, abort, jsonify, render_template, request

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config.json"
CONFIG_EXAMPLE_PATH = ROOT / "config.example.json"

DEFAULT_CONFIG: dict[str, Any] = {
    "upstream": "",
    "token": "",
    "host": "127.0.0.1",
    "port": 5000,
    "verifyTls": False,
    "lang": "zh",
}

# 数据 API 路径白名单 (避免本网关被滥用为开放代理)
ALLOWED_PREFIXES: tuple[str, ...] = (
    "chaindata/polymarket/",
    "chaindata/intelligence/address",
    "chaindata/intelligence/entity",
    "chaindata/intelligence/search",
    "account/balance",
)

# 配置缓存 + 文件 mtime, 实现热重载
_cfg_cache: dict[str, Any] = {}
_cfg_mtime: float = 0.0


def _load_config_from_disk() -> dict[str, Any]:
    if not CONFIG_PATH.exists():
        CONFIG_PATH.write_text(
            json.dumps(DEFAULT_CONFIG, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
    try:
        raw = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        raw = {}
    merged = {**DEFAULT_CONFIG, **raw}
    # 环境变量优先, 便于 docker / CI 注入
    if os.environ.get("POLY_TOKEN"):
        merged["token"] = os.environ["POLY_TOKEN"].strip()
    if os.environ.get("POLY_UPSTREAM"):
        merged["upstream"] = os.environ["POLY_UPSTREAM"].strip()
    if os.environ.get("POLY_VERIFY_TLS"):
        merged["verifyTls"] = os.environ["POLY_VERIFY_TLS"] == "1"
    return merged


def get_config() -> dict[str, Any]:
    global _cfg_cache, _cfg_mtime
    if not CONFIG_PATH.exists():
        _cfg_cache = _load_config_from_disk()
        _cfg_mtime = CONFIG_PATH.stat().st_mtime
        return _cfg_cache
    mtime = CONFIG_PATH.stat().st_mtime
    if mtime != _cfg_mtime or not _cfg_cache:
        _cfg_cache = _load_config_from_disk()
        _cfg_mtime = mtime
    return _cfg_cache


def save_config(patch: dict[str, Any]) -> dict[str, Any]:
    global _cfg_cache, _cfg_mtime
    current = get_config()
    merged = {**current, **{k: v for k, v in patch.items() if k in DEFAULT_CONFIG}}
    CONFIG_PATH.write_text(
        json.dumps(merged, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    _cfg_cache = merged
    _cfg_mtime = CONFIG_PATH.stat().st_mtime
    return merged


def _is_local_request() -> bool:
    addr = request.remote_addr or ""
    return addr in ("127.0.0.1", "::1", "localhost")


urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(__name__, static_folder="static", template_folder="templates")


def _proxy(path: str) -> Response:
    if not any(path.startswith(p) for p in ALLOWED_PREFIXES):
        abort(403, description=f"path not allowed: {path}")

    cfg = get_config()
    api_base = (cfg.get("upstream") or "").rstrip("/")
    token = (cfg.get("token") or "").strip()
    if not api_base or not token:
        return Response(
            json.dumps({"error": "not_configured", "detail": "请前往 /settings 配置数据 API 地址与访问令牌"}),
            status=503,
            mimetype="application/json",
        )

    url = f"{api_base}/{path}"
    try:
        resp = requests.get(
            url,
            headers={
                "X-My-Token": token,
                "Accept": "application/json",
                "User-Agent": "polymarket-intel/1.0",
            },
            params=request.args,
            verify=bool(cfg.get("verifyTls")),
            timeout=30,
        )
    except requests.RequestException as exc:
        return Response(
            json.dumps({"error": "data_api_request_failed", "detail": str(exc)}),
            status=502,
            mimetype="application/json",
        )

    body = resp.content  # requests 已自动解 gzip
    content_type = resp.headers.get("Content-Type", "application/json")
    return Response(body, status=resp.status_code, mimetype=content_type)


# ---------- API 路由 ----------
@app.get("/api/<path:path>")
def api_proxy(path: str) -> Response:
    return _proxy(path)


@app.get("/api/config")
def api_get_config() -> Response:
    cfg = get_config()
    # 返回完整配置, 仅本机可见
    if not _is_local_request():
        abort(403, description="settings only available from localhost")
    return jsonify({
        "upstream": cfg.get("upstream", ""),
        "token": cfg.get("token", ""),
        "host": cfg.get("host", "127.0.0.1"),
        "port": cfg.get("port", 5000),
        "verifyTls": bool(cfg.get("verifyTls")),
        "lang": cfg.get("lang", "zh"),
        "configured": bool((cfg.get("upstream") or "").strip() and (cfg.get("token") or "").strip()),
    })


@app.post("/api/config")
def api_post_config() -> Response:
    if not _is_local_request():
        abort(403, description="settings only available from localhost")
    payload = request.get_json(force=True, silent=True) or {}
    patch: dict[str, Any] = {}
    if "upstream" in payload:
        patch["upstream"] = str(payload["upstream"]).strip()
    if "token" in payload:
        patch["token"] = str(payload["token"]).strip()
    if "verifyTls" in payload:
        patch["verifyTls"] = bool(payload["verifyTls"])
    if "lang" in payload:
        lang = str(payload["lang"]).strip().lower()
        if lang in ("zh", "en"):
            patch["lang"] = lang
    if "host" in payload:
        patch["host"] = str(payload["host"]).strip() or "127.0.0.1"
    if "port" in payload:
        try:
            patch["port"] = int(payload["port"])
        except (TypeError, ValueError):
            pass
    merged = save_config(patch)
    return jsonify({"ok": True, "configured": bool(merged.get("upstream") and merged.get("token"))})


@app.get("/api/health")
def api_health() -> Response:
    cfg = get_config()
    return jsonify({
        "ok": True,
        "configured": bool((cfg.get("upstream") or "").strip() and (cfg.get("token") or "").strip()),
        "ts": int(time.time()),
    })


# ---------- 页面路由 ----------
@app.get("/")
def index() -> str:
    return render_template("index.html")


@app.get("/settings")
def settings_page() -> str:
    return render_template("settings.html")


@app.get("/trader/<addr>")
def trader_page(addr: str) -> str:
    return render_template("trader.html", addr=addr)


@app.get("/market/<condition_id>")
def market_page(condition_id: str) -> str:
    return render_template("market.html", condition_id=condition_id)


@app.get("/event/<int:event_id>")
def event_page(event_id: int) -> str:
    return render_template("event.html", event_id=event_id)


# ---------- 错误处理 ----------
@app.errorhandler(403)
def forbidden(err: Any):
    return Response(
        json.dumps({"error": "forbidden", "detail": getattr(err, "description", "forbidden")}),
        status=403,
        mimetype="application/json",
    )


if __name__ == "__main__":
    cfg = get_config()
    host = cfg.get("host", "127.0.0.1")
    port = int(cfg.get("port", 5000))
    print(f"[polymarket-intel] config = {CONFIG_PATH}")
    print(f"[polymarket-intel] configured = {bool(cfg.get('upstream') and cfg.get('token'))}")
    print(f"[polymarket-intel] listening on http://{host}:{port}")
    app.run(host=host, port=port, debug=False)
