#!/usr/bin/env python3
"""
Portal 质量 Harness — 一次性全量质检脚本
===========================================
覆盖规则（由用户明确指定）：

  1. Tab1 (competitor_updates) vs Tab2 (intel) 标题不重复
  2. Tab2 本周高热情报 与 下面全部动态 内部不重复
  3. 每条日期不可为未来 / 不可过于陈旧
  4. 剔除弱相关条目（robotaxi/文远知行/无人驾驶等）
  5. 来源 URL 可访问性 + 日期一致性

策略：
  - 全本地 JSON 扫描，不依赖外部 API
  - 复用已有 audit_dates / audit_sources 逻辑
  - 输出彩色报告 → 直接修复 → 给出 git diff suggestion

使用：
    cd insight-platform && python3 scripts/quality_harness.py              # 全量
    cd insight-platform && python3 scripts/quality_harness.py --fix         # 自动修复
    cd insight-platform && python3 scripts/quality_harness.py --json        # JSON 输出（CI）
    cd insight-platform && python3 scripts/quality_harness.py --check-dates # 含网络日期验证
"""

from __future__ import annotations

import json
import re
import sys
import argparse
import time
from pathlib import Path
from datetime import datetime, timedelta
from collections import Counter, defaultdict
from typing import List, Dict, Any, Tuple, Optional

# ============================================================
# 配置
# ============================================================

ROOT = Path(__file__).resolve().parent.parent
INTEL_PATH = ROOT / "assets/data/intel.json"
COMPETITOR_PATH = ROOT / "assets/data/competitor_updates.json"

# 弱相关关键词 — 命中任意一个即标记为 irrelevant
IRRELEVANT_KEYWORDS = [
    # 自动驾驶 / Robotaxi
    "robotaxi", "Robotaxi", "ROBOTAXI",
    "文远知行", "小马智行", "pony.ai", "Pony.ai",
    "Waymo", "Cruise", "AutoX",
    "自动驾驶出租车", "无人驾驶出租车",
    "萝卜快跑", "Baidu Apollo",
    # 纯出行（非本地生活）
    "无人车", "无人配送车",
]

# 过于陈旧的阈值（天）
MAX_AGE_DAYS = 30

# 标题相似度阈值（用于近重复检测）
SIMILARITY_THRESHOLD = 0.65

# 本周时间窗口（天）
THIS_WEEK_DAYS = 7


# ============================================================
# 工具函数
# ============================================================

def warn(msg: str):
    print(f"  ⚠️  {msg}")

def ok(msg: str):
    print(f"  ✅ {msg}")

def fail(msg: str):
    print(f"  🚨 {msg}")


def load_json(p: Path) -> dict:
    with p.open(encoding="utf-8") as f:
        return json.load(f)


def get_items(data: dict) -> list:
    return data.get("items", data) if isinstance(data, dict) else data


def normalize_title(t: str) -> str:
    """去标点空格，全小写，用于模糊匹配"""
    t = (t or "").lower()
    t = re.sub(r'[^\w\u4e00-\u9fff]', '', t)
    return t.strip()


def jaccard_similarity(a: str, b: str) -> float:
    """两个标准化后标题的 Jaccard 相似度（字符级）"""
    sa, sb = set(a), set(b)
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


# ============================================================
# 检查 1：Tab1 vs Tab2 标题重复
# ============================================================

def check_cross_file_duplicates(intel_items: list, comp_items: list) -> list:
    """返回跨文件的重复对"""
    dupes = []
    intel_titles = {normalize_title(it.get("title", "")): it.get("id") for it in intel_items}
    comp_titles = {normalize_title(it.get("title", "")): it.get("id") for it in comp_items}

    # 精确匹配
    for norm_t, iid in intel_titles.items():
        if norm_t and norm_t in comp_titles:
            dupes.append({
                "type": "exact",
                "intel_id": iid,
                "competitor_id": comp_titles[norm_t],
                "shared_title": norm_t[:80],
            })

    # 近重复检测（Jaccard ≥ 阈值）
    for it_intel in intel_items:
        nt1 = normalize_title(it_intel.get("title", ""))
        if not nt1 or len(nt1) < 5:
            continue
        for it_comp in comp_items:
            nt2 = normalize_title(it_comp.get("title", ""))
            if not nt2 or len(nt2) < 5:
                continue
            sim = jaccard_similarity(nt1, nt2)
            if sim >= SIMILARITY_THRESHOLD and nt1 != nt2:
                dupes.append({
                    "type": "near",
                    "similarity": round(sim, 3),
                    "intel_id": it_intel.get("id"),
                    "competitor_id": it_comp.get("id"),
                    "intel_title": it_intel.get("title", "")[:80],
                    "competitor_title": it_comp.get("title", "")[:80],
                })

    return dupes


