#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/overview_autofill/run_all.py

全プロジェクトに対して POST /api/projects/{id}/overview/autofill を順次呼び出し、
GitHubの実コード + 資料（企画書・要件定義書・README等）から
概要欄・技術スタックを自動で埋める。

前提:
- Meridianの設定画面でインポート専用APIキー（mrd_imp_...）が発行済みであること
- Claude APIキーが設定済みであること（未設定の場合、各プロジェクトでCLAUDE_API_KEY_NOT_SETエラー）
- GitHubリポジトリが未設定のプロジェクトは資料のみから推定される（エラーにはならない）

使い方:
    python3 scripts/overview_autofill/run_all.py \\
        --base-url http://localhost:3025 \\
        --import-key mrd_imp_xxxxxxxx \\
        --project-map /path/to/project_map.json

    # project_map.json が無い場合は --project-ids で直接指定も可能
    python3 scripts/overview_autofill/run_all.py \\
        --base-url http://localhost:3025 \\
        --import-key mrd_imp_xxxxxxxx \\
        --project-ids id1,id2,id3

project_map.json の形式（scripts/import_pipeline/05_import.py が生成するものと同一）:
    { "プロジェクト名": "uuid", ... }

実行間隔はデフォルト3秒（Claude APIのレート制限・コスト急増を避けるため）。
"""

import argparse
import json
import sys
import time
import urllib.request
import urllib.error
from typing import Optional


def load_project_ids(project_map_path: Optional[str], project_ids_arg: Optional[str]) -> dict:
    if project_ids_arg:
        ids = [p.strip() for p in project_ids_arg.split(",") if p.strip()]
        return {pid: pid for pid in ids}

    if project_map_path:
        with open(project_map_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            raise ValueError("project_map.json の形式が不正です（{name: id} 形式である必要があります）")
        return data

    raise ValueError("--project-map か --project-ids のいずれかを指定してください")


def call_autofill(base_url: str, project_id: str, import_key: str, timeout: int = 180) -> dict:
    url = f"{base_url.rstrip('/')}/api/projects/{project_id}/overview/autofill"
    req = urllib.request.Request(
        url,
        method="POST",
        headers={
            "Authorization": f"Bearer {import_key}",
            "Content-Type": "application/json",
        },
        data=b"{}",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return {"ok": True, "status": res.status, "body": json.loads(res.read().decode("utf-8"))}
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")
        try:
            body = json.loads(body_text)
        except json.JSONDecodeError:
            body = {"raw": body_text}
        return {"ok": False, "status": e.code, "body": body}
    except urllib.error.URLError as e:
        return {"ok": False, "status": None, "body": {"error": "CONNECTION_FAILED", "message": str(e)}}


def main():
    parser = argparse.ArgumentParser(description="全プロジェクトの概要・技術スタックをAIで自動入力する")
    parser.add_argument("--base-url", required=True, help="例: http://localhost:3025")
    parser.add_argument("--import-key", required=True, help="mrd_imp_... のインポート専用APIキー")
    parser.add_argument("--project-map", help="project_map.json のパス（{name: id} 形式）")
    parser.add_argument("--project-ids", help="カンマ区切りのプロジェクトID一覧（project-mapの代わり）")
    parser.add_argument("--interval-sec", type=float, default=3.0, help="各プロジェクト間の待機秒数（デフォルト3秒）")
    parser.add_argument("--dry-run", action="store_true", help="実際には呼び出さず対象一覧のみ表示")
    args = parser.parse_args()

    try:
        projects = load_project_ids(args.project_map, args.project_ids)
    except (ValueError, FileNotFoundError, json.JSONDecodeError) as e:
        print(f"[ERROR] プロジェクト一覧の読み込みに失敗しました: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"[INFO] 対象プロジェクト数: {len(projects)}")

    if args.dry_run:
        for name, pid in projects.items():
            print(f"  - {name} ({pid})")
        return

    results = {}
    success_count = 0
    fail_count = 0

    for i, (name, pid) in enumerate(projects.items(), start=1):
        print(f"[{i}/{len(projects)}] 投入開始: {name} ({pid})")
        result = call_autofill(args.base_url, pid, args.import_key)
        results[name] = result

        if result["ok"]:
            applied = result["body"].get("applied", {})
            notes = result["body"].get("consistency_notes")
            print(f"  [OK] tech_stack={applied.get('tech_stack_count')} "
                  f"key_features={applied.get('key_features_count')}")
            if notes:
                print(f"  [注意] 資料とコードの不整合: {notes}")
            success_count += 1
        else:
            print(f"  [FAILED] status={result['status']} body={result['body']}")
            fail_count += 1

        if i < len(projects):
            time.sleep(args.interval_sec)

    print()
    print(f"=== 完了: 成功={success_count} 失敗={fail_count} ===")

    out_path = "overview_autofill_results.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"詳細結果: {out_path}")


if __name__ == "__main__":
    main()
