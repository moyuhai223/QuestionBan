#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
QuestionBan 本地服务器 = 静态站点 + Umi-OCR 同源代理。

为什么需要它:
  浏览器从本页(:8770)直接 POST 到 Umi-OCR(:1224) 会被同源策略(CORS)拦截。
  本服务把静态站和 OCR 代理放在同一个源下,浏览器只请求自己的 /umi-ocr,
  由服务器在后台转发给 Umi-OCR —— 服务器之间通信不受 CORS 限制。

用法:
  1) 打开 Umi-OCR,设置 -> 全局设置 -> 开启「HTTP 服务」(默认端口 1224)。
  2) 运行:  python ocr_server.py
  3) 浏览器打开 http://127.0.0.1:8770
  Umi-OCR 没开也能用 —— 前端会自动回退到内置离线 Tesseract 引擎。

可用环境变量: PORT(默认8770)、UMI_URL(默认 http://127.0.0.1:1224/api/ocr)。
"""
import json
import os
import sys
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", "8770"))
UMI_URL = os.environ.get("UMI_URL", "http://127.0.0.1:1224/api/ocr")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_POST(self):
        if self.path.rstrip("/") != "/umi-ocr":
            self.send_error(404, "Not Found")
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            incoming = json.loads(self.rfile.read(length) or b"{}")
            payload = json.dumps({
                "base64": incoming.get("base64", ""),
                "options": {"data.format": "text"},
            }).encode("utf-8")
            req = urllib.request.Request(
                UMI_URL, data=payload,
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read()
            self._respond(200, body)
        except Exception as exc:  # Umi 没开 / 崩溃 / 超时 -> 让前端回退
            self._respond(502, json.dumps(
                {"code": 902, "data": "Umi-OCR 调用失败: %s" % exc},
                ensure_ascii=False).encode("utf-8"))

    def _respond(self, code, body):
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):  # 安静一点
        pass


if __name__ == "__main__":
    print("QuestionBan running at http://127.0.0.1:%d" % PORT)
    print("Umi-OCR proxy -> %s  (falls back to Tesseract if offline)" % UMI_URL)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
