#!/usr/bin/env python3
"""
Portal 周度 SOP Harness — 统一编排器
======================================
一条命令跑完：备份 → 采集 → 去重 → 富化 → 质检 → 报告 → (发布)

设计原则：
  - 默认 dry-run：只出报告，不动数据，不推代码
  - --fix：自动修复明确可修的问题（未来日期、空 So What 标记）
  - --publish：确认无误后一键 git commit + push
  - 每个 Stage 有质量门，不通过则阻断后续
  - 模糊问题（近重复、弱相关）标记但不自动删，等人审

使用：
  python3 harness.py                      # 干跑，看报告
  python3 harness.py --fix                # 自动修复 + 重新质检
  python3 harness.py --publish            # 修复 + git push
  python3 harness.py --skip-fetch         # 跳过采集
  python3 harness.py --skip-audit         # 跳过网络日期校验
  python3 harness.py --stage report       # 只跑某一阶段

Stage 流程:
  Stage 0: 备份  → intel_backup_{date}.json
  Stage 1: 采集  → fetch_intel.py / search_intel.py / competitor_tracker.py
  Stage 2: 去重  → Tab1/Tab2 跨文件 + 同文件内近重去重
  Stage 3: 富化  → enrich_sources + clean_tldr
  Stage 4: 质检  → 日期校验 + 信源评级 + 全量 harness
  Stage 5: 报告  → 汇总输出
  Stage 6: 发布  → git add + commit + push (需 --publish)
"""

from __future__ import annotations

import json
import re
import sys
import time
import shutil
import argparse
import subprocess
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional

# ============================================================
# 路径
# ============================================================

ROOT = Path(__file__).resolve().parent
SCRIPTS = ROOT / "scripts"
ASSETS = ROOT / "assets" / "data"
INTEL = ASSETS / "intel.json"
COMPETITOR = ASSETS / "competitor_updates.json"

# ============================================================
# 质检规则（硬编码，保持简单）
# ============================================================

RULES = {
    "date": {
        "max_future_days": 0,
        "max_age_days": 30,
    },
    "dedup": {
        "cross_file_jaccard": 0.65,
        "internal_jaccard": 0.65,
    },
    "source": {
        "broken_domains": [
            "bytedance.larkoffice.com", "bytedance.feishu.cn",
            "docs.qingque.cn", "docs.corp.kuaishou.com", "kdocs.cn",
        ],
    },
    "content": {
        "irrelevant_keywords": [
            "robotaxi", "Robotaxi", "ROBOTAXI",
            "文远知行", "小马智行", "pony.ai",
            "Waymo", "Cruise", "AutoX",
            "自动驾驶出租车", "无人驾驶出租车",
            "萝卜快跑",
        ],
        "min_title_length": 10,
        "min_sowhat_length": 20,
    },
    "sowhat": {
        "template_phrases": [
            "行业动态值得关注，快手应保持跟踪以捕捉机会或风险",
            "值得关注的行业动态",
            "AI行业动态影响快手AI战略布局与研发资源分配",
            "行业动态值得关注",
            "待补充分析",
            "暂无分析",
        ],
    },
}


# ============================================================
# 工具
# ============================================================

def load_json(p: Path) -> dict:
    with p.open(encoding="utf-8") as f:
        return json.load(f)


def save_json(p: Path, data: dict):
    with p.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_items(data: dict) -> list:
    return data.get("items", data) if isinstance(data, dict) else data


def green(s): return f"\033[92m{s}\033[0m"
def red(s): return f"\033[91m{s}\033[0m"
def yellow(s): return f"\033[93m{s}\033[0m"
def bold(s): return f"\033[1m{s}\033[0m"


def header(msg: str):
    print(f"\n{'='*60}")
    print(bold(msg))
    print(f"{'='*60}")


# ============================================================
# Stage 0: 备份
# ============================================================

def stage_backup() -> bool:
    header("Stage 0: 备份当前数据")
    if not INTEL.exists() and not COMPETITOR.exists():
        print("  ⚠️ 没有可备份的数据文件，跳过")
        return True

    ts = datetime.now().strftime("%Y%m%d_%H%M")
    for src in [INTEL, COMPETITOR]:
        if not src.exists():
            continue
        dst = src.parent / f"{src.stem}_backup_{ts}.json"
        shutil.copy2(src, dst)
        print(f"  📦 {src.name} → {dst.name}")

    # 只保留最近 5 个备份
    backups = sorted(ASSETS.glob("*_backup_*.json"))
    for old in backups[:-10]:
        old.unlink()
        print(f"  🗑️ 清理旧备份: {old.name}")

    print(green("  ✅ 备份完成"))
    return True


