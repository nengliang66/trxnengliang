#!/usr/bin/env python3
"""本地预览：模拟 Cloudflare Pages 的干净 URL（/pricing -> pricing.html）。"""
from __future__ import annotations

import argparse
import http.server
import os
import socketserver
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def translate_path(self, path: str) -> str:
        clean = path.split("?")[0].split("#")[0]
        fs_path = super().translate_path(path)
        if not os.path.exists(fs_path):
            candidate = fs_path.rstrip("/") + ".html"
            if os.path.exists(candidate):
                return candidate
        return fs_path

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        pass


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    args = ap.parse_args()
    with socketserver.TCPServer(("127.0.0.1", args.port), Handler) as httpd:
        print(f"serving {ROOT} at http://127.0.0.1:{args.port}", flush=True)
        httpd.serve_forever()


if __name__ == "__main__":
    main()
