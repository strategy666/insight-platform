#!/bin/zsh
set -euo pipefail

PROJECT_DIR="/Users/jiayi/Desktop/Work/生服/trae/insight-platform"
LOG_DIR="$PROJECT_DIR/logs"

mkdir -p "$LOG_DIR"
cd "$PROJECT_DIR"

# 1) 从固定 Kim Doc 同步到 sources.md
./scripts/sync_sources_from_kim.sh

# 2) 生成网站检索渠道 JSON
python3 scripts/extract_sources.py

# 3) 自动提交并发布（仅在有变更时）
git add sources.md assets/source_channels.json
if ! git diff --cached --quiet; then
  git commit -m "chore: auto-sync source channels $(date '+%Y-%m-%d %H:%M')"
  git push origin main
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] synced and pushed"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] no changes"
fi