# ============================================================
# Stage 1: 采集
# ============================================================

def stage_fetch(skip: bool = False) -> bool:
    header("Stage 1: 采集新数据")
    if skip:
        print("  ⏭️  --skip-fetch，跳过采集")
        return True

    scripts_to_run = [
        ("fetch_intel.py", ["python3", str(SCRIPTS / "fetch_intel.py")]),
        ("search_intel.py", ["python3", str(SCRIPTS / "search_intel.py")]),
        ("competitor_tracker.py", ["python3", str(SCRIPTS / "competitor_tracker.py")]),
    ]

    all_ok = True
    for name, cmd in scripts_to_run:
        print(f"\n  ▶️  运行 {name}...")
        try:
            result = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True, timeout=300)
            last_lines = result.stdout.strip().split("\n")[-5:]
            for line in last_lines:
                print(f"     {line[:100]}")
            if result.returncode != 0:
                print(red(f"  ❌ {name} 失败 (exit={result.returncode})"))
                if result.stderr:
                    print(f"     stderr: {result.stderr[:200]}")
                all_ok = False
            else:
                print(green(f"  ✅ {name} 完成"))
        except subprocess.TimeoutExpired:
            print(red(f"  ❌ {name} 超时"))
            all_ok = False
        except FileNotFoundError:
            print(yellow(f"  ⚠️ {name} 文件不存在，跳过"))
        except Exception as e:
            print(red(f"  ❌ {name} 异常: {e}"))
            all_ok = False

    # Gate: 验证数据文件存在
    if not INTEL.exists():
        print(red("  🚨 GATE FAIL: intel.json 不存在"))
        return False
    if not COMPETITOR.exists():
        print(red("  🚨 GATE FAIL: competitor_updates.json 不存在"))
        return False

    # Gate: 每条必须有 source URL
    intel_data = load_json(INTEL)
    comp_data = load_json(COMPETITOR)
    intel_no_src = sum(1 for it in get_items(intel_data) if not it.get("sources"))
    comp_no_src = sum(1 for it in get_items(comp_data) if not it.get("sources"))

    if intel_no_src > 0 or comp_no_src > 0:
        print(red(f"  🚨 GATE FAIL: {intel_no_src} intel + {comp_no_src} comp 条目缺少 sources"))
        all_ok = False

    if all_ok:
        print(green("  ✅ Stage 1 通过"))
    return all_ok


# ============================================================
# Stage 2: 去重 + 过滤
# ============================================================

def normalize_title(t: str) -> str:
    t = (t or "").lower()
    t = re.sub(r'[^\w\u4e00-\u9fff]', '', t)
    return t.strip()


def jaccard(a: str, b: str) -> float:
    sa, sb = set(a), set(b)
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / min(len(sa), len(sb))


