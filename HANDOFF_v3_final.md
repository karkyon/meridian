# Meridian — HANDOFF v3（最終完成版）
## 全7フェーズ完了 / v1.0リリース準備完了

---

## 1. 実環境（確定済み）

| 項目 | 値 |
|------|-----|
| サーバー | Ubuntu 24.04 LTS / ホスト名: omega-dev |
| ユーザー | karkyon |
| Node.js | v22.22.2 |
| npm | 10.9.7 |
| Docker | v28.3.3 |
| GitHub | karkyon/meridian（Private） |
| App Port | **3025** |
| DB Port | **5442** |

---

## 2. ディレクトリ構成

```
/home/karkyon/
├── projects/
│   ├── dump-tracker/   ← 別PJ（git: karkyon/dump-tracker-system）
│   └── meridian/       ← 本PJ（git: karkyon/meridian）
└── backups/
    └── dump-tracker-20260504_050857/
```

---

## 3. 起動コマンド

```bash
cd ~/projects/meridian

# DB起動
docker compose up -d

# アプリ起動
npm run dev
# → http://localhost:3025
```

---

## 4. 完成機能一覧（全13画面）

| 画面ID | URL | 状態 |
|--------|-----|------|
| SCR-00 | /setup | ✅ 完成 |
| SCR-11 | /login | ✅ 完成 |
| SCR-01 | /dashboard | ✅ 完成（KPI・フォーカス・週次サマリー） |
| SCR-02 | /projects/[id] | ✅ 完成（概要/ドキュメント/WBSタブ） |
| SCR-03 | /projects/[id]/generate | ✅ 完成（SSEストリーミング） |
| SCR-04 | /projects/[id]/wbs | ✅ 完成（フルCRUD・AI展開） |
| SCR-05 | /priority | ✅ 完成（5軸・D&D・AI提案） |
| SCR-06 | /intelligence/qa | ✅ 完成（RAG Q&A） |
| SCR-07 | /intelligence/synergy | ⬜ 未実装（任意機能） |
| SCR-08 | /intelligence/health | ✅ 完成 |
| SCR-09 | /projects/new, /[id]/edit | ✅ 完成 |
| SCR-10 | /settings | ✅ 完成（APIキー暗号化） |
| SCR-12 | /settings/users | ✅ 完成 |
| SCR-13 | /settings/audit | ✅ 完成（CSV出力） |

---

## 5. 技術スタック（確定）

```
フロントエンド : Next.js 14.2.18 (App Router) + TypeScript
スタイリング   : Tailwind CSS
エディタ       : TipTap（StarterKit + Placeholder + Link）
状態管理       : Zustand（インストール済み・必要に応じて使用）
認証           : NextAuth.js v5 beta.22（JWT + DBセッション）
ORM            : Prisma 5.22.0
DB             : PostgreSQL 16 + pgvector :5442
AI             : @anthropic-ai/sdk（claude-sonnet-4-5）
セキュリティ   : AES-256-GCM（APIキー）/ bcrypt saltRound=12
```

---

## 6. APIエンドポイント完成状況

### 認証
- ✅ POST /api/auth/setup
- ✅ NextAuth /api/auth/*

### プロジェクト
- ✅ GET/POST /api/projects
- ✅ GET/PATCH/DELETE /api/projects/[id]
- ✅ GET /api/projects/[id]/documents
- ✅ GET/PUT /api/projects/[id]/documents/[type]
- ✅ GET/POST /api/projects/[id]/wbs
- ✅ POST /api/projects/[id]/wbs/phases/[phaseId]/tasks
- ✅ POST /api/projects/[id]/generate（SSE）
- ✅ POST /api/projects/[id]/wbs/generate（SSE）

### WBS
- ✅ PATCH/DELETE /api/wbs/tasks/[taskId]

### Intelligence
- ✅ POST /api/intelligence/rag
- ✅ GET /api/intelligence/forecast/[id]
- ✅ POST /api/intelligence/health/[id]
- ✅ POST /api/intelligence/weekly-summary
- ✅ GET /api/intelligence/focus
- ✅ POST /api/intelligence/embeddings/[id]

### 優先度
- ✅ GET/PATCH /api/priority
- ✅ POST /api/priority/scores/[id]
- ✅ POST /api/priority/suggest/[id]

### ユーザー・監査
- ✅ GET/POST /api/users
- ✅ PATCH/DELETE /api/users/[id]
- ✅ GET /api/audit

### 設定
- ✅ GET/PUT /api/settings

---

## 7. DB情報

```
コンテナ名: meridian_postgres
ポート: 5442（ホスト）→ 5432（コンテナ）
DB名: meridian_db
ユーザー: meridian
14テーブル・マイグレーション済み
pgvector IVFFlat インデックス適用済み
```

---

## 8. 残課題・改善案

### 必須対応
- [ ] TipTapエディタ: `@tiptap/extension-character-count` 追加（文字数カウント正確化）
- [ ] document.tsx: DOMPurify でサニタイズ実装（XSS対策完全化）
- [ ] Rate limit: Redisベース実装へ移行（本番環境）

### 任意対応
- [ ] SCR-07: 相乗効果マップ（プロジェクト間技術共通点可視化）
- [ ] ダークモード（Tailwind dark:クラス）
- [ ] テスト追加（Jest + Supertest）
- [ ] package.json: Prisma 7.x へのメジャーアップグレード

---

## 9. 環境変数

```
# /home/karkyon/projects/meridian/.env.local
DATABASE_URL="postgresql://meridian:meridian_secret@localhost:5442/meridian_db"
NEXTAUTH_SECRET="<自動生成済み>"
NEXTAUTH_URL="http://localhost:3025"
ENCRYPTION_KEY="<自動生成済み・64バイトhex>"
POSTGRES_USER=meridian
POSTGRES_PASSWORD=meridian_secret
POSTGRES_DB=meridian_db
POSTGRES_PORT=5442
```

---

## 10. GitHub

```
https://github.com/karkyon/meridian
ブランチ: main
コミット: Phase 1〜6完了済み
```

---

*生成日時: 2026-05-04 / Phase 1〜7完全完了*
