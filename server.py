#!/usr/bin/env python3
"""Local static server and FFmpeg-backed temporal datamosh API."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
from fractions import Fraction
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse


ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"
DEFAULT_PORT = 8080
MAX_UPLOAD_BYTES = 512 * 1024 * 1024
ALLOWED_EXTENSIONS = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v", ".mpg", ".mpeg"}
PROCESS_LOCK = threading.Lock()
FFMPEG = shutil.which("ffmpeg")
FFPROBE = shutil.which("ffprobe")


class MoshError(RuntimeError):
    pass


def tool_version(tool: str | None) -> str | None:
    if not tool:
        return None
    result = subprocess.run(
        [tool, "-hide_banner", "-version"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        check=False,
    )
    if result.returncode != 0:
        return None
    return (result.stdout or result.stderr).splitlines()[0].strip()


def run_tool(command: list[str], label: str) -> None:
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        check=False,
    )
    if result.returncode == 0:
        return
    detail = (result.stderr or result.stdout or "Unknown FFmpeg error").strip().splitlines()
    raise MoshError(f"{label} failed: {' | '.join(detail[-8:])}")


def probe_video(source: Path) -> dict:
    if not FFPROBE:
        raise MoshError("ffprobe is not available on PATH")
    result = subprocess.run(
        [
            FFPROBE,
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=codec_type,width,height,r_frame_rate,duration",
            "-of",
            "json",
            str(source),
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        check=False,
    )
    if result.returncode != 0:
        raise MoshError("ffprobe could not read this video")
    payload = json.loads(result.stdout)
    video_stream = next((stream for stream in payload.get("streams", []) if stream.get("codec_type") == "video"), None)
    if not video_stream:
        raise MoshError("No video stream was found")
    duration_text = payload.get("format", {}).get("duration") or video_stream.get("duration")
    try:
        duration = float(duration_text)
    except (TypeError, ValueError) as error:
        raise MoshError("Video duration is unavailable") from error
    try:
        frame_rate = float(Fraction(video_stream.get("r_frame_rate") or "30/1"))
    except (ValueError, ZeroDivisionError):
        frame_rate = 30.0
    frame_rate = max(12.0, min(frame_rate, 60.0))
    return {
        "duration": duration,
        "fps": frame_rate,
        "fps_expression": str(int(round(frame_rate))) if abs(frame_rate - round(frame_rate)) < 0.001 else f"{frame_rate:.6f}",
        "width": int(video_stream.get("width") or 0),
        "height": int(video_stream.get("height") or 0),
    }


def encode_mpeg4_segment(source: Path, output: Path, start: float, duration: float, fps: str, damage: int) -> None:
    if not FFMPEG:
        raise MoshError("ffmpeg is not available on PATH")
    run_tool(
        [
            FFMPEG,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source),
            "-ss",
            f"{start:.6f}",
            "-t",
            f"{duration:.6f}",
            "-map",
            "0:v:0",
            "-an",
            "-sn",
            "-dn",
            "-vf",
            f"fps={fps},scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos",
            "-c:v",
            "mpeg4",
            "-qscale:v",
            str(damage),
            "-g",
            "9999",
            "-bf",
            "0",
            "-sc_threshold",
            "0",
            "-f",
            "m4v",
            str(output),
        ],
        "MPEG-4 segment encode",
    )


def render_temporal_mosh(source: Path, output: Path, cut: float, mosh_duration: float, damage: int) -> dict:
    metadata = probe_video(source)
    source_duration = metadata["duration"]
    fps = metadata["fps"]
    fps_expression = metadata["fps_expression"]
    min_span = max(0.2, 3.0 / fps)

    if cut < min_span or cut > source_duration - min_span:
        raise MoshError(f"Cut time must be between {min_span:.2f}s and {source_duration - min_span:.2f}s")

    mosh_end = min(source_duration, cut + mosh_duration)
    if mosh_end - cut < min_span:
        raise MoshError(f"Mosh duration must be at least {min_span:.2f}s")

    with tempfile.TemporaryDirectory(prefix="chaos-mosh-work-") as work_dir_text:
        work_dir = Path(work_dir_text)
        pre = work_dir / "pre.m4v"
        infected = work_dir / "infected.m4v"
        infected_no_i = work_dir / "infected-no-i.m4v"
        recovery = work_dir / "recovery.m4v"
        joined = work_dir / "joined.m4v"

        encode_mpeg4_segment(source, pre, 0.0, cut, fps_expression, damage)
        encode_mpeg4_segment(source, infected, cut, mosh_end - cut, fps_expression, damage)
        run_tool(
            [
                FFMPEG,
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-f",
                "m4v",
                "-r",
                fps_expression,
                "-i",
                str(infected),
                "-map",
                "0:v:0",
                "-c:v",
                "copy",
                "-bsf:v",
                "noise=drop='eq(n,0)'",
                "-f",
                "m4v",
                str(infected_no_i),
            ],
            "I-frame removal",
        )

        parts = [pre, infected_no_i]
        recovery_duration = source_duration - mosh_end
        if recovery_duration >= 1.0 / fps:
            encode_mpeg4_segment(source, recovery, mosh_end, recovery_duration, fps_expression, damage)
            parts.append(recovery)

        with joined.open("wb") as joined_file:
            for part in parts:
                with part.open("rb") as part_file:
                    shutil.copyfileobj(part_file, joined_file)

        run_tool(
            [
                FFMPEG,
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-f",
                "m4v",
                "-r",
                fps_expression,
                "-i",
                str(joined),
                "-i",
                str(source),
                "-map",
                "0:v:0",
                "-map",
                "1:a:0?",
                "-c:v",
                "libx264",
                "-preset",
                "medium",
                "-crf",
                "18",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-shortest",
                "-movflags",
                "+faststart",
                str(output),
            ],
            "Final MP4 encode",
        )

    return {
        **metadata,
        "cut": cut,
        "moshDuration": mosh_end - cut,
        "damage": damage,
    }


class ChaosRequestHandler(SimpleHTTPRequestHandler):
    server_version = "ChaosCollege/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def send_json(self, status: HTTPStatus, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/status":
            self.send_json(
                HTTPStatus.OK,
                {
                    "ok": bool(FFMPEG and FFPROBE),
                    "ffmpeg": tool_version(FFMPEG),
                    "ffprobe": tool_version(FFPROBE),
                    "maxUploadMB": MAX_UPLOAD_BYTES // (1024 * 1024),
                },
            )
            return
        super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/api/datamosh":
            self.send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Unknown API route"})
            return
        if not FFMPEG or not FFPROBE:
            self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"ok": False, "error": "FFmpeg and ffprobe are required"})
            return
        if not PROCESS_LOCK.acquire(blocking=False):
            self.send_json(HTTPStatus.CONFLICT, {"ok": False, "error": "Another Temporal Mosh render is already running"})
            return

        try:
            self.handle_datamosh(parsed.query)
        finally:
            PROCESS_LOCK.release()

    def handle_datamosh(self, query_text: str) -> None:
        try:
            content_length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            content_length = 0
        if content_length <= 0 or content_length > MAX_UPLOAD_BYTES:
            self.send_json(
                HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                {"ok": False, "error": f"Video must be between 1 byte and {MAX_UPLOAD_BYTES // (1024 * 1024)} MB"},
            )
            return

        query = parse_qs(query_text)
        try:
            cut = float(query.get("cut", [""])[0])
            duration = float(query.get("duration", ["2"])[0])
            damage = max(2, min(int(query.get("damage", ["12"])[0]), 24))
        except ValueError:
            self.send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "Invalid cut, duration, or damage parameter"})
            return

        raw_name = unquote(self.headers.get("X-File-Name") or "source.mp4")
        suffix = Path(raw_name).suffix.lower()
        if suffix not in ALLOWED_EXTENSIONS:
            suffix = ".video"

        try:
            with tempfile.TemporaryDirectory(prefix="chaos-mosh-upload-") as upload_dir_text:
                upload_dir = Path(upload_dir_text)
                source = upload_dir / f"source{suffix}"
                output = upload_dir / "temporal-mosh.mp4"
                remaining = content_length
                with source.open("wb") as source_file:
                    while remaining > 0:
                        chunk = self.rfile.read(min(1024 * 1024, remaining))
                        if not chunk:
                            raise MoshError("Upload ended before Content-Length was reached")
                        source_file.write(chunk)
                        remaining -= len(chunk)

                metadata = render_temporal_mosh(source, output, cut, duration, damage)
                output_size = output.stat().st_size
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "video/mp4")
                self.send_header("Content-Length", str(output_size))
                self.send_header("Content-Disposition", 'attachment; filename="temporal-mosh.mp4"')
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Mosh-Metadata", json.dumps(metadata, separators=(",", ":")))
                self.end_headers()
                with output.open("rb") as output_file:
                    shutil.copyfileobj(output_file, self.wfile)
        except (MoshError, json.JSONDecodeError) as error:
            self.send_json(HTTPStatus.UNPROCESSABLE_ENTITY, {"ok": False, "error": str(error)})
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception as error:  # Keep local service errors useful without exposing a traceback to the browser.
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": f"Unexpected render error: {error}"})

    def log_message(self, message_format: str, *args) -> None:
        sys.stderr.write(f"[{self.log_date_time_string()}] {message_format % args}\n")


def main() -> None:
    port = DEFAULT_PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError as error:
            raise SystemExit("Port must be an integer") from error
    server = ThreadingHTTPServer((HOST, port), ChaosRequestHandler)
    print(f"CHAOS.COLLAGE running at http://{HOST}:{port}")
    print(f"Temporal Mosh: {'ready' if FFMPEG and FFPROBE else 'offline (FFmpeg/ffprobe missing)'}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