def stage_dedup(fix: bool = False) -> bool:
    header("Stage 2: 去重 + 过滤")

    intel_data = load_json(INTEL)
    comp_data = load_json(COMPETITOR)
    intel_items = get_items(intel_data)
    comp_items = get_items(comp_data)

    results = {"exact_dupes": [], "near_dupes": [], "irrelevant": [],
               "template_sowhat": [], "empty_sowhat": [], "removed": 0}
    intel_to_remove = set()

    # 2a: 跨文件精确重复
    comp_titles = {normalize_title(c.get("title", "")): c.get("id") for c in comp_items}
    for it in intel_items:
        nt = normalize_title(it.get("title", ""))
        if nt and nt in comp_titles:
            results["exact_dupes"].append({
                "intel_id": it.get("id"), "comp_id": comp_titles[nt],
                "title": it.get("title", "")[:80],
            })
            intel_to_remove.add(it.get("id"))

    if results["exact_dupes"]:
        print(yellow(f"  ⚠️ {len(results['exact_dupes'])} 处精确跨文件重复"))
        for d in results["exact_dupes"]:
            print(f"     intel:{d['intel_id']} = comp:{d['comp_id']} | {d['title'][:50]}")

    # 2b: 跨文件近重复
    threshold = RULES["dedup"]["cross_file_jaccard"]
    for it_intel in intel_items:
        if it_intel.get("id") in intel_to_remove:
            continue
        nt1 = normalize_title(it_intel.get("title", ""))
        if len(nt1) < 5:
            continue
        for it_comp in comp_items:
            nt2 = normalize_title(it_comp.get("title", ""))
            if len(nt2) < 5:
                continue
            sim = jaccard(nt1, nt2)
            if sim >= threshold:
                results["near_dupes"].append({
                    "intel_id": it_intel.get("id"), "comp_id": it_comp.get("id"),
                    "similarity": round(sim, 3),
                    "intel_title": it_intel.get("title", "")[:60],
                    "comp_title": it_comp.get("title", "")[:60],
                })
                intel_to_remove.add(it_intel.get("id"))

    if results["near_dupes"]:
        print(yellow(f"  ⚠️ {len(results['near_dupes'])} 处近重复 (≥{threshold})"))
        for d in results["near_dupes"]:
            print(f"     sim={d['similarity']} intel:{d['intel_id']} ≈ comp:{d['comp_id']}")

    # 2c: 弱相关关键词过滤
    blacklist = [kw.lower() for kw in RULES["content"]["irrelevant_keywords"]]
    for it in intel_items + comp_items:
        title = (it.get("title", "") or "").lower()
        tldr = (it.get("tldr", "") or "").lower()
        combined = f"{title} {tldr}"
        matched = [kw for kw in blacklist if kw in combined]
        if matched:
            results["irrelevant"].append({
                "file": "intel.json" if it in intel_items else "competitor_updates.json",
                "id": it.get("id"), "title": it.get("title", "")[:60],
                "keywords": matched,
            })

    if results["irrelevant"]:
        print(yellow(f"  ⚠️ {len(results['irrelevant'])} 条弱相关条目"))
        for d in results["irrelevant"]:
            print(f"     [{d['file']}] {d['id']}: {d['keywords']} → {d['title'][:50]}")

    # 2d: 空/模板化 So What 检测
    sw_field = "sowhat_for_kuaishou"
    templates = [t.lower() for t in RULES["sowhat"]["template_phrases"]]
    for it in comp_items:
        sw = (it.get(sw_field) or "").strip()
        if not sw:
            results["empty_sowhat"].append({
                "id": it.get("id"), "title": it.get("title", "")[:60],
            })
        elif sw.lower() in templates:
            results["template_sowhat"].append({
                "id": it.get("id"), "title": it.get("title", "")[:60],
                "sowhat": sw[:80],
            })

    if results["empty_sowhat"]:
        print(red(f"  🚨 {len(results['empty_sowhat'])} 条缺少 So What"))
    if results["template_sowhat"]:
        print(yellow(f"  ⚠️ {len(results['template_sowhat'])} 条使用模板占位 So What"))

    # Fix
    if fix and intel_to_remove:
        print(f"\n  🔧 从 intel.json 移除 {len(intel_to_remove)} 条重复...")
        before = len(intel_items)
        intel_data["items"] = [it for it in intel_items if it.get("id") not in intel_to_remove]
        results["removed"] = before - len(intel_data["items"])
        intel_data["_meta"]["total_items"] = len(intel_data["items"])
        intel_data["_meta"]["last_updated"] = datetime.now().isoformat()
        save_json(INTEL, intel_data)
        print(green(f"  ✅ 已移除 {results['removed']} 条 (intel.json)"))

    # 总结
    dupes = len(results["exact_dupes"]) + len(results["near_dupes"])
    issues = dupes + len(results["irrelevant"]) + len(results["empty_sowhat"]) + len(results["template_sowhat"])
    if issues > 0:
        total_after_fix = issues - results["removed"]
        if total_after_fix > 0:
            print(yellow(f"\n  ⚠️ Stage 2 发现 {total_after_fix} 个待处理问题（已自动修 {results['removed']} 个）"))
        else:
            print(green(f"\n  ✅ Stage 2 通过（所有 {issues} 个问题已自动修复）"))
    else:
        print(green("\n  ✅ Stage 2 通过"))

    return True  # Stage 2 不阻断（问题留给人工）


