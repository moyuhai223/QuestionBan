#!/usr/bin/env bash
# ============================================================================
# QuestionBan 一键部署（1Panel 服务器）
#   1) 把静态站拷到网站目录（Nginx 直接服务，客户端可离线 Tesseract 兜底）
#   2) 安装 RapidOCR 高精度后端（venv + systemd，仅监听 127.0.0.1:1224）
#   3) 打印 1Panel 反向代理 / 上传体积的设置指引
#
# 用法（在服务器上、QuestionBan/server 目录内，需以 root 运行）：
#   bash deploy.sh              # 静态站 + RapidOCR 后端
#   bash deploy.sh --static-only   # 只部署静态站
# ============================================================================
set -euo pipefail

DEST="/opt/1panel/www/sites/e5.zh.ci/index"   # 网站目录
OCR_DIR="/opt/questionban-ocr"                # OCR 后端安装目录
PORT="${PORT:-1224}"
SERVICE="questionban-ocr"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$(dirname "$SCRIPT_DIR")"                # QuestionBan 根目录（含 index.html）
STATIC_ONLY=0
[ "${1:-}" = "--static-only" ] && STATIC_ONLY=1

[ "$(id -u)" = "0" ] || { echo "需要 root 权限：请切到 root 后运行（或在命令前加 sudo）"; exit 1; }
[ -f "$SRC/index.html" ] || { echo "找不到 $SRC/index.html —— 请在 QuestionBan/server 目录里运行本脚本"; exit 1; }

echo "==> [1/4] 部署静态站到 $DEST"
mkdir -p "$DEST"
for item in index.html script.js style.css database.js converter.html export.html import.html ie8 README.md; do
    if [ -e "$SRC/$item" ]; then cp -a "$SRC/$item" "$DEST/"; fi
done
owner="$(stat -c '%U:%G' "$DEST" 2>/dev/null || echo root:root)"
chown -R "$owner" "$DEST" 2>/dev/null || true
chmod -R a+rX "$DEST" 2>/dev/null || true
echo "    已部署：$(ls "$DEST" | tr '\n' ' ')"

if [ "$STATIC_ONLY" = "1" ]; then
    echo "==> 仅静态站部署完成。客户端将使用内置离线 Tesseract。"
    exit 0
fi

echo "==> [2/4] 安装 RapidOCR 依赖（Python venv，首次需下载，约 1-2 分钟）"
command -v python3 >/dev/null 2>&1 || { echo "未找到 python3，请先安装"; exit 1; }
PYVER="$(python3 -c 'import sys;print("%d.%d"%sys.version_info[:2])')"   # 如 3.11
# Debian/Ubuntu 的 venv 常是带版本号的包名(python3.11-venv)，且需要 ensurepip
if command -v apt-get >/dev/null 2>&1; then
    apt-get update -y >/dev/null 2>&1 || true
    apt-get install -y "python${PYVER}-venv" python3-venv python3-pip >/dev/null 2>&1 \
        || apt-get install -y python3-venv python3-pip || true
elif command -v dnf >/dev/null 2>&1; then
    dnf install -y python3-venv python3-pip >/dev/null 2>&1 || true
elif command -v yum >/dev/null 2>&1; then
    yum install -y python3-venv python3-pip >/dev/null 2>&1 || true
fi
mkdir -p "$OCR_DIR"
cp -a "$SCRIPT_DIR/rapidocr_server.py" "$OCR_DIR/"
rm -rf "$OCR_DIR/venv"                       # 清掉可能残留的半成品 venv
python3 -m venv "$OCR_DIR/venv" || {
    echo "创建 venv 失败。请手动执行： apt install -y python${PYVER}-venv  然后重跑本脚本"; exit 1;
}
PIP="$OCR_DIR/venv/bin/pip"
"$PIP" install -q --upgrade pip
"$PIP" install -q rapidocr_onnxruntime
# 用 headless 版 opencv，规避服务器缺 libGL.so.1 的常见崩溃
"$PIP" uninstall -y -q opencv-python opencv-contrib-python >/dev/null 2>&1 || true
"$PIP" install -q opencv-python-headless
echo "    依赖安装完成。"

echo "==> [3/4] 配置 systemd 服务 $SERVICE"
cat > "/etc/systemd/system/$SERVICE.service" <<EOF
[Unit]
Description=QuestionBan RapidOCR backend
After=network.target

[Service]
Type=simple
Environment=PORT=$PORT
WorkingDirectory=$OCR_DIR
ExecStart=$OCR_DIR/venv/bin/python $OCR_DIR/rapidocr_server.py
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now "$SERVICE"

echo "==> [4/4] 健康检查（等待引擎加载）"
ok=""
for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then ok=1; break; fi
    sleep 2
done
if [ -n "$ok" ]; then
    echo "    ✔ OCR 后端就绪：http://127.0.0.1:$PORT"
else
    echo "    ✖ OCR 后端未就绪，查看日志：journalctl -u $SERVICE -e --no-pager | tail -40"
fi

cat <<TIP

────────────────────────────────────────────────────────────
还差最后一步（在 1Panel 面板里点，脚本改不了它的配置）：

1) 网站 → e5.zh.ci → 反向代理 → 创建代理：
       代理名称 : ocr
       代理目录 : /umi-ocr
       目标 URL : http://127.0.0.1:$PORT
   （勾选 WebSocket 不需要；保存后会自动 reload）

2) 同一站点 → 配置文件/运行参数，把上传体积放大：
       client_max_body_size 20m;

完成后访问 https://e5.zh.ci ，点「📷 拍照搜题」：
   • 反代通了 → 状态显示「服务端OCR」(RapidOCR，中文高精度)
   • 没通/后端挂了 → 自动回退「内置Tesseract」(离线，仍可用)

常用命令：
   重启后端 : systemctl restart $SERVICE
   看日志   : journalctl -u $SERVICE -e --no-pager | tail -40
   只更新前端: sudo bash deploy.sh --static-only
────────────────────────────────────────────────────────────
TIP