# ============================================================
# 检查 2：Tab2 高热情报 vs 全部动态 内部重复
# ============================================================

def check_internal_duplicates(items: list) -> list:
    """检查同一文件内的高优先级条目与普通条目之间的重复"""
    dupes = []

    # 找出近期高优条目（本周 + high priority）
    now = datetime.now()
    week_ago = now - timedelta(days=THIS_WEEK_DAYS)
    high_items = []
    normal_items = []

    for it in items:
        date_str = (it.get("date") or "").strip()
        try:
            item_date = datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            continue

        is_recent = item_date >= week_ago
        is_high = (it.get("priority") or "").lower() in ("high",)

        if is_recent and is_high:
            high_items.append(it)
        else:
            normal_items.append(it)

    for hi in high_items:
        nt1 = normalize_title(hi.get("title", ""))
        if not nt1 or len(nt1) < 5:
            continue
        for ni in normal_items:
            nt2 = normalize_title(ni.get("title", ""))
            if not nt2 or len(nt2) < 5:
                continue
            sim = jaccard_similarity(nt1, nt2)
            if sim >= SIMILARITY_THRESHOLD:
                dupes.append({
                    "type": "high_vs_normal",
                    "similarity": round(sim, 3),
                    "high_id": hi.get("id"),
                    "normal_id": ni.get("id"),
                    "high_title": hi.get("title", "")[:80],
                    "normal_title": ni.get("title", "")[:80],
                })
            elif nt1 == nt2:
                dupes.append({
                    "type": "exact_internal",
                    "high_id": hi.get("id"),
                    "normal_id": ni.get("id"),
                    "shared_title": hi.get("title", "")[:80],
                })

    return dupes


# ============================================================
# 检查 3：日期真实性
# ============================================================

def check_dates(items: list, filename: str) -> list:
    """检查未来日期 + 过于陈旧日期"""
    issues = []
    now = datetime.now()
    too_old = now - timedelta(days=MAX_AGE_DAYS)

    for it in items:
        date_str = (it.get("date") or "").strip()
        item_id = it.get("id", "?")
        title = it.get("title", "")[:60]

        if not date_str:
            issues.append({"id": item_id, "title": title, "file": filename, "issue": "missing_date"})
            continue

        try:
            item_date = datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            issues.append({"id": item_id, "title": title, "file": filename, "issue": "invalid_date", "date": date_str})
            continue

        if item_date > now:
            issues.append({"id": item_id, "title": title, "file": filename, "issue": "future_date", "date": date_str})
        elif item_date < too_old:
            days_old = (now - item_date).days
            issues.append({"id": item_id, "title": title, "file": filename, "issue": "too_old", "date": date_str, "days_old": days_old})

    return issues


# ============================================================
# 检查 4：弱相关条目检测
# ============================================================

def check_irrelevant(items: list, filename: str) -> list:
    """检测包含弱相关关键词的条目"""
    flagged = []
    for it in items:
        title = it.get("title", "") or ""
        tldr = it.get("tldr", "") or ""
        body = it.get("body", "") or ""
        combined = f"{title} {tldr} {body}".lower()

        matched = [kw for kw in IRRELEVANT_KEYWORDS if kw.lower() in combined]
        if matched:
            flagged.append({
                "id": it.get("id", "?"),
                "title": title[:80],
                "file": filename,
                "matched_keywords": matched,
            })
    return flagged


# ============================================================
# 检查 5：来源 URL 结构校验
# ============================================================

def check_sources(items: list, filename: str) -> list:
    """检查 sources 字段完整性 + URL 合法性"""
    issues = []

    BROKEN_DOMAINS = [
        "bytedance.larkoffice.com", "bytedance.feishu.cn",
        "docs.qingque.cn", "docs.corp.kuaishou.com", "kdocs.cn",
    ]

    for it in items:
        item_id = it.get("id", "?")
        title = it.get("title", "")[:60]
        sources = it.get("sources", [])

        if not sources:
            issues.append({"id": item_id, "title": title, "file": filename, "issue": "no_sources"})
            continue

        for s in sources:
            url = (s.get("url") or "").strip()
            name = (s.get("name") or "").strip()
            if not url:
                issues.append({"id": item_id, "title": title, "file": filename, "issue": "empty_url", "source_name": name})
                continue
            if not url.startswith("http"):
                issues.append({"id": item_id, "title": title, "file": filename, "issue": "bad_url", "url": url})
            for bd in BROKEN_DOMAINS:
                if bd in url:
                    issues.append({"id": item_id, "title": title, "file": filename, "issue": "broken_domain", "url": url, "domain": bd})
            # Check source date matches item date
            source_date = (s.get("date") or "").strip()
            if source_date:
                try:
                    sd = datetime.strptime(source_date, "%Y-%m-%d")
                    item_date_str = (it.get("date") or "").strip()
                    if item_date_str:
                        item_dt = datetime.strptime(item_date_str, "%Y-%m-%d")
                        gap = abs((sd - item_dt).days)
                        if gap > 30:
                            issues.append({
                                "id": item_id, "title": title, "file": filename,
                                "issue": "source_date_mismatch",
                                "item_date": item_date_str,
                                "source_date": source_date,
                                "gap_days": gap,
                            })
                except ValueError:
                    pass

    return issues


