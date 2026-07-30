#!/usr/bin/env python3
"""
patch_project_detail_files_and_suggest_fix_20260730.py

一度きりの適用パッチ（使い切り）。実行後は削除して構いません。

背景: パッチ7適用後に2つの不具合が報告された。

  1. 資料のあるカテゴリでファイル名・件数が表示されない
     — src/app/(dashboard)/projects/[id]/page.tsx のPrismaクエリで
       customDocuments.files が取得されておらず(_countのみ)、
       ProjectDetailClient側に渡るデータにfilesが常に空だったため。

  2. カテゴリ追加のサジェストリストが表示されないケースがある
     — ProjectDetailClient.tsx のサジェスト候補フィルタが「このプロジェクトに
       既に追加済みのカテゴリ」を候補から除外していたため、唯一の一致が
       追加済みカテゴリだった場合に候補が0件になり、サジェストが全く
       機能していないように見えていた。除外せず「追加済み」として
       表示するよう変更する。

修正内容:
  1. page.tsx: customDocuments クエリに files(originalName/completeness/version)
     の取得を追加し、customDocMap・customDocTypes に伝播させる
  2. ProjectDetailClient.tsx: サジェスト候補から既存追加カテゴリの除外をやめ、
     「追加済み」ラベル付き・選択不可で表示するよう変更

実行方法:
    cd ~/projects/meridian
    python3 patch_project_detail_files_and_suggest_fix_20260730.py

実行後:
    npm run build
    pm2 restart meridian
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PAGE_TARGET = "src/app/(dashboard)/projects/[id]/page.tsx"
CLIENT_TARGET = "src/components/projects/ProjectDetailClient.tsx"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_exact(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count == 0:
        print(f"[FAIL] 置換対象の文字列が見つかりません: {path}")
        sys.exit(1)
    if count > 1:
        print(f"[FAIL] 置換対象の文字列が複数箇所に一致しました（一意でない）: {path} ({count}箇所)")
        sys.exit(1)
    write(path, content.replace(old, new, 1))
    print(f"[OK] 変更: {path}")


# ------------------------------------------------------------------
# 1a. page.tsx — customDocuments クエリに files を追加
# ------------------------------------------------------------------
replace_exact(
    PAGE_TARGET,
    '''      customDocuments: {
        include: {
          customDocType: { select: { key: true, label: true } },
          _count: { select: { files: true } },
        },
      },''',
    '''      customDocuments: {
        include: {
          customDocType: { select: { key: true, label: true } },
          files: { select: { originalName: true, completeness: true, version: true }, orderBy: { createdAt: "desc" } },
          _count: { select: { files: true } },
        },
      },''',
)

# ------------------------------------------------------------------
# 1b. page.tsx — CustomDocEntry型・customDocMapにfilesを追加
# ------------------------------------------------------------------
replace_exact(
    PAGE_TARGET,
    '''  type CustomDocEntry = {
    completeness: number;
    version: number;
    _count: { files: number } | null;
  };
  const customDocMap = new Map<string, CustomDocEntry>(
    project.customDocuments.map((d: any) => [d.customTypeKey, {
      completeness: d.completeness,
      version: d.version,
      _count: d._count,
    }])
  );''',
    '''  type CustomDocEntry = {
    completeness: number;
    version: number;
    _count: { files: number } | null;
    files: { originalName: string; completeness: number; version: number }[];
  };
  const customDocMap = new Map<string, CustomDocEntry>(
    project.customDocuments.map((d: any) => [d.customTypeKey, {
      completeness: d.completeness,
      version: d.version,
      _count: d._count,
      files: (d.files ?? []).map((f: any) => ({ originalName: f.originalName, completeness: f.completeness, version: f.version })),
    }])
  );''',
)

# ------------------------------------------------------------------
# 1c. page.tsx — 最終customDocTypesにfilesを含める
# ------------------------------------------------------------------
replace_exact(
    PAGE_TARGET,
    '''    return {
      key: t.key,
      label: t.label,
      completeness: doc?.completeness ?? 0,
      version: doc?.version ?? 0,
      fileCount: doc?._count?.files ?? 0,
    };
  });''',
    '''    return {
      key: t.key,
      label: t.label,
      completeness: doc?.completeness ?? 0,
      version: doc?.version ?? 0,
      fileCount: doc?._count?.files ?? 0,
      files: doc?.files ?? [],
    };
  });''',
)

# ------------------------------------------------------------------
# 2a. ProjectDetailClient.tsx — サジェスト候補フィルタの修正
# ------------------------------------------------------------------
replace_exact(
    CLIENT_TARGET,
    '''  const trimmed = query.trim();
  const suggestions = trimmed
    ? allTypes.filter((t) => t.label.toLowerCase().includes(trimmed.toLowerCase()) && !existingKeys.has(t.key)).slice(0, 8)
    : [];
  const exactMatch = allTypes.some((t) => t.label.toLowerCase() === trimmed.toLowerCase());''',
    '''  const trimmed = query.trim();
  // 既にこのプロジェクトに追加済みのカテゴリも候補から除外せず表示する。
  // （唯一の一致が追加済みカテゴリだった場合に候補が0件になり、サジェストが
  //   全く機能していないように見えてしまうため。追加済みは選択不可で表示する）
  const suggestions = trimmed
    ? allTypes.filter((t) => t.label.toLowerCase().includes(trimmed.toLowerCase())).slice(0, 8)
    : [];
  const exactMatch = allTypes.some((t) => t.label.toLowerCase() === trimmed.toLowerCase());''',
)

# ------------------------------------------------------------------
# 2b. ProjectDetailClient.tsx — サジェスト候補の描画部分の修正
# ------------------------------------------------------------------
replace_exact(
    CLIENT_TARGET,
    '''              {suggestions.map((t) => (
                <button
                  key={t.key}
                  onClick={() => selectExisting(t)}
                  className="w-full text-left text-sm px-3 py-2.5 hover:bg-slate-50 flex items-center justify-between"
                >
                  <span>{t.label}</span>
                  <span className="text-[10px] text-slate-400 shrink-0 ml-2">既存カテゴリを使う</span>
                </button>
              ))}
              {!exactMatch && (
                <button
                  onClick={handleCreateNew}
                  disabled={adding}
                  className="w-full text-left text-sm px-3 py-2.5 hover:bg-slate-50 text-[#1D6FA4] font-medium disabled:opacity-50 border-t border-slate-100"
                >
                  {adding ? "作成中..." : `+ 新規カテゴリとして「${trimmed}」を作成`}
                </button>
              )}
              {suggestions.length === 0 && exactMatch && (
                <div className="text-xs text-slate-400 px-3 py-2.5">一致する既存カテゴリはこのプロジェクトに追加済みです</div>
              )}''',
    '''              {suggestions.map((t) => {
                const alreadyAdded = existingKeys.has(t.key);
                return (
                  <button
                    key={t.key}
                    onClick={() => !alreadyAdded && selectExisting(t)}
                    disabled={alreadyAdded}
                    className={`w-full text-left text-sm px-3 py-2.5 flex items-center justify-between ${
                      alreadyAdded ? "text-slate-300 cursor-default" : "hover:bg-slate-50"
                    }`}
                  >
                    <span>{t.label}</span>
                    <span className="text-[10px] text-slate-400 shrink-0 ml-2">
                      {alreadyAdded ? "追加済み" : "既存カテゴリを使う"}
                    </span>
                  </button>
                );
              })}
              {suggestions.length === 0 && (
                <div className="text-xs text-slate-400 px-3 py-2.5">一致する既存カテゴリはありません</div>
              )}
              {!exactMatch && (
                <button
                  onClick={handleCreateNew}
                  disabled={adding}
                  className="w-full text-left text-sm px-3 py-2.5 hover:bg-slate-50 text-[#1D6FA4] font-medium disabled:opacity-50 border-t border-slate-100"
                >
                  {adding ? "作成中..." : `+ 新規カテゴリとして「${trimmed}」を作成`}
                </button>
              )}''',
)

print("\n=== すべての変更を適用しました ===")
print("次のコマンドを実行してください:")
print("  npm run build")
print("  pm2 restart meridian")
