#!/bin/zsh
set -euo pipefail

# 固定信息源文档（Kim Doc）
KIM_DOC_URL="https://docs.corp.kuaishou.com/d/home/fcADd7EE875B_2CtnBVe3du0M"
SKILL_DIR="/Users/jiayi/.codeflicker/internal/skills/docs-shuttle"
PROJECT_DIR="/Users/jiayi/Desktop/Work/生服/trae/insight-platform"
TMP_FILE="/tmp/sources_from_kim_raw.md"
OUT_FILE="$PROJECT_DIR/sources.md"

python3 "$SKILL_DIR/scripts/pull_cdp.py" "$KIM_DOC_URL" -o "$TMP_FILE"

python3 - <<'PY'
from pathlib import Path
raw = Path('/tmp/sources_from_kim_raw.md').read_text(encoding='utf-8')
text = raw
if raw.startswith('---\n'):
    parts = raw.split('\n---\n', 1)
    if len(parts) == 2:
        text = parts[1].lstrip('\n')
Path('/Users/jiayi/Desktop/Work/生服/trae/insight-platform/sources.md').write_text(text, encoding='utf-8')
print('✅ 已同步到 sources.md')
PY

echo "✅ Source registry synced from fixed Kim Doc"