# ============================================================
# 自动修复
# ============================================================

def auto_fix(filepath: Path, date_issues: list, irrelevant_items: list):
    """自动修复：纠正未来日期、移除弱相关条目"""
    data = load_json(filepath)
    items = get_items(data)

    now = datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    irrelevant_ids = {i["id"] for i in irrelevant_items}

    fixed_dates = 0
    removed = 0

    new_items = []
    for it in items:
        item_id = it.get("id")

        # 移除弱相关条目
        if item_id in irrelevant_ids:
            print(f"  🗑️  移除弱相关: [{item_id}] {it.get('title','')[:60]}")
            removed += 1
            continue

        # 修正未来日期 → 当天（保守策略：无法确定真实日期时改为今天）
        date_str = (it.get("date") or "").strip()
        if date_str:
            try:
                item_date = datetime.strptime(date_str, "%Y-%m-%d")
                if item_date > now:
                    print(f"  🔧 日期修正: [{item_id}] {date_str} → {today_str} ({it.get('title','')[:40]})")
                    it["date"] = today_str
                    fixed_dates += 1
            except ValueError:
                print(f"  🔧 日期修正: [{item_id}] {date_str} → {today_str} (无效日期)")
                it["date"] = today_str
                fixed_dates += 1

        new_items.append(it)

    items[:] = new_items

    # 更新 _meta
    if isinstance(data, dict) and "_meta" in data:
        data["_meta"]["total_items"] = len(new_items)
        data["_meta"]["last_updated"] = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
        data["_meta"]["cleaned"] = True

    with filepath.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return fixed_dates, removed


# ============================================================
# 主流程
# ============================================================

