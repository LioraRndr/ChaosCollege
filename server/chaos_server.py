#!/usr/bin/env python3
"""CHAOS.COLLAGE cloud server.

Serves the static editor and a small JSON/binary API that stores each user's
projects, image assets, thumbnails and imported fonts on disk, with account
metadata in SQLite. Python standard library only: no pip install needed.

Run:    python3 server/chaos_server.py
Admin:  python3 server/chaos_server.py admin --help
Config: environment variables, see CONFIG below and docs/DEPLOY.md.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import shutil
import sqlite3
import sys
import threading
import time
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

APP_ROOT = Path(__file__).resolve().parent.parent
VERSION = "1.0.0"


def env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


CONFIG = {
    "host": os.environ.get("CC_HOST", "127.0.0.1"),
    "port": env_int("CC_PORT", 8080),
    "data": Path(os.environ.get("CC_DATA", APP_ROOT / "data")).resolve(),
    # public sign-up; CC_INVITE_CODE, when set, is required to register
    "allow_signup": env_bool("CC_ALLOW_SIGNUP", True),
    "invite_code": os.environ.get("CC_INVITE_CODE", ""),
    "max_users": env_int("CC_MAX_USERS", 0),  # 0 = unlimited
    "user_quota": env_int("CC_USER_QUOTA_MB", 500) * 1024 * 1024,
    "max_upload": env_int("CC_MAX_UPLOAD_MB", 40) * 1024 * 1024,
    "session_days": env_int("CC_SESSION_DAYS", 30),
    # trust X-Forwarded-For / X-Forwarded-Proto from a reverse proxy (Caddy)
    "trust_proxy": env_bool("CC_TRUST_PROXY", False),
    # "auto": Secure cookie when the request arrived over https
    "secure_cookie": os.environ.get("CC_SECURE_COOKIE", "auto").lower(),
}

SESSION_COOKIE = "cc_session"
ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
USERNAME_RE = re.compile(r"^[\w.-]{2,32}$", re.UNICODE)
JSON_LIMIT = 16 * 1024 * 1024
STATIC_FILES = {"index.html", "styles.css", "app.js", "manifest.webmanifest"}
STATIC_DIRS = {"js", "assets"}
WRITE_LOCK = threading.Lock()

CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data: blob:",
    "connect-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
])


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


# --------------------------------------------------------------------------
# storage
# --------------------------------------------------------------------------

SCHEMA = """
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pw_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  quota_bytes INTEGER,
  disabled INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  rev INTEGER NOT NULL DEFAULT 1,
  file_name TEXT NOT NULL DEFAULT '',
  layer_count INTEGER NOT NULL DEFAULT 0,
  doc_bytes INTEGER NOT NULL DEFAULT 0,
  thumb_bytes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);
CREATE TABLE IF NOT EXISTS assets (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL,
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  size INTEGER NOT NULL,
  PRIMARY KEY (user_id, project_id, id)
);
CREATE TABLE IF NOT EXISTS fonts (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  family TEXT NOT NULL,
  file_name TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);
