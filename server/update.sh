#!/usr/bin/env bash
# ============================================================================
# QuestionBan 一键安装 / 更新（直接从 GitHub 仓库拉取，幂等，可反复运行）
#
# 远程一条命令（首次安装 & 以后每次更新都用它）：
#   curl -fsSL https://raw.githubusercontent.com/moyuhai223/QuestionBan/main/server/update.sh | sudo bash
#
# 已克隆到服务器后也可：
#   sudo bash /opt/questionban-src/server/update.sh            # 静态站 + OCR 后端
#   sudo bash /opt/questionban-src/server/update.sh --static-only
# ============================================================================
set -euo pipefail

REPO="https://github.com/moyuhai223/QuestionBan.git"
BRANCH="main"
SRC="/opt/questionban-src"                      # 代码克隆目录（更新源）
DEST="/opt/1panel/www/sites/e5.zh.ci/index"     # 网站目录
OCR_DIR="/opt/questionban-ocr"                  # OCR 后端目录
SERVICE="questionban-ocr"
PORT="${PORT:-1224}"
STATIC_ONLY=0
[ "${1:-}" = "--static-only" ] && STATIC_ONLY=1

[ "$(id -u)" = "0" ] || { echo "请用 root 运行：sudo bash $0"; exit 1; }
command -v git >/dev/null 2>&1 || {
    (apt-get update -y && apt-get install -y git) >/dev/null 2>&1 \
        || yum install -y git >/dev/null 2>&1 || dnf install -y git >/dev/null 2>&1 \
        || { echo "请先安装 git"; exit 1; }
}

echo "==> [1/4] 拉取最新代码（$REPO@$BRANCH）"
if [ -d "$SRC/.git" ]; then
    git -C "$SRC" remote set-url origin "$REPO"
    git -C "$SRC" fetch --depth 1 origin "$BRANCH"
    git -C "$SRC" reset --hard "origin/$BRANCH"
    git -C "$SRC" clean -fd
else
    rm -rf "$SRC"
    git clone --depth 1 -b "$BRANCH" "$REPO" "$SRC"
fi
echo "    当前提交：$(git -C "$SRC" rev-parse --short HEAD)"

echo "==> [2/4] 部署静态站到 $DEST"
mkdir -p "$DEST"
for item in index.html script.js style.css database.js tess converter.html export.html import.html ie8 README.md; do
    if [ -e "$SRC/$item" ]; then cp -a "$SRC/$item" "$DEST/"; fi
done
owner="$(stat -c '%U:%G' "$DEST" 2>/dev/null || echo root:root)"
chown -R "$owner" "$DEST" 2>/dev/null || true
chmod -R a+rX "$DEST" 2>/dev/null || true
echo "    已更新：$(ls "$DEST" | tr '\n' ' ')"

if [ "$STATIC_ONLY" = "1" ]; then echo "==> 仅更新静态站完成。"; exit 0; fi

echo "==> [3/4] 安装 / 刷新 RapidOCR 后端"
command -v python3 >/dev/null 2>&1 || { echo "未找到 python3"; exit 1; }
PYVER="$(python3 -c 'import sys;print("%d.%d"%sys.version_info[:2])')"
mkdir -p "$OCR_DIR"
cp -a "$SRC/server/rapidocr_server.py" "$OCR_DIR/"
if [ ! -x "$OCR_DIR/venv/bin/python" ]; then
    echo "    首次安装依赖（约 1-2 分钟）…"
    if command -v apt-get >/dev/null 2>&1; then
        apt-get update -y >/dev/null 2>&1 || true
        apt-get install -y "python${PYVER}-venv" python3-venv python3-pip >/dev/null 2>&1 \
            || apt-get install -y python3-venv python3-pip || true
    elif command -v dnf >/dev/null 2>&1; then dnf install -y python3-venv python3-pip >/dev/null 2>&1 || true
    elif command -v yum >/dev/null 2>&1; then yum install -y python3-venv python3-pip >/dev/null 2>&1 || true
    fi
    rm -rf "$OCR_DIR/venv"
    python3 -m venv "$OCR_DIR/venv" || { echo "venv 创建失败：apt install -y python${PYVER}-venv 后重试"; exit 1; }
    PIP="$OCR_DIR/venv/bin/pip"
    "$PIP" install -q --upgrade pip
    "$PIP" install -q rapidocr_onnxruntime
    "$PIP" uninstall -y -q opencv-python opencv-contrib-python >/dev/null 2>&1 || true
    "$PIP" install -q opencv-python-headless
fi
if [ ! -f "/etc/systemd/system/$SERVICE.service" ]; then
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
    systemctl enable "$SERVICE"
fi
systemctl restart "$SERVICE"

echo "==> [4/4] 健康检查"
ok=""
for _ in $(seq 1 30); do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && { ok=1; break; }; sleep 2; done
[ -n "$ok" ] && echo "    ✔ OCR 后端就绪 http://127.0.0.1:$PORT" \
              || echo "    ✖ 未就绪，查看日志：journalctl -u $SERVICE -e --no-pager | tail -40"

cat <<TIP

────────────────────────────────────────────────────────────
更新完成。以后每次更新，重跑同一条命令即可：
  curl -fsSL https://raw.githubusercontent.com/moyuhai223/QuestionBan/$BRANCH/server/update.sh | sudo bash

仅首次需在 1Panel 里配一次反向代理：/umi-ocr  ->  http://127.0.0.1:$PORT
────────────────────────────────────────────────────────────
TIP
