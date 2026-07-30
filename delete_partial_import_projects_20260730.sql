-- delete_partial_import_projects_20260730.sql
--
-- 一度きりの削除スクリプト。実行後は削除して構いません。
--
-- 背景: bulk importのバグ（FK制約違反・レースコンディション）修正前に実行した
--       初回投入で、17プロジェクトが276件のみ中途半端にインポートされた状態。
--       バグ修正後にクリーンな状態から再投入するため、一旦削除する。
--
-- 対象: 2026-07-30の05_import.py実行で新規作成された17プロジェクト
--       （全て import-ensure で新規作成されたもので、他の実データとの依存関係なし）
--
-- 安全性: projects配下の全関連テーブル(documents, custom_documents, project_tech_stacks,
--        wbs_phases, project_attachments, project_analyses 等)は
--        全て onDelete: Cascade のため、この削除だけで連鎖的にクリーンアップされる
--        （schema.prisma全体を確認済み、孤立行は残らない）。
--
-- 実行前に対象件数を確認:
SELECT id, name, created_at FROM projects WHERE id IN (
  '178e2bf8-2468-4531-802c-c3e07c14ff97',
  '25ba34e2-760d-4efd-8588-8d74ebdc7247',
  'bd7de729-51d3-43e4-a8ae-e29f581ed6a8',
  '454e6607-2ddb-4664-a3e4-d8fd1528c190',
  '13765705-52ee-41e2-b252-463242e2720b',
  '9a28f460-0727-4c31-ba2f-044c01b6e38c',
  'c3d8037e-9fdb-4226-8204-ac88482624f8',
  '1a743207-5b6d-47c1-a129-8b001cc4d968',
  'eef60e4c-70aa-4927-96bd-d0cf6590109e',
  'c30492a2-6271-4e39-945d-9a86f82bec37',
  '11205716-06fc-429b-8357-f2a86303f8c9',
  'd1c36b21-bdfe-4075-be2e-4f638795a8d7',
  'de70efa4-1d53-4e5a-bd26-75fca95bcadf',
  'a61f95c6-c2f4-4fbc-9da9-e6f5180e4fa4',
  '5cc5dc4c-3e2f-4483-ad01-eb1b9d2bc947',
  '7d7272ee-f22c-4caa-a1ed-dbaa3a37ba72',
  '150c0715-183b-464d-88d0-c4b56c82638f'
);
-- ↑ 17件表示されることを確認してから、下のDELETEを実行すること

-- 本体: 削除実行（カスケードで関連レコードも全て削除される）
DELETE FROM projects WHERE id IN (
  '178e2bf8-2468-4531-802c-c3e07c14ff97',
  '25ba34e2-760d-4efd-8588-8d74ebdc7247',
  'bd7de729-51d3-43e4-a8ae-e29f581ed6a8',
  '454e6607-2ddb-4664-a3e4-d8fd1528c190',
  '13765705-52ee-41e2-b252-463242e2720b',
  '9a28f460-0727-4c31-ba2f-044c01b6e38c',
  'c3d8037e-9fdb-4226-8204-ac88482624f8',
  '1a743207-5b6d-47c1-a129-8b001cc4d968',
  'eef60e4c-70aa-4927-96bd-d0cf6590109e',
  'c30492a2-6271-4e39-945d-9a86f82bec37',
  '11205716-06fc-429b-8357-f2a86303f8c9',
  'd1c36b21-bdfe-4075-be2e-4f638795a8d7',
  'de70efa4-1d53-4e5a-bd26-75fca95bcadf',
  'a61f95c6-c2f4-4fbc-9da9-e6f5180e4fa4',
  '5cc5dc4c-3e2f-4483-ad01-eb1b9d2bc947',
  '7d7272ee-f22c-4caa-a1ed-dbaa3a37ba72',
  '150c0715-183b-464d-88d0-c4b56c82638f'
);