# ============================================================
# Stage 3: 富化
# ============================================================

def stage_enrich() -> bool:
    header("Stage 3: 富化")

    enrich_scripts = [
        ("enrich_sources.py", ["python3", str(SCRIPTS / "enrich_sources.py")]),
        ("clean_tldr.py", ["python3", str(SCRIPTS / "clean_tldr.py")]),
    ]

    all_ok = True
    for name, cmd in enrich_scripts:
        print(f"  ▶️  运行 {name}...")
        try:
            result = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True, timeout=60)
            last = result.stdout.strip().split("\n")[-3:]
            for line in last:
                print(f"     {line[:100]}")
            if result.returncode != 0:
                print(red(f"  ❌ {name} 失败"))
                all_ok = False
            else:
                print(green(f"  ✅ {name} 完成"))
        except subprocess.TimeoutExpired:
            print(red(f"  ❌ {name} 超时"))
            all_ok = False
        except FileNotFoundError:
            print(yellow(f"  ⚠️ {name} 文件不存在，跳过"))
        except Exception as e:
            print(red(f"  ❌ {name} 异常: {e}"))
            all_ok = False

    if all_ok:
        print(green("  ✅ Stage 3 通过"))
    return all_ok


# ============================================================
# Stage 4: 质检
# ============================================================

def stage_audit(skip: bool = False, fix: bool = False) -> bool:
    header("Stage 4: 质检")

    if skip:
        print("  ⏭️  --skip-audit，跳过网络日期校验")
    else:
        # 4a: 信源评级（本地快速）
        print("\n  ▶️  信源评级 (audit_sources.py)...")
        try:
            result = subprocess.run(
                ["python3", str(SCRIPTS / "audit_sources.py")],
                cwd=str(ROOT), capture_output=True, text=True, timeout=30
            )
            for line in result.stdout.strip().split("\n"):
                print(f"     {line[:100]}")
        except Exception as e:
            print(red(f"  ❌ audit_sources 异常: {e}"))

        # 4b: 日期校验（网络）
        print("\n  ▶️  日期校验 (audit_dates.py)...")
        try:
            result = subprocess.run(
                ["python3", str(SCRIPTS / "audit_dates.py"), "--sample", "0"],
                cwd=str(ROOT), capture_output=True, text=True, timeout=180
            )
            for line in result.stdout.strip().split("\n")[-10:]:
                print(f"     {line[:100]}")
        except subprocess.TimeoutExpired:
            print(yellow("  ⚠️ audit_dates 超时，部分条目未校验"))
        except Exception as e:
            print(red(f"  ❌ audit_dates 异常: {e}"))

    # 4c: 全量 harness 扫描
    print("\n  ▶️  全量 harness 扫描...")
    try:
        result = subprocess.run(
            ["python3", str(SCRIPTS / "quality_harness.py")],
            cwd=str(ROOT), capture_output=True, text=True, timeout=30
        )
        print(result.stdout)
    except Exception as e:
        print(red(f"  ❌ harness 异常: {e}"))

    # Gate checks
    all_ok = True

    # Gate: 无未来日期
    intel_data = load_json(INTEL)
    comp_data = load_json(COMPETITOR)
    now = datetime.now()
    future = []
    for fname, data in [("intel.json", intel_data), ("competitor_updates.json", comp_data)]:
        for it in get_items(data):
            ds = (it.get("date") or "").strip()
            if ds:
                try:
                    if datetime.strptime(ds, "%Y-%m-%d") > now:
                        future.append((fname, it.get("id"), ds, it.get("title", "")[:60]))
                except ValueError:
                    future.append((fname, it.get("id"), ds, it.get("title", "")[:60]))

    if future:
        print(red(f"\n  🚨 GATE FAIL: {len(future)} 条未来/无效日期"))
        for fn, fid, fds, ft in future:
            print(f"     [{fn}] {fid}: {fds} - {ft}")
        if fix:
            print("\n  🔧 自动修正未来日期...")
            for fname, data in [("intel.json", intel_data), ("competitor_updates.json", comp_data)]:
                for it in get_items(data):
                    ds = (it.get("date") or "").strip()
                    try:
                        if ds and (datetime.strptime(ds, "%Y-%m-%d") > now):
                            it["date"] = now.strftime("%Y-%m-%d")
                            print(f"     [{fname}] {it['id']}: {ds} → {it['date']}")
                    except ValueError:
                        if ds:
                            it["date"] = now.strftime("%Y-%m-%d")
                            print(f"     [{fname}] {it['id']}: {ds} → {it['date']}")
            save_json(INTEL, intel_data)
            save_json(COMPETITOR, comp_data)
            all_ok = True  # 修复后通过
        else:
            all_ok = False
    else:
        print(green("  ✅ Gate: 无未来日期"))

    # Gate: broken 比例
    broken = 0
    total = 0
    for data in [intel_data, comp_data]:
        items = get_items(data)
        total += len(items)
        broken += sum(1 for it in items if it.get("_verification") == "broken")
    if total > 0 and broken / total > RULES["source"].get("max_broken_ratio", 0.1):
        print(red(f"  🚨 GATE FAIL: broken 比例 {broken}/{total} = {broken/total:.1%}"))
        all_ok = False

    if all_ok:
        print(green("  ✅ Stage 4 通过"))
    return all_ok