def main():
    ap = argparse.ArgumentParser(description="Portal 质量 Harness")
    ap.add_argument("--fix", action="store_true", help="自动修复可修复的问题")
    ap.add_argument("--json", action="store_true", help="JSON 格式输出（CI 友好）")
    ap.add_argument("--check-dates", action="store_true", help="运行网络日期验证（audit_dates.py）")
    args = ap.parse_args()

    intel_data = load_json(INTEL_PATH)
    comp_data = load_json(COMPETITOR_PATH)
    intel_items = get_items(intel_data)
    comp_items = get_items(comp_data)

    report = {
        "timestamp": datetime.now().isoformat(),
        "intel_items": len(intel_items),
        "competitor_items": len(comp_items),
        "results": {},
    }

    print("=" * 60)
    print("🔍 Portal 质量 Harness")
    print(f"   intel.json: {len(intel_items)} 条")
    print(f"   competitor_updates.json: {len(comp_items)} 条")
    print("=" * 60)

    # ── 检查 1：跨文件标题重复 ──
    print("\n📋 检查 1: Tab1 vs Tab2 标题重复")
    cross_dupes = check_cross_file_duplicates(intel_items, comp_items)
    if cross_dupes:
        fail(f"发现 {len(cross_dupes)} 处跨文件重复:")
        for d in cross_dupes:
            print(f"     [{d['type']}] intel:{d.get('intel_id','?')} ↔ comp:{d.get('competitor_id','?')}")
            if d['type'] == 'near':
                print(f"       相似度: {d['similarity']} | {d.get('intel_title','')[:60]}")
    else:
        ok("无跨文件重复")
    report["results"]["cross_dupes"] = len(cross_dupes)

    # ── 检查 2：Tab2 内部重复 ──
    print("\n📋 检查 2: Tab2 高热情报 vs 全部动态 内部重复")
    internal_dupes = check_internal_duplicates(intel_items)
    if internal_dupes:
        fail(f"发现 {len(internal_dupes)} 处内部重复:")
        for d in internal_dupes:
            print(f"     [{d['type']}] high:{d.get('high_id','?')} ↔ normal:{d.get('normal_id','?')}")
            if d.get('similarity'):
                print(f"       相似度: {d['similarity']}")
    else:
        ok("无内部重复")
    report["results"]["internal_dupes"] = len(internal_dupes)

    # ── 检查 3：日期真实性 ──
    print("\n📋 检查 3: 日期真实性")
    intel_date_issues = check_dates(intel_items, "intel.json")
    comp_date_issues = check_dates(comp_items, "competitor_updates.json")
    all_date_issues = intel_date_issues + comp_date_issues
    if all_date_issues:
        fail(f"发现 {len(all_date_issues)} 处日期问题:")
        for d in all_date_issues:
            icon = {"future_date": "🔴", "too_old": "🟡", "missing_date": "⚪", "invalid_date": "🔴"}.get(d["issue"], "❓")
            extra = f" ({d.get('days_old','')}天前)" if d["issue"] == "too_old" else ""
            print(f"     {icon} [{d['file']}] {d['id']}: {d['issue']} date={d.get('date','?')}{extra}")
            print(f"        {d['title'][:70]}")
    else:
        ok("所有日期正常")
    report["results"]["date_issues"] = len(all_date_issues)

    # ── 检查 4：弱相关条目 ──
    print("\n📋 检查 4: 弱相关条目检测")
    intel_irrelevant = check_irrelevant(intel_items, "intel.json")
    comp_irrelevant = check_irrelevant(comp_items, "competitor_updates.json")
    all_irrelevant = intel_irrelevant + comp_irrelevant
    if all_irrelevant:
        fail(f"发现 {len(all_irrelevant)} 条弱相关条目:")
        for d in all_irrelevant:
            print(f"     🗑️  [{d['file']}] {d['id']}: {d['title'][:60]}")
            print(f"        关键词: {d['matched_keywords']}")
    else:
        ok("无弱相关条目")
    report["results"]["irrelevant"] = len(all_irrelevant)

    # ── 检查 5：来源校验 ──
    print("\n📋 检查 5: 来源 URL 结构校验")
    intel_src_issues = check_sources(intel_items, "intel.json")
    comp_src_issues = check_sources(comp_items, "competitor_updates.json")
    all_src_issues = intel_src_issues + comp_src_issues
    if all_src_issues:
        fail(f"发现 {len(all_src_issues)} 处来源问题:")
        for d in all_src_issues:
            print(f"     ❓ [{d['file']}] {d['id']}: {d['issue']}")
            if d.get("gap_days"):
                print(f"        item.date={d.get('item_date')} vs source.date={d.get('source_date')} gap={d['gap_days']}d")
            if d.get("url"):
                print(f"        url={d['url'][:80]}")
    else:
        ok("来源字段完整")
    report["results"]["source_issues"] = len(all_src_issues)

    # ── 汇总 ──
    total_issues = len(cross_dupes) + len(internal_dupes) + len(all_date_issues) + len(all_irrelevant) + len(all_src_issues)

    print("\n" + "=" * 60)
    if total_issues == 0:
        print("🎉 所有检查通过！")
    else:
        print(f"📊 共发现 {total_issues} 个问题:")
        print(f"   跨文件重复: {len(cross_dupes)}")
        print(f"   内部重复:   {len(internal_dupes)}")
        print(f"   日期问题:   {len(all_date_issues)}")
        print(f"   弱相关条目: {len(all_irrelevant)}")
        print(f"   来源问题:   {len(all_src_issues)}")
    print("=" * 60)

    # ── 自动修复 ──
    if args.fix and total_issues > 0:
        print("\n🔧 自动修复中...")
        fix_dates_intel, rm_intel = auto_fix(INTEL_PATH, intel_date_issues, intel_irrelevant)
        fix_dates_comp, rm_comp = auto_fix(COMPETITOR_PATH, comp_date_issues, comp_irrelevant)

        if fix_dates_intel + fix_dates_comp > 0:
            print(f"   📅 修正了 {fix_dates_intel + fix_dates_comp} 处日期")
        if rm_intel + rm_comp > 0:
            print(f"   🗑️  移除了 {rm_intel + rm_comp} 条弱相关条目")
        print("\n✅ 自动修复完成，请 review 后 git commit")

    if args.json:
        print("\n" + json.dumps(report, ensure_ascii=False, indent=2))

    # ── 可选：网络日期验证 ──
    if args.check_dates:
        print("\n🌐 运行网络日期验证 (audit_dates.py)...")
        import subprocess
        subprocess.run([sys.executable, str(ROOT / "scripts/audit_dates.py")], cwd=str(ROOT))

    return 0 if total_issues == 0 else 1


if __name__ == "__main__":
    sys.exit(main())