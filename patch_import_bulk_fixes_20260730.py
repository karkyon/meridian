#!/usr/bin/env python3
"""
patch_import_bulk_fixes_20260730.py

一度きりの適用パッチ（使い切り）。実行後は削除して構いません。

背景: 実データ投入(830件)で276件成功・543件失敗。原因は2つ、いずれも
      src/app/api/projects/[id]/import/documents/route.ts の実装バグ:

  1. CustomDocument.customTypeKey は CustomDocType.key への外部キー制約があるが、
     パイプラインが生成した新規カスタムタイプ（ai_chat_log等）を事前登録せずに
     CustomDocumentを作成しようとして外部キー制約違反（466件）
  2. Promise.allSettledによる並列処理で、同一(projectId, docType)を複数ファイルが
     同時に「無ければ作成」しようとするレースコンディション（10件、一意制約違反）

修正内容:
  1. custom対象の場合、CustomDocument作成前に CustomDocType を upsert して
     外部キー制約を必ず満たすようにする
  2. Document / CustomDocument の find-then-create を upsert に置き換え、
     レースコンディションを解消する

実行方法:
    cd ~/projects/meridian
    python3 patch_import_bulk_fixes_20260730.py

実行後:
    npm run build   # コンパイルエラー0を確認
    pm2 restart meridian
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TARGET = "src/app/api/projects/[id]/import/documents/route.ts"


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
# 1. Document: find-then-create -> upsert（レースコンディション解消）
# ------------------------------------------------------------------
replace_exact(
    TARGET,
    '''  if (target.kind === "standard") {
    let doc = await prisma.document.findUnique({
      where: { projectId_docType: { projectId, docType: target.docType as never } },
    });
    if (!doc) {
      doc = await prisma.document.create({
        data: { projectId, docType: target.docType as never, content: "", completeness: 0, version: 1 },
      });
    }''',
    '''  if (target.kind === "standard") {
    // upsertで find-then-create のレースコンディションを回避する
    // （Promise.allSettledで同一docTypeの複数ファイルが並列処理されるとfindUnique後のcreateが競合しうるため）
    const doc = await prisma.document.upsert({
      where: { projectId_docType: { projectId, docType: target.docType as never } },
      update: {},
      create: { projectId, docType: target.docType as never, content: "", completeness: 0, version: 1 },
    });''',
)

# ------------------------------------------------------------------
# 2. custom対象: CustomDocType を先にupsertしてからCustomDocumentをupsert
#    （外部キー制約違反・レースコンディション両方を解消）
# ------------------------------------------------------------------
replace_exact(
    TARGET,
    '''  // target.kind === "custom"
  const globalType = await prisma.customDocType.findUnique({ where: { key: target.customTypeKey } });
  const projectType = !globalType
    ? await prisma.projectCustomDocType.findUnique({
        where: { projectId_key: { projectId, key: target.customTypeKey } },
      })
    : null;
  const typeLabel = target.customTypeLabel ?? globalType?.label ?? projectType?.label ?? target.customTypeKey;

  let customDoc = await prisma.customDocument.findUnique({
    where: { projectId_customTypeKey: { projectId, customTypeKey: target.customTypeKey } },
  });
  if (!customDoc) {
    customDoc = await prisma.customDocument.create({
      data: {
        projectId,
        customTypeKey: target.customTypeKey,
        customTypeLabel: typeLabel,
        content: "",
        version: 1,
        completeness: 0,
        createdBy,
      },
    });
  }''',
    '''  // target.kind === "custom"
  const globalType = await prisma.customDocType.findUnique({ where: { key: target.customTypeKey } });
  const projectType = !globalType
    ? await prisma.projectCustomDocType.findUnique({
        where: { projectId_key: { projectId, key: target.customTypeKey } },
      })
    : null;
  const typeLabel = target.customTypeLabel ?? globalType?.label ?? projectType?.label ?? target.customTypeKey;

  // CustomDocument.customTypeKey は CustomDocType.key への外部キー制約があるため、
  // パイプライン由来の新規キーは事前にグローバル登録しておく必要がある（upsertで冪等に）
  if (!globalType) {
    await prisma.customDocType.upsert({
      where: { key: target.customTypeKey },
      update: {},
      create: { key: target.customTypeKey, label: typeLabel },
    });
  }

  // upsertで find-then-create のレースコンディションを回避する
  const customDoc = await prisma.customDocument.upsert({
    where: { projectId_customTypeKey: { projectId, customTypeKey: target.customTypeKey } },
    update: {},
    create: {
      projectId,
      customTypeKey: target.customTypeKey,
      customTypeLabel: typeLabel,
      content: "",
      version: 1,
      completeness: 0,
      createdBy,
    },
  });''',
)

print("\n=== すべての変更を適用しました ===")
print("次のコマンドを実行してください:")
print("  npm run build")
print("  pm2 restart meridian")