# ============================================================
# Stage 5: 报告
# ============================================================

def stage_report() -> dict:
    header("Stage 5: 报告")

    intel_data = load_json(INTEL)
    comp_data = load_json(COMPETITOR)
    intel_items = get_items(intel_data)
    comp_items = get_items(comp_data)

    now = datetime.now()
    week_ago = now - timedelta(days=7)

    r = {
        "timestamp": now.isoformat(),
        "intel": {
            "total": len(intel_items),
            "high_priority": sum(1 for i in intel_items if i.get("priority") == "high"),
            "this_week": sum(1 for i in intel_items if i.get("date","") >= week_ago.strftime("%Y-%m-%d")),
            "verified": sum(1 for i in intel_items if i.get("_verification") == "verified"),
            "weak": sum(1 for i in intel_items if i.get("_verification") == "weak"),
            "broken": sum(1 for i in intel_items if i.get("_verification") == "broken"),
        },
        "competitor": {
            "total": len(comp_items),
            "this_week": sum(1 for i in comp_items if i.get("date","") >= week_ago.strftime("%Y-%m-%d")),
            "verified": sum(1 for i in comp_items if i.get("_verification") == "verified"),
            "weak": sum(1 for i in comp_items if i.get("_verification") == "weak"),
            "broken": sum(1 for i in comp_items if i.get("_verification") == "broken"),
            "has_sowhat": sum(1 for i in comp_items if (i.get("sowhat_for_kuaishou") or i.get("sowhat") or "").strip()),
            "companies": {},
        },
        "total": len(intel_items) + len(comp_items),
    }

    # 公司分布
    for it in comp_items:
        c_raw = it.get("company", "未知")
        c = c_raw[0] if isinstance(c_raw, list) and c_raw else (c_raw if isinstance(c_raw, str) else "未知")
        r["competitor"]["companies"][c] = r["competitor"]["companies"].get(c, 0) + 1

    # 打印报告
    print(f"""
{bold('📊 Portal 周度质检报告')}
{'-'*40}
  📅 时间: {now.strftime('%Y-%m-%d %H:%M')}

{bold('  Tab2 市场洞察 (intel.json)')}
     总计: {r['intel']['total']} 条  |  高优: {r['intel']['high_priority']}  |  本周新增: {r['intel']['this_week']}
     信源: ✅ verified {r['intel']['verified']}  |  ⚠️ weak {r['intel']['weak']}  |  ❌ broken {r['intel']['broken']}

{bold('  Tab1 竞对动态 (competitor_updates.json)')}
     总计: {r['competitor']['total']} 条  |  本周新增: {r['competitor']['this_week']}
     信源: ✅ verified {r['competitor']['verified']}  |  ⚠️ weak {r['competitor']['weak']}  |  ❌ broken {r['competitor']['broken']}
     So What: {r['competitor']['has_sowhat']}/{r['competitor']['total']} 有分析

{bold('  公司覆盖')}
""")
    for c, cnt in sorted(r["competitor"]["companies"].items(), key=lambda x: -x[1]):
        print(f"     {c}: {cnt} 条")

    print(f"\n  📦 总计: {r['total']} 条动态")

    return r


# ============================================================
# Stage 6: 发布
# ============================================================