"""


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(CONFIG["data"] / "chaos.db", timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_storage() -> None:
    CONFIG["data"].mkdir(parents=True, exist_ok=True)
    (CONFIG["data"] / "users").mkdir(exist_ok=True)
    with db() as conn:
        conn.executescript(SCHEMA)


def user_dir(user_id: int) -> Path:
    return CONFIG["data"] / "users" / str(int(user_id))


def check_id(value: str, what: str = "id") -> str:
    if not value or not ID_RE.match(value):
        raise ApiError(400, "bad_id", f"无效的 {what}")
    return value


def write_file(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{secrets.token_hex(4)}.tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)


def remove_path(path: Path) -> None:
    if path.is_dir():
        shutil.rmtree(path, ignore_errors=True)
    elif path.exists():
        path.unlink(missing_ok=True)


def now_ms() -> int:
    return int(time.time() * 1000)


# --------------------------------------------------------------------------
# passwords, sessions, rate limits
# --------------------------------------------------------------------------

SCRYPT = {"n": 2 ** 14, "r": 8, "p": 1}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, dklen=32, **SCRYPT)
    return f"scrypt${SCRYPT['n']}${SCRYPT['r']}${SCRYPT['p']}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt, digest = stored.split("$")
        if scheme != "scrypt":
            return False
        candidate = hashlib.scrypt(password.encode("utf-8"), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p), dklen=32)
        return hmac.compare_digest(candidate.hex(), digest)
    except (ValueError, TypeError):
        return False


DUMMY_HASH = hash_password(secrets.token_hex(8))


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("ascii", "ignore")).hexdigest()


class RateLimiter:
    """Sliding-window counter per key, in memory."""

    def __init__(self) -> None:
        self.events: dict[str, list[float]] = {}
        self.lock = threading.Lock()

    def hit(self, key: str, limit: int, window: float) -> bool:
        stamp = time.monotonic()
        with self.lock:
            recent = [t for t in self.events.get(key, []) if stamp - t < window]
            allowed = len(recent) < limit
            if allowed:
                recent.append(stamp)
            self.events[key] = recent
            if len(self.events) > 50000:
                self.events = {k: v for k, v in self.events.items() if v and stamp - v[-1] < 3600}
            return allowed


LIMITER = RateLimiter()


def validate_password(password: str) -> None:
    if not isinstance(password, str) or len(password) < 8:
        raise ApiError(400, "weak_password", "密码至少 8 位")
    if len(password) > 200:
        raise ApiError(400, "weak_password", "密码太长")


def create_user(username: str, password: str) -> int:
    username = (username or "").strip()
    if not USERNAME_RE.match(username):
        raise ApiError(400, "bad_username", "用户名需 2–32 位，可用中文、字母、数字、下划线、点和短横线")
    validate_password(password)
    with WRITE_LOCK, db() as conn:
        if CONFIG["max_users"] and conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] >= CONFIG["max_users"]:
            raise ApiError(403, "signup_full", "注册名额已满")
        try:
            cur = conn.execute(
                "INSERT INTO users (username, pw_hash, created_at) VALUES (?, ?, ?)",
                (username, hash_password(password), now_ms()),
            )
        except sqlite3.IntegrityError:
            raise ApiError(409, "username_taken", "用户名已被占用") from None
        return int(cur.lastrowid)


def user_quota(row: sqlite3.Row) -> int:
    return int(row["quota_bytes"]) if row["quota_bytes"] is not None else CONFIG["user_quota"]


def usage_bytes(conn: sqlite3.Connection, user_id: int) -> int:
    total = conn.execute("SELECT COALESCE(SUM(doc_bytes + thumb_bytes), 0) FROM projects WHERE user_id = ?", (user_id,)).fetchone()[0]
    total += conn.execute("SELECT COALESCE(SUM(size), 0) FROM assets WHERE user_id = ?", (user_id,)).fetchone()[0]
    total += conn.execute("SELECT COALESCE(SUM(size), 0) FROM fonts WHERE user_id = ?", (user_id,)).fetchone()[0]
    return int(total)


def ensure_quota(conn: sqlite3.Connection, user: sqlite3.Row, adding: int, replacing: int = 0) -> None:
    if adding <= replacing:
        return
    if usage_bytes(conn, user["id"]) - replacing + adding > user_quota(user):
        raise ApiError(413, "quota_exceeded", "云端空间已满：请删除不用的工程或图片，或联系管理员扩容")


# --------------------------------------------------------------------------
# HTTP handler
# --------------------------------------------------------------------------


class Handler(BaseHTTPRequestHandler):
    server_version = "ChaosCollege"
    sys_version = ""
    protocol_version = "HTTP/1.1"

    # ---- plumbing ----

    def log_message(self, fmt: str, *args) -> None:  # noqa: D401 - stdlib signature
        sys.stderr.write(f"{self.client_ip()} - {fmt % args}\n")

    def client_ip(self) -> str:
        if CONFIG["trust_proxy"]:
            forwarded = self.headers.get("X-Forwarded-For", "")
            if forwarded:
                return forwarded.split(",")[0].strip()
        return self.client_address[0]

    def is_https(self) -> bool:
        if CONFIG["trust_proxy"]:
            return self.headers.get("X-Forwarded-Proto", "").lower() == "https"
        return False

    def common_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy", CSP)
        if self.is_https():
            self.send_header("Strict-Transport-Security", "max-age=31536000")

    def send_bytes(self, status: int, body: bytes, content_type: str, extra: dict | None = None) -> None:
        self.send_response(status)
        self.common_headers()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        if self.close_connection:
            self.send_header("Connection", "close")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_json(self, status: int, payload, extra: dict | None = None) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers = {"Cache-Control": "no-store"}
        headers.update(extra or {})
        self.send_bytes(status, body, "application/json; charset=utf-8", headers)

    def send_error_json(self, error: ApiError) -> None:
        self.send_json(error.status, {"error": error.code, "message": error.message})

    def read_body(self, limit: int) -> bytes:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ApiError(400, "bad_length", "Content-Length 无效") from None
        if length < 0:
            raise ApiError(400, "bad_length", "Content-Length 无效")
        if length > limit:
            self.close_connection = True
            raise ApiError(413, "too_large", f"上传内容超过 {limit // (1024 * 1024)} MB 上限")
        return self.rfile.read(length) if length else b""

    def read_json(self) -> dict:
        raw = self.read_body(JSON_LIMIT)
        try:
            value = json.loads(raw.decode("utf-8") or "{}")
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ApiError(400, "bad_json", "请求不是有效的 JSON") from None
        if not isinstance(value, dict):
            raise ApiError(400, "bad_json", "请求不是 JSON 对象")
        return value

    # ---- sessions ----

    def session_token(self) -> str:
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
        except Exception:  # malformed cookie header
            return ""
        morsel = cookie.get(SESSION_COOKIE)
        return morsel.value if morsel else ""

    def current_user(self) -> sqlite3.Row | None:
        token = self.session_token()
        if not token:
            return None
        with db() as conn:
            row = conn.execute(
                "SELECT users.*, sessions.expires_at FROM sessions JOIN users ON users.id = sessions.user_id "
                "WHERE sessions.token_hash = ?",
                (token_hash(token),),
            ).fetchone()
            if not row or row["disabled"] or row["expires_at"] < now_ms():
                return None
            # sliding expiry, refreshed at most once a day
            fresh = now_ms() + CONFIG["session_days"] * 86400000
            if fresh - row["expires_at"] > 86400000:
                conn.execute("UPDATE sessions SET expires_at = ? WHERE token_hash = ?", (fresh, token_hash(token)))
            return row

    def require_user(self) -> sqlite3.Row:
        user = self.current_user()
        if not user:
            raise ApiError(401, "unauthorized", "请先登录")
        return user

    def cookie_header(self, token: str, max_age: int) -> str:
        secure = CONFIG["secure_cookie"] == "true" or (CONFIG["secure_cookie"] == "auto" and self.is_https())
        parts = [f"{SESSION_COOKIE}={token}", "Path=/", "HttpOnly", "SameSite=Lax", f"Max-Age={max_age}"]
        if secure:
            parts.append("Secure")
        return "; ".join(parts)

    def start_session(self, user_id: int) -> dict:
        token = secrets.token_urlsafe(32)
        expires = now_ms() + CONFIG["session_days"] * 86400000
        with WRITE_LOCK, db() as conn:
            conn.execute("DELETE FROM sessions WHERE expires_at < ?", (now_ms(),))
            conn.execute(
                "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                (token_hash(token), user_id, now_ms(), expires),
            )
        return {"Set-Cookie": self.cookie_header(token, CONFIG["session_days"] * 86400)}

    # ---- CSRF: API writes must come from our own scripts ----

    def check_write_origin(self) -> None:
        if self.headers.get("X-Requested-With") != "chaos-collage":
            raise ApiError(403, "csrf", "请求来源无效")
        origin = self.headers.get("Origin")
        if origin:
            host = self.headers.get("X-Forwarded-Host") if CONFIG["trust_proxy"] else None
            host = host or self.headers.get("Host", "")
            if urlparse(origin).netloc != host:
                raise ApiError(403, "csrf", "请求来源无效")

    # ---- dispatch ----

    def do_GET(self) -> None:
        self.dispatch("GET")

    def do_HEAD(self) -> None:
        self.dispatch("HEAD")

    def do_POST(self) -> None:
        self.dispatch("POST")

    def do_PUT(self) -> None:
        self.dispatch("PUT")

    def do_PATCH(self) -> None:
        self.dispatch("PATCH")

    def do_DELETE(self) -> None:
        self.dispatch("DELETE")

    def dispatch(self, method: str) -> None:
        url = urlparse(self.path)
        path = unquote(url.path)
        try:
            if path.startswith("/api/"):
                if method not in {"GET", "HEAD"}:
                    self.check_write_origin()
                self.route_api(method if method != "HEAD" else "GET", path[len("/api"):], parse_qs(url.query))
            elif method in {"GET", "HEAD"}:
                self.serve_static(path)
            else:
                raise ApiError(405, "method", "不支持的请求方法")
        except ApiError as error:
            # a rejected write may leave its body unread on the socket
            if method not in {"GET", "HEAD"}:
                self.close_connection = True
            self.send_error_json(error)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as error:  # last resort; keep the server alive
            sys.stderr.write(f"internal error on {method} {path}: {error!r}\n")
            self.close_connection = True
            try:
                self.send_error_json(ApiError(500, "internal", "服务器内部错误"))
            except Exception:
                pass

    # ---- static files ----

    def serve_static(self, path: str) -> None:
        rel = path.lstrip("/") or "index.html"
        parts = Path(rel).parts
        allowed = rel in STATIC_FILES or (len(parts) > 1 and parts[0] in STATIC_DIRS)
        if not allowed or ".." in parts or any(part.startswith(".") for part in parts):
            raise ApiError(404, "not_found", "未找到")
        file = (APP_ROOT / rel).resolve()
        if APP_ROOT not in file.parents or not file.is_file():
            raise ApiError(404, "not_found", "未找到")
        stat = file.stat()
        etag = f'"{int(stat.st_mtime)}-{stat.st_size}"'
        if self.headers.get("If-None-Match") == etag:
            self.send_response(304)
            self.common_headers()
            self.send_header("ETag", etag)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        ctype = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in {"application/javascript", "image/svg+xml"}:
            ctype += "; charset=utf-8"
        self.send_bytes(200, file.read_bytes(), ctype, {"ETag": etag, "Cache-Control": "no-cache"})

    # ---- API ----

    def route_api(self, method: str, path: str, query: dict) -> None:
        seg = [part for part in path.split("/") if part]
        if seg == ["health"]:
            return self.send_json(200, {"ok": True, "version": VERSION})
        if seg == ["config"]:
            return self.send_json(200, {
                "cloud": True,
                "version": VERSION,
                "signup": CONFIG["allow_signup"],
                "invite": bool(CONFIG["invite_code"]),
                "maxUpload": CONFIG["max_upload"],
            })
        if seg[:1] == ["auth"]:
            return self.route_auth(method, seg[1:])
        user = self.require_user()
        if seg == ["usage"] and method == "GET":
            with db() as conn:
                return self.send_json(200, {"usage": usage_bytes(conn, user["id"]), "quota": user_quota(user)})
        if seg == ["account"] and method == "DELETE":
            return self.delete_account(user)
        if seg[:1] == ["projects"]:
            return self.route_projects(method, seg[1:], user)
        if seg[:1] == ["fonts"]:
            return self.route_fonts(method, seg[1:], user)
        raise ApiError(404, "not_found", "未找到")

    # auth

    def route_auth(self, method: str, seg: list[str]) -> None:
        ip = self.client_ip()
        if seg == ["me"] and method == "GET":
            user = self.current_user()
            if not user:
                return self.send_json(200, {"user": None})
            return self.send_json(200, {"user": {"id": user["id"], "username": user["username"]}})
        if seg == ["register"] and method == "POST":
            if not CONFIG["allow_signup"]:
                raise ApiError(403, "signup_closed", "本站暂未开放注册")
            if not LIMITER.hit(f"register:{ip}", 5, 3600):
                raise ApiError(429, "rate_limited", "注册太频繁，请稍后再试")
            body = self.read_json()
            if CONFIG["invite_code"] and not hmac.compare_digest(str(body.get("invite", "")), CONFIG["invite_code"]):
                raise ApiError(403, "bad_invite", "邀请码不正确")
            user_id = create_user(str(body.get("username", "")), str(body.get("password", "")))
            headers = self.start_session(user_id)
            return self.send_json(200, {"user": {"id": user_id, "username": str(body.get("username", "")).strip()}}, headers)
        if seg == ["login"] and method == "POST":
            body = self.read_json()
            username = str(body.get("username", "")).strip()
            if not LIMITER.hit(f"login-ip:{ip}", 30, 600) or not LIMITER.hit(f"login-user:{username.lower()}", 10, 600):
                raise ApiError(429, "rate_limited", "尝试次数太多，请 10 分钟后再试")
            with db() as conn:
                row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
            password = str(body.get("password", ""))
            if not row:
                verify_password(password, DUMMY_HASH)  # same timing as a real check
                raise ApiError(401, "bad_credentials", "用户名或密码不正确")
            if not verify_password(password, row["pw_hash"]):
                raise ApiError(401, "bad_credentials", "用户名或密码不正确")
            if row["disabled"]:
                raise ApiError(403, "disabled", "账号已被停用")
            headers = self.start_session(row["id"])
            return self.send_json(200, {"user": {"id": row["id"], "username": row["username"]}}, headers)
        if seg == ["logout"] and method == "POST":
            token = self.session_token()
            if token:
                with WRITE_LOCK, db() as conn:
                    conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(token),))
            return self.send_json(200, {"ok": True}, {"Set-Cookie": self.cookie_header("", 0)})
        if seg == ["password"] and method == "POST":
            user = self.require_user()
            body = self.read_json()
            if not LIMITER.hit(f"password:{user['id']}", 10, 600):
                raise ApiError(429, "rate_limited", "尝试次数太多，请稍后再试")
            if not verify_password(str(body.get("current", "")), user["pw_hash"]):
                raise ApiError(401, "bad_credentials", "当前密码不正确")
            validate_password(str(body.get("password", "")))
            token = self.session_token()
            with WRITE_LOCK, db() as conn:
                conn.execute("UPDATE users SET pw_hash = ? WHERE id = ?", (hash_password(str(body["password"])), user["id"]))
                # sign out every other device
                conn.execute("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?", (user["id"], token_hash(token)))
            return self.send_json(200, {"ok": True})
        raise ApiError(404, "not_found", "未找到")

    def delete_account(self, user: sqlite3.Row) -> None:
        body = self.read_json()
        if not LIMITER.hit(f"password:{user['id']}", 10, 600):
            raise ApiError(429, "rate_limited", "尝试次数太多，请稍后再试")
        if not verify_password(str(body.get("password", "")), user["pw_hash"]):
            raise ApiError(401, "bad_credentials", "密码不正确")
        purge_user(user["id"])
        self.send_json(200, {"ok": True}, {"Set-Cookie": self.cookie_header("", 0)})

    # projects

    def project_row(self, conn: sqlite3.Connection, user_id: int, pid: str) -> sqlite3.Row:
        row = conn.execute("SELECT * FROM projects WHERE user_id = ? AND id = ?", (user_id, pid)).fetchone()
        if not row:
            raise ApiError(404, "not_found", "工程不存在")
        return row

    def route_projects(self, method: str, seg: list[str], user: sqlite3.Row) -> None:
        uid = user["id"]
        base = user_dir(uid)
        if not seg:
            if method != "GET":
                raise ApiError(405, "method", "不支持的请求方法")
            with db() as conn:
                rows = conn.execute("SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC", (uid,)).fetchall()
            return self.send_json(200, {"projects": [project_summary(row) for row in rows]})

        pid = check_id(seg[0], "工程 ID")
        rest = seg[1:]
        doc_path = base / "projects" / f"{pid}.json"
        thumb_path = base / "thumbs" / f"{pid}.bin"

        if not rest:
            if method == "GET":
                with db() as conn:
                    row = self.project_row(conn, uid, pid)
                try:
                    doc = json.loads(doc_path.read_text("utf-8"))
                except (OSError, json.JSONDecodeError):
                    raise ApiError(500, "corrupt", "工程数据损坏") from None
                return self.send_json(200, {**project_summary(row), "doc": doc})
            if method == "PUT":
                return self.put_project(user, pid, doc_path)
            if method == "PATCH":
                body = self.read_json()
                name = str(body.get("name", "")).strip()[:120]
                if not name:
                    raise ApiError(400, "bad_name", "工程名不能为空")
                with WRITE_LOCK, db() as conn:
                    row = self.project_row(conn, uid, pid)
                    doc = json.loads(doc_path.read_text("utf-8"))
                    doc["name"] = name
                    raw = json.dumps(doc, ensure_ascii=False).encode("utf-8")
                    write_file(doc_path, raw)
                    conn.execute(
                        "UPDATE projects SET name = ?, updated_at = ?, rev = rev + 1, doc_bytes = ? WHERE user_id = ? AND id = ?",
                        (name, now_ms(), len(raw), uid, pid),
                    )
                    row = self.project_row(conn, uid, pid)
                return self.send_json(200, project_summary(row))
            if method == "DELETE":
                with WRITE_LOCK, db() as conn:
                    conn.execute("DELETE FROM projects WHERE user_id = ? AND id = ?", (uid, pid))
                    conn.execute("DELETE FROM assets WHERE user_id = ? AND project_id = ?", (uid, pid))
                remove_path(doc_path)
                remove_path(thumb_path)
                remove_path(base / "assets" / pid)
                return self.send_json(200, {"ok": True})
            raise ApiError(405, "method", "不支持的请求方法")

        if rest == ["thumb"]:
            if method == "GET":
                if not thumb_path.is_file():
                    raise ApiError(404, "not_found", "没有缩略图")
                return self.send_bytes(200, thumb_path.read_bytes(), "image/webp", {"Cache-Control": "private, no-cache"})
            if method == "PUT":
                data = self.read_body(2 * 1024 * 1024)
                with WRITE_LOCK, db() as conn:
                    row = self.project_row(conn, uid, pid)
                    ensure_quota(conn, user, len(data), row["thumb_bytes"])
                    write_file(thumb_path, data)
                    conn.execute("UPDATE projects SET thumb_bytes = ? WHERE user_id = ? AND id = ?", (len(data), uid, pid))
                return self.send_json(200, {"ok": True})
            raise ApiError(405, "method", "不支持的请求方法")

        if rest[:1] == ["assets"]:
            return self.route_assets(method, rest[1:], user, pid)
        raise ApiError(404, "not_found", "未找到")

    def put_project(self, user: sqlite3.Row, pid: str, doc_path: Path) -> None:
        uid = user["id"]
        body = self.read_json()
        doc = body.get("doc")
        if not isinstance(doc, dict) or not isinstance(doc.get("layers", []), list):
            raise ApiError(400, "bad_doc", "工程数据无效")
        doc["id"] = pid
        raw = json.dumps(doc, ensure_ascii=False).encode("utf-8")
        name = str(body.get("name") or doc.get("name") or "未命名").strip()[:120] or "未命名"

        def as_int(value, default=0):
            try:
                return int(value)
            except (TypeError, ValueError):
                return default

        base_rev = body.get("baseRev")
        with WRITE_LOCK, db() as conn:
            row = conn.execute("SELECT * FROM projects WHERE user_id = ? AND id = ?", (uid, pid)).fetchone()
            if row and base_rev is not None and not body.get("force") and as_int(base_rev, -1) != row["rev"]:
                raise ApiError(409, "conflict", "工程已在其他窗口或设备上修改")
            ensure_quota(conn, user, len(raw), row["doc_bytes"] if row else 0)
            write_file(doc_path, raw)
            stamp = as_int(body.get("updatedAt"), now_ms()) or now_ms()
            values = (
                name,
                max(1, as_int(body.get("width") or doc.get("width"), 1)),
                max(1, as_int(body.get("height") or doc.get("height"), 1)),
                stamp,
                str(body.get("fileName") or "")[:255],
                len(doc.get("layers") or []),
                len(raw),
            )
            if row:
                conn.execute(
                    "UPDATE projects SET name = ?, width = ?, height = ?, updated_at = ?, file_name = ?, layer_count = ?, doc_bytes = ?, rev = rev + 1 "
                    "WHERE user_id = ? AND id = ?",
                    (*values, uid, pid),
                )
            else:
                created = as_int(body.get("createdAt"), stamp) or stamp
                conn.execute(
                    "INSERT INTO projects (name, width, height, updated_at, file_name, layer_count, doc_bytes, user_id, id, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (*values, uid, pid, created),
                )
            row = self.project_row(conn, uid, pid)
        self.send_json(200, project_summary(row))

    # assets

    def route_assets(self, method: str, seg: list[str], user: sqlite3.Row, pid: str) -> None:
        uid = user["id"]
        folder = user_dir(uid) / "assets" / pid
        if not seg:
            if method != "GET":
                raise ApiError(405, "method", "不支持的请求方法")
            with db() as conn:
                self.project_row(conn, uid, pid)
                rows = conn.execute("SELECT * FROM assets WHERE user_id = ? AND project_id = ?", (uid, pid)).fetchall()
            return self.send_json(200, {"assets": [asset_meta(row) for row in rows]})
        if seg[0] == "copy-from" and len(seg) == 2 and method == "POST":
            source = check_id(seg[1], "工程 ID")
            with WRITE_LOCK, db() as conn:
                self.project_row(conn, uid, pid)
                self.project_row(conn, uid, source)
                rows = conn.execute("SELECT * FROM assets WHERE user_id = ? AND project_id = ?", (uid, source)).fetchall()
                ensure_quota(conn, user, sum(row["size"] for row in rows))
                for row in rows:
                    src = user_dir(uid) / "assets" / source / row["id"]
                    if not src.is_file():
                        continue
                    write_file(folder / row["id"], src.read_bytes())
                    conn.execute(
                        "INSERT OR REPLACE INTO assets (user_id, project_id, id, name, mime, width, height, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        (uid, pid, row["id"], row["name"], row["mime"], row["width"], row["height"], row["size"]),
                    )
                src_thumb = user_dir(uid) / "thumbs" / f"{source}.bin"
                dst_thumb = user_dir(uid) / "thumbs" / f"{pid}.bin"
                if src_thumb.is_file() and not dst_thumb.is_file():
                    data = src_thumb.read_bytes()
                    write_file(dst_thumb, data)
                    conn.execute("UPDATE projects SET thumb_bytes = ? WHERE user_id = ? AND id = ?", (len(data), uid, pid))
            return self.send_json(200, {"copied": len(rows)})
        aid = check_id(seg[0], "资源 ID")
        path = folder / aid
        if method == "GET":
            with db() as conn:
                row = conn.execute("SELECT * FROM assets WHERE user_id = ? AND project_id = ? AND id = ?", (uid, pid, aid)).fetchone()
            if not row or not path.is_file():
                raise ApiError(404, "not_found", "资源不存在")
            return self.send_bytes(200, path.read_bytes(), safe_mime(row["mime"], "image/png"), UPLOAD_HEADERS)
        if method == "PUT":
            data = self.read_body(CONFIG["max_upload"])
            mime = clean_mime(self.headers.get("Content-Type", ""))
            if not mime.startswith("image/"):
                raise ApiError(415, "bad_type", "只能上传图片")
            name = unquote(self.headers.get("X-Asset-Name", ""))[:200]
            width = header_int(self.headers.get("X-Asset-Width"))
            height = header_int(self.headers.get("X-Asset-Height"))
            with WRITE_LOCK, db() as conn:
                self.project_row(conn, uid, pid)
                old = conn.execute("SELECT size FROM assets WHERE user_id = ? AND project_id = ? AND id = ?", (uid, pid, aid)).fetchone()
                ensure_quota(conn, user, len(data), old["size"] if old else 0)
                write_file(path, data)
                conn.execute(
                    "INSERT OR REPLACE INTO assets (user_id, project_id, id, name, mime, width, height, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (uid, pid, aid, name, mime, width, height, len(data)),
                )
            return self.send_json(200, {"ok": True})
        if method == "DELETE":
            with WRITE_LOCK, db() as conn:
                conn.execute("DELETE FROM assets WHERE user_id = ? AND project_id = ? AND id = ?", (uid, pid, aid))
            remove_path(path)
            return self.send_json(200, {"ok": True})
        raise ApiError(405, "method", "不支持的请求方法")

    # fonts

    def route_fonts(self, method: str, seg: list[str], user: sqlite3.Row) -> None:
        uid = user["id"]
        folder = user_dir(uid) / "fonts"
        if not seg:
            if method != "GET":
                raise ApiError(405, "method", "不支持的请求方法")
            with db() as conn:
                rows = conn.execute("SELECT * FROM fonts WHERE user_id = ? ORDER BY added_at", (uid,)).fetchall()
            return self.send_json(200, {"fonts": [font_meta(row) for row in rows]})
        fid = check_id(seg[0], "字体 ID")
        path = folder / fid
        if method == "GET":
            with db() as conn:
                row = conn.execute("SELECT * FROM fonts WHERE user_id = ? AND id = ?", (uid, fid)).fetchone()
            if not row or not path.is_file():
                raise ApiError(404, "not_found", "字体不存在")
            return self.send_bytes(200, path.read_bytes(), "application/octet-stream", UPLOAD_HEADERS)
        if method == "PUT":
            data = self.read_body(CONFIG["max_upload"])
            family = unquote(self.headers.get("X-Font-Family", "")).strip()[:120]
            if not family:
                raise ApiError(400, "bad_font", "缺少字体名")
            file_name = unquote(self.headers.get("X-Font-File", ""))[:200]
            mime = clean_mime(self.headers.get("Content-Type", "")) or "font/ttf"
            with WRITE_LOCK, db() as conn:
                old = conn.execute("SELECT size FROM fonts WHERE user_id = ? AND id = ?", (uid, fid)).fetchone()
                ensure_quota(conn, user, len(data), old["size"] if old else 0)
                write_file(path, data)
                conn.execute(
                    "INSERT OR REPLACE INTO fonts (user_id, id, family, file_name, mime, size, added_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (uid, fid, family, file_name, mime, len(data), header_int(self.headers.get("X-Font-Added")) or now_ms()),
                )
            return self.send_json(200, {"ok": True})
        if method == "DELETE":
            with WRITE_LOCK, db() as conn:
                conn.execute("DELETE FROM fonts WHERE user_id = ? AND id = ?", (uid, fid))
            remove_path(path)
            return self.send_json(200, {"ok": True})
        raise ApiError(405, "method", "不支持的请求方法")


def header_int(value) -> int:
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


# Uploaded bytes are fetched by the editor and wrapped in a Blob with the
# stored type; served directly they are always a download, never a page.
UPLOAD_HEADERS = {"Cache-Control": "private, max-age=31536000, immutable", "Content-Disposition": "attachment"}
ACTIVE_TYPES = {"text/html", "application/xhtml+xml", "image/svg+xml", "text/xml", "application/xml"}


def clean_mime(value: str) -> str:
    value = (value or "").split(";")[0].strip().lower()
    return value if re.match(r"^[a-z0-9.+-]+/[a-z0-9.+-]+$", value) else ""


def safe_mime(value: str, fallback: str) -> str:
    """Type to serve an upload with: markup types (SVG included) become opaque bytes."""
    value = clean_mime(value) or fallback
    return "application/octet-stream" if value in ACTIVE_TYPES else value


def project_summary(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "width": row["width"],
        "height": row["height"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "rev": row["rev"],
        "fileName": row["file_name"],
        "layerCount": row["layer_count"],
        "hasThumb": row["thumb_bytes"] > 0,
    }


def asset_meta(row: sqlite3.Row) -> dict:
    return {"id": row["id"], "name": row["name"], "mime": row["mime"], "width": row["width"], "height": row["height"], "size": row["size"]}


def font_meta(row: sqlite3.Row) -> dict:
    return {"id": row["id"], "family": row["family"], "fileName": row["file_name"], "mime": row["mime"], "size": row["size"], "addedAt": row["added_at"]}


def purge_user(user_id: int) -> None:
    with WRITE_LOCK, db() as conn:
        for table in ("sessions", "assets", "fonts", "projects"):
            conn.execute(f"DELETE FROM {table} WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    remove_path(user_dir(user_id))


# --------------------------------------------------------------------------
# admin CLI
# --------------------------------------------------------------------------


def admin(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="chaos_server.py admin", description="CHAOS.COLLAGE 账号管理")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list", help="列出账号与用量")
    p = sub.add_parser("create", help="创建账号")
    p.add_argument("username")
    p = sub.add_parser("reset-password", help="重置密码（会让该账号所有设备下线）")
    p.add_argument("username")
    p = sub.add_parser("disable", help="停用账号")
    p.add_argument("username")
    p = sub.add_parser("enable", help="启用账号")
    p.add_argument("username")
    p = sub.add_parser("quota", help="设置空间配额（MB，default 表示恢复默认）")
    p.add_argument("username")
    p.add_argument("mb")
    p = sub.add_parser("delete", help="删除账号及其全部数据")
    p.add_argument("username")
    args = parser.parse_args(argv)
    init_storage()

    def find(conn, name):
        row = conn.execute("SELECT * FROM users WHERE username = ?", (name,)).fetchone()
        if not row:
            raise SystemExit(f"没有账号：{name}")
        return row

    def ask_password() -> str:
        import getpass

        first = getpass.getpass("新密码：")
        if getpass.getpass("再输一次：") != first:
            raise SystemExit("两次输入不一致")
        validate_password(first)
        return first

    try:
        with db() as conn:
            if args.cmd == "list":
                rows = conn.execute("SELECT * FROM users ORDER BY id").fetchall()
                print(f"{'ID':>4}  {'用户名':<20} {'已用 MB':>9} {'配额 MB':>8}  状态  注册时间")
                for row in rows:
                    used = usage_bytes(conn, row["id"]) / 1048576
                    when = time.strftime("%Y-%m-%d %H:%M", time.localtime(row["created_at"] / 1000))
                    print(f"{row['id']:>4}  {row['username']:<20} {used:>9.1f} {user_quota(row) / 1048576:>8.0f}  {'停用' if row['disabled'] else '正常'}  {when}")
                return 0
            if args.cmd == "create":
                create_user(args.username, ask_password())
                print("已创建")
                return 0
            row = find(conn, args.username)
            if args.cmd == "reset-password":
                conn.execute("UPDATE users SET pw_hash = ? WHERE id = ?", (hash_password(ask_password()), row["id"]))
                conn.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))
            elif args.cmd in {"disable", "enable"}:
                conn.execute("UPDATE users SET disabled = ? WHERE id = ?", (1 if args.cmd == "disable" else 0, row["id"]))
                if args.cmd == "disable":
                    conn.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))
            elif args.cmd == "quota":
                value = None if args.mb == "default" else int(float(args.mb) * 1048576)
                conn.execute("UPDATE users SET quota_bytes = ? WHERE id = ?", (value, row["id"]))
            elif args.cmd == "delete":
                if input(f"确认删除账号 {row['username']} 及其全部工程？输入用户名确认：") != row["username"]:
                    raise SystemExit("已取消")
        if args.cmd == "delete":
            purge_user(row["id"])
        print("完成")
        return 0
    except ApiError as error:
        raise SystemExit(error.message) from None


def main(argv: list[str]) -> int:
    if argv[:1] == ["admin"]:
        return admin(argv[1:])
    parser = argparse.ArgumentParser(description="CHAOS.COLLAGE 云端服务")
    parser.add_argument("--host", default=CONFIG["host"])
    parser.add_argument("--port", type=int, default=CONFIG["port"])
    args = parser.parse_args(argv)
    init_storage()
    mimetypes.add_type("application/javascript", ".js")
    mimetypes.add_type("image/svg+xml", ".svg")
    mimetypes.add_type("image/x-icon", ".ico")
    mimetypes.add_type("application/manifest+json", ".webmanifest")
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    server.daemon_threads = True
    print(f"CHAOS.COLLAGE {VERSION} · http://{args.host}:{args.port} · 数据目录 {CONFIG['data']} · 注册{'开放' if CONFIG['allow_signup'] else '关闭'}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
