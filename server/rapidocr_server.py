#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
QuestionBan 高精度 OCR 后端（RapidOCR / PaddleOCR ONNX 模型）。

- 只监听 127.0.0.1:1224，对外由 1Panel 反向代理 /umi-ocr -> 本服务。
- 接口与前端约定一致：POST 任意路径，body {"base64": "..."}，
  返回 {"code":100,"data":"识别文字"}；无文字 code=101；出错 code=901。
- 模型随 rapidocr_onnxruntime 包内置，安装后即可离线运行。
"""
import base64
import io
import json
import os
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import cv2
from rapidocr_onnxruntime import RapidOCR

HOST = "127.0.0.1"
PORT = int(os.environ.get("PORT", "1224"))

print("loading RapidOCR engine ...", flush=True)
ENGINE = RapidOCR()
print("RapidOCR ready, listening on %s:%d" % (HOST, PORT), flush=True)


def reading_order(result):
    """把 OCR 文本框按阅读顺序（上→下；同一行内左→右）排好，返回逐行文字列表。
    复杂版面时 RapidOCR 返回的顺序未必是阅读顺序，而下游用顺序敏感的匹配，故重排。"""
    items = []
    for it in result:
        box, txt = it[0], it[1]
        ys = [p[1] for p in box]
        xs = [p[0] for p in box]
        items.append({"cy": sum(ys) / len(ys), "left": min(xs),
                      "h": max(ys) - min(ys), "txt": txt})
    if not items:
        return []
    avg_h = (sum(it["h"] for it in items) / len(items)) or 1.0
    thr = avg_h * 0.6                       # 行间阈值：cy 相差小于它视为同一行
    items.sort(key=lambda it: it["cy"])
    rows = []
    for it in items:
        if rows and abs(it["cy"] - rows[-1]["cy"]) <= thr:
            rows[-1]["items"].append(it)
            rows[-1]["cy"] = sum(x["cy"] for x in rows[-1]["items"]) / len(rows[-1]["items"])
        else:
            rows.append({"cy": it["cy"], "items": [it]})
    lines = []
    for row in rows:
        row["items"].sort(key=lambda it: it["left"])
        lines.append(" ".join(it["txt"] for it in row["items"]))
    return lines


class Handler(BaseHTTPRequestHandler):
    def _json(self, http_code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(http_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._json(200, {"code": 100, "data": ""})

    def do_GET(self):
        self._json(200, {"code": 100, "data": "ok"})

    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length", 0))
            req = json.loads(self.rfile.read(n) or b"{}")
            b64 = req.get("base64", "") or ""
            if b64.startswith("data:"):
                b64 = b64.split(",", 1)[1]
            raw = base64.b64decode(b64)
            arr = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
            if arr is None:
                self._json(200, {"code": 901, "data": "无法解码图片"})
                return
            result, _ = ENGINE(arr)
            if not result:
                self._json(200, {"code": 101, "data": ""})
                return
            text = "\n".join(reading_order(result))   # 按阅读顺序重排再拼接
            self._json(200, {"code": 100, "data": text})
        except Exception as exc:
            traceback.print_exc()
            self._json(200, {"code": 901, "data": "OCR 失败: %s" % exc})

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    try:
        ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)