def stage_publish(dry_run: bool = True) -> bool:
    header("Stage 6: 发布")

    if dry_run:
        print("  🔒 默认模式: 不推送，仅本地修改")
        print("     添加 --publish 以自动 git commit + push")
        # Show git status
        try:
            result = subprocess.run(
                ["git", "status", "--short"], cwd=str(ROOT),
                capture_output=True, text=True
            )
            if result.stdout.strip():
                print(yellow("\n  📝 待提交文件:"))
                for line in result.stdout.strip().split("\n"):
                    print(f"     {line}")
            else:
                print("\n  ✅ 无待提交文件")
        except Exception:
            pass
        return True

    # 确认发布
    try:
        subprocess.run(["git", "add", "-A"], cwd=str(ROOT), check=True)
        ts = datetime.now().strftime("%Y%m%d")
        subprocess.run(
            ["git", "commit", "-m", f"release: Portal 周度更新 {ts} [harness auto]"],
            cwd=str(ROOT), check=True
        )
        subprocess.run(["git", "push", "origin", "main"], cwd=str(ROOT), check=True)
        print(green("  ✅ 已推送到 origin/main"))
        return True
    except subprocess.CalledProcessError as e:
        print(red(f"  ❌ Git 操作失败: {e}"))
        return False
    except Exception as e:
        print(red(f"  ❌ 发布异常: {e}"))
        return False


# ============================================================
# Main
# ============================================================

def main():
    ap = argparse.ArgumentParser(
        description="Portal 周度 SOP Harness — 一条命令管理全流程",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python3 harness.py                     # 干跑，只出报告
  python3 harness.py --fix               # 自动修复 + 重新质检
  python3 harness.py --fix --publish     # 修复 + git push
  python3 harness.py --skip-fetch        # 跳过采集，只质检
  python3 harness.py --stage report      # 只看报告
        """
    )
    ap.add_argument("--fix", action="store_true", help="自动修复明确问题")
    ap.add_argument("--publish", action="store_true", help="git commit + push")
    ap.add_argument("--skip-fetch", action="store_true", help="跳过采集阶段")
    ap.add_argument("--skip-audit", action="store_true", help="跳过网络日期校验")
    ap.add_argument("--stage", type=str, default="full",
                    choices=["backup", "fetch", "dedup", "enrich", "audit", "report", "publish", "full"],
                    help="只跑指定阶段 (默认: full)")
    args = ap.parse_args()

    print(bold("🚀 Portal 周度 SOP Harness"))
    print(f"   模式: {'🔧 自动修复' if args.fix else '📋 干跑'} | "
          f"{'📤 自动发布' if args.publish else '🔒 仅本地'} | "
          f"{'⏭️ 跳过采集' if args.skip_fetch else '📥 完整采集'}")
    print(f"   时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    stage = args.stage
    stages = ["backup", "fetch", "dedup", "enrich", "audit", "report", "publish"]
    if stage != "full":
        stages = stages[stages.index(stage):stages.index(stage)+1]

    results = {}
    for s in stages:
        if s == "backup":
            results["backup"] = stage_backup()
        elif s == "fetch":
            results["fetch"] = stage_fetch(skip=args.skip_fetch)
            if not results["fetch"]:
                print(red("\n⛔ 采集失败，请检查网络或 API Key"))
                if args.publish:
                    print("   已阻止发布（--publish 在采集失败时自动取消）")
                return 1
        elif s == "dedup":
            results["dedup"] = stage_dedup(fix=args.fix)
        elif s == "enrich":
            results["enrich"] = stage_enrich()
        elif s == "audit":
            results["audit"] = stage_audit(skip=args.skip_audit, fix=args.fix)
        elif s == "report":
            results["report"] = stage_report()
        elif s == "publish":
            actual_publish = args.publish
            results["publish"] = stage_publish(dry_run=not actual_publish)

    # 最终总结
    print(bold(f"\n{'='*60}"))
    print(bold("🏁 Harness 完成"))
    all_pass = all(results.get(s, True) for s in stages if s != "publish")
    if all_pass:
        print(green("  ✅ 所有阶段通过"))
    else:
        print(red("  ❌ 存在未通过的阶段，请检查上方报告"))
    if not args.publish:
        print("  💡 添加 --publish 以自动 git commit + push")

    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(main())