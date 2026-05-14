# Meridian — Project Intelligence System

> AI駆動のプロジェクト管理・ドキュメント自動生成システム

---

## 目次

1. [システム概要](#1-システム概要)
2. [機能一覧](#2-機能一覧)
3. [技術スタック](#3-技術スタック)
4. [ディレクトリ構造](#4-ディレクトリ構造)
5. [前提条件](#5-前提条件)
6. [初回セットアップ](#6-初回セットアップ)
7. [環境変数](#7-環境変数)
8. [起動・停止（開発環境）](#8-起動停止開発環境)
9. [常時稼働設定（PM2）](#9-常時稼働設定pm2)
10. [日常的な操作コマンド](#10-日常的な操作コマンド)
11. [データベース管理](#11-データベース管理)
12. [バックアップ・リストア](#12-バックアップリストア)
13. [ユーザー管理](#13-ユーザー管理)
14. [トラブルシューティング](#14-トラブルシューティング)
15. [画面・URL一覧](#15-画面url一覧)
16. [権限マトリクス](#16-権限マトリクス)
17. [セキュリティ](#17-セキュリティ)

---

## 1. システム概要

Meridianは個人開発者向けのAI搭載プロジェクト管理システムです。複数プロジェクトのドキュメント（企画書・要件定義書・DB仕様書・API設計書等）をClaude APIで自動生成し、WBS管理・優先度スコアリング・横断検索（RAG）を一元管理します。

### アクセス

| 環境 | URL |
|---|---|
| 開発サーバ | http://localhost:3025 |
| 本番（PM2） | http://localhost:3025 |
| LAN公開時 | http://[マシンのIPアドレス]:3025 |

---

## 2. 機能一覧

| 機能 | 説明 |
|---|---|
| AI ドキュメント自動生成 | Claude APIで企画書・要件定義書・外部仕様書・DB仕様書・API設計書を一括生成（SSEストリーミング） |
| WBS 管理 | フェーズ・タスクのCRUD・進捗自動算出・AI自動展開 |
| 5軸優先度スコアリング | Impact / Urgency / Learning / Cost / Motivation でスコア算出・D&D並べ替え |
| RAG Q&A | pgvectorを使った全ドキュメント横断検索・AI回答 |
| 相乗効果マップ | プロジェクト間の技術共通点・コード再利用可能性をAIが検出 |
| 技術ヘルスレポート | 依存ライブラリの陳腐化・脆弱性リスクをスコア表示 |
| AI進捗推定 | GitHubリポジトリ解析でタスク完了状況を自動推定 |
| 週次AIサマリー | 全プロジェクトの進捗変化を毎週自動レポート |
| フォーカスモード | 今日やるべきタスクTop 3をAIが選出 |
| 添付資料管理 | Word/PDF/Markdown/HTMLをアップロード・閲覧・編集、AI生成の参照資料として活用 |
| ユーザー管理 | Admin / Viewer の2ロール。Viewerの追加・削除・ロック解除 |
| 監査ログ | 全Admin操作を記録・CSV出力 |

---

## 3. 技術スタック

| レイヤー | 技術 | バージョン |
|---|---|---|
| フロントエンド | Next.js (App Router) | 14.2.18 |
| 言語 | TypeScript | 5.6 |
| スタイリング | Tailwind CSS | 3.4 |
| 認証 | NextAuth.js v5 | 5.0.0-beta |
| ORM | Prisma | 5.22 |
| データベース | PostgreSQL + pgvector | 16 |
| コンテナ | Docker Compose | — |
| AI | Claude API (Anthropic) | claude-sonnet-4系 |
| プロセス管理 | PM2 | 最新 |

---

## 4. ディレクトリ構造

```
meridian/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/             # ログイン・セットアップ画面
│   │   ├── (dashboard)/        # ダッシュボード・各機能画面
│   │   └── api/                # APIルート
│   ├── components/             # Reactコンポーネント
│   ├── lib/                    # ユーティリティ（auth, prisma, crypto等）
│   └── types/                  # TypeScript型定義
├── prisma/
│   ├── schema.prisma           # DBスキーマ定義
│   ├── migrations/             # マイグレーションファイル
│   └── seed.ts                 # 初期データ
├── docker/
│   └── init/                   # PostgreSQL初期化スクリプト
├── uploads/                    # アップロードファイル保存先（gitignore）
├── logs/                       # PM2ログ（gitignore）
├── docker-compose.yml
├── ecosystem.config.js         # PM2設定
├── .env.local                  # 環境変数（gitignore）
└── next.config.js
```

---

## 5. 前提条件

以下がインストール済みであること。

- **Node.js** 20以上 (`node -v` で確認)
- **Docker Desktop** (DockerとDocker Composeが使えること)
- **npm** 10以上

```bash
# バージョン確認
node -v       # v20.x.x 以上
docker -v     # Docker version 24.x.x 以上
npm -v        # 10.x.x 以上
```

---

## 6. 初回セットアップ

### 手順1: リポジトリ取得・依存インストール

```bash
cd ~/projects/meridian
npm install
```

### 手順2: 環境変数ファイル作成

```bash
cp .env.example .env.local
# .env.local を編集（次章「環境変数」参照）
```

### 手順3: データベース起動・マイグレーション

```bash
# PostgreSQLコンテナ起動
docker compose up -d

# コンテナの起動を待つ（healthcheckが通るまで約10秒）
sleep 10

# マイグレーション実行
npm run db:migrate

# Prismaクライアント生成
npm run db:generate
```

### 手順4: アプリ起動

```bash
npm run dev
```

### 手順5: 管理者アカウント作成（初回のみ）

ブラウザで http://localhost:3025 を開くと自動的に `/setup` にリダイレクトされます。
メールアドレス・表示名・パスワード（8文字以上・英字+数字+記号）を入力して管理者アカウントを作成してください。

> **Note:** usersテーブルが空の場合のみセットアップ画面が表示されます。2回目以降は `/login` にリダイレクトされます。

### 手順6: 設定画面でClaude APIキーを登録

ログイン後、`設定` → `Claude APIキー` に Anthropic の APIキーを登録してください。AI機能が有効になります。

---

## 7. 環境変数

`.env.local` に以下を設定します。

```bash
# ─── データベース ───────────────────────────────────────────
# docker-compose.yml の POSTGRES_USER/PASSWORD/DB と合わせること
DATABASE_URL="postgresql://meridian:meridian_secret@localhost:5442/meridian_db"

# ─── 認証 ──────────────────────────────────────────────────
# 任意の長い文字列（32文字以上推奨）
# 生成例: openssl rand -base64 32
NEXTAUTH_SECRET="your-super-secret-key-here"

# アプリのベースURL（本番では実際のIPアドレスに変更）
NEXTAUTH_URL="http://localhost:3025"

# ─── 暗号化（Claude APIキーのDB保存に使用）────────────────
# 必ず64文字の16進数文字列（32バイト）
# 生成例: openssl rand -hex 32
ENCRYPTION_KEY="your-64-char-hex-encryption-key-here"

# ─── ファイルアップロード先 ────────────────────────────────
# 絶対パスで指定
UPLOAD_DIR="/home/karkyon/projects/meridian/uploads"

# ─── (オプション) GitHub PAT ───────────────────────────────
# AI進捗推定機能でGitHubリポジトリを解析する場合に設定
# GITHUB_PAT="ghp_xxxxxxxxxxxxxxxxxxxx"
```

### ENCRYPTION_KEY の生成方法

```bash
# Linux / WSL / macOS
openssl rand -hex 32

# Node.jsで生成
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### NEXTAUTH_SECRET の生成方法

```bash
openssl rand -base64 32
```

---

## 8. 起動・停止（開発環境）

開発中は以下のコマンドで操作します。VSCodeを閉じると停止します。

```bash
# PostgreSQL起動（初回またはPC再起動後）
docker compose up -d

# 開発サーバ起動（ホットリロード有効）
npm run dev

# 停止（Ctrl+C でnpmを止めた後）
docker compose down
```

---

## 9. 常時稼働設定（PM2）

VSCodeを閉じてもPC再起動後も自動起動させる本番運用設定です。

### 9-1. PM2インストール

```bash
npm install -g pm2
```

### 9-2. PM2設定ファイル作成

プロジェクトルートに `ecosystem.config.js` を作成します。

```js
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "meridian",
      script: "node_modules/.bin/next",
      args: "start -p 3025",
      cwd: "/home/karkyon/projects/meridian",  // ← 自分の絶対パスに変更
      env: {
        NODE_ENV: "production",
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      out_file: "./logs/out.log",
      error_file: "./logs/error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
```

```bash
# logsディレクトリ作成
mkdir -p ~/projects/meridian/logs
```

### 9-3. ビルドして起動

```bash
cd ~/projects/meridian

# 本番ビルド（必須）
npm run build

# PM2で起動
pm2 start ecosystem.config.js

# 状態確認
pm2 status
```

### 9-4. PC再起動後の自動起動登録

```bash
# スタートアップ登録コマンドを生成・表示
pm2 startup

# ↑ 表示されたsudoコマンドをそのままコピー&実行（例）
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u karkyon --hp /home/karkyon

# 現在の起動状態を保存
pm2 save
```

### 9-5. Dockerの自動起動設定

`docker-compose.yml` に `restart: unless-stopped` が設定済みのため、Docker Desktopが自動起動していれば、コンテナも自動で再起動します。

Docker Desktopの「Settings → General → Start Docker Desktop when you log in」をオンにしてください。

---

## 10. 日常的な操作コマンド

### アプリ操作

```bash
# ─── PM2（本番）───────────────────────────────────────────

# 状態確認
pm2 status

# 再起動（コード更新後）
npm run build && pm2 restart meridian

# 停止
pm2 stop meridian

# 起動
pm2 start meridian

# 削除（PM2管理から外す）
pm2 delete meridian

# リアルタイムログ表示
pm2 logs meridian

# 過去100行のログ表示
pm2 logs meridian --lines 100

# ログをクリア
pm2 flush meridian

# CPU/メモリ使用量モニター
pm2 monit

# ─── 開発サーバ ────────────────────────────────────────────

# 開発サーバ起動
npm run dev

# 本番ビルド確認
npm run build && npm run start
```

### Docker操作

```bash
# DBコンテナ起動
docker compose up -d

# DBコンテナ停止（データは保持）
docker compose stop

# DBコンテナ停止＋ネットワーク削除
docker compose down

# DBコンテナ強制再起動
docker compose restart postgres

# コンテナの状態確認
docker compose ps

# コンテナのログ確認
docker compose logs postgres

# コンテナのログをリアルタイム表示
docker compose logs -f postgres
```

### ビルド・リント

```bash
# 本番ビルド
npm run build

# 型チェック
npx tsc --noEmit

# Lintチェック
npm run lint
```

---

## 11. データベース管理

### Prismaコマンド

```bash
# マイグレーション実行（開発環境）
npm run db:migrate

# マイグレーション実行（本番環境・安全）
npm run db:migrate:prod

# Prismaクライアント再生成（schema.prisma変更後）
npm run db:generate

# Prisma Studio（GUIでDBを閲覧・編集）
npm run db:studio
# → http://localhost:5555 で開く

# DBをリセット（全データ削除＋再マイグレーション）⚠️危険
npm run db:reset
```

### PostgreSQL直接操作

```bash
# psqlで接続
docker exec -it meridian_postgres psql -U meridian -d meridian_db

# よく使うSQLコマンド
\dt                          # テーブル一覧
\d users                     # テーブル構造確認
SELECT COUNT(*) FROM users;  # ユーザー数確認
SELECT id, email, role FROM users;  # ユーザー一覧
\q                           # 終了
```

### マイグレーションファイルの確認

```bash
# 適用済みマイグレーション確認
npx prisma migrate status
```

---

## 12. バックアップ・リストア

### DBバックアップ

```bash
# バックアップ（推奨：定期実行）
docker exec meridian_postgres pg_dump \
  -U meridian \
  -d meridian_db \
  -F c \
  -f /tmp/meridian_backup_$(date +%Y%m%d_%H%M%S).dump

# バックアップファイルをホストに取り出す
docker cp meridian_postgres:/tmp/meridian_backup_*.dump ./backups/
```

### DBリストア

```bash
# リストア（⚠️ 既存データが上書きされます）
docker exec -i meridian_postgres pg_restore \
  -U meridian \
  -d meridian_db \
  --clean \
  -f /tmp/meridian_backup_YYYYMMDD_HHMMSS.dump
```

### アップロードファイルのバックアップ

```bash
# uploadsディレクトリをアーカイブ
tar -czf uploads_backup_$(date +%Y%m%d).tar.gz uploads/
```

### バックアップの自動化（cron例）

```bash
# crontabに追加（毎日2:00にバックアップ）
crontab -e

# 以下を追記
0 2 * * * docker exec meridian_postgres pg_dump -U meridian -d meridian_db -F c > /home/karkyon/backups/meridian_$(date +\%Y\%m\%d).dump
```

---

## 13. ユーザー管理

### ロール

| ロール | 説明 |
|---|---|
| Admin | 全機能を操作可能。プロジェクト作成・ドキュメント編集・AI生成・ユーザー管理・設定 |
| Viewer | 閲覧のみ。プロジェクト・ドキュメント・WBS・ダッシュボード等を読み取り専用で閲覧 |

### Viewerの追加

ログイン後、`管理 → ユーザー管理 → Viewerを追加` からGUI操作で追加できます。

### アカウントロック解除

ログイン5回失敗でアカウントが30分ロックされます。
管理画面の `ユーザー管理` でロック解除ボタンが表示されます。

### パスワード強度要件

- 8文字以上
- 英字・数字・記号（!@#$%等）をそれぞれ1文字以上含む

### CLIでの管理者パスワードリセット（緊急時）

```bash
# Node.jsスクリプトで直接更新
docker exec -i meridian_postgres psql -U meridian -d meridian_db << 'SQL'
-- bcryptハッシュは事前にNode.jsで生成する
-- node -e "const b=require('bcryptjs'); b.hash('NewPassword1!', 12).then(console.log)"
UPDATE users SET password_hash = '$2a$12$xxxx...', failed_login_count = 0, locked_until = NULL
WHERE email = 'admin@example.com';
SQL
```

---

## 14. トラブルシューティング

### DBに接続できない

```bash
# コンテナが起動しているか確認
docker compose ps

# 起動していなければ
docker compose up -d

# ヘルスチェックが通っているか確認（healthy になるまで待つ）
docker compose ps
# State が "Up (healthy)" になっていればOK

# それでもダメならポート競合を確認
lsof -i :5442
```

### `npm run dev` でエラーが出る

```bash
# node_modulesを再インストール
rm -rf node_modules .next
npm install
npm run dev
```

### Prismaエラー（型が合わない等）

```bash
# Prismaクライアントを再生成
npm run db:generate

# マイグレーションが未適用の場合
npm run db:migrate
```

### `Foreign key constraint violated: projects_created_by_fkey`

DBをリセットしたのに古いCookieが残っている状態です。ブラウザのCookieを削除するか、シークレットモードでアクセスしてください。

### PM2でアプリが起動しない

```bash
# エラーログを確認
pm2 logs meridian --lines 50

# ビルドが完了しているか確認
ls -la .next/

# ビルドし直す
npm run build
pm2 restart meridian
```

### PM2でCPUが高い / メモリリーク

```bash
# リソース確認
pm2 monit

# 再起動
pm2 restart meridian

# 最大メモリを設定して自動再起動（ecosystem.config.jsに追加）
# max_memory_restart: "500M"
```

### アップロードしたファイルが見つからない

```bash
# UPLOADSディレクトリが存在するか確認
ls -la ~/projects/meridian/uploads/

# .env.local のUPLOAD_DIRが正しいか確認
cat .env.local | grep UPLOAD_DIR

# パーミッション確認
ls -la ~/projects/meridian/uploads/
```

### Claude API接続エラー

- `設定 → Claude APIキー` が正しく登録されているか確認
- Anthropicのコンソール（https://console.anthropic.com）でAPIキーの有効性を確認
- ネットワークがapi.anthropic.comに接続できるか確認（プロキシ環境の場合は要注意）

---

## 15. 画面・URL一覧

| 画面 | URL | 権限 |
|---|---|---|
| 初期セットアップ | /setup | 未認証（初回のみ） |
| ログイン | /login | 未認証 |
| ダッシュボード | /dashboard | Admin / Viewer |
| プロジェクト一覧 | /dashboard | Admin / Viewer |
| プロジェクト新規作成 | /projects/new | Admin |
| プロジェクト詳細 | /projects/[id] | Admin / Viewer |
| ドキュメント編集 | /projects/[id]/documents/[type] | Admin（Viewerは閲覧のみ） |
| AI一括生成 | /projects/[id]/generate | Admin |
| WBS管理 | /projects/[id]/wbs | Admin / Viewer |
| 添付資料 | /projects/[id]/attachments | Admin / Viewer |
| AI進捗推定 | /projects/[id]/ai-progress | Admin |
| 総合分析 | /projects/[id]/analysis | Admin |
| GitHub連携 | /projects/[id]/github | Admin |
| 優先度管理 | /priority | Admin / Viewer |
| RAG Q&A | /intelligence/qa | Admin / Viewer |
| 相乗効果マップ | /intelligence/synergy | Admin / Viewer |
| 技術ヘルスレポート | /intelligence/health | Admin / Viewer |
| ユーザー管理 | /settings/users | Admin |
| 監査ログ | /settings/audit | Admin |
| 設定 | /settings | Admin |
| Prisma Studio | http://localhost:5555 | ローカルのみ |

---

## 16. 権限マトリクス

| 機能 | Admin | Viewer |
|---|---|---|
| ダッシュボード閲覧 | ○ | ○ |
| プロジェクト作成・編集・削除 | ○ | × |
| ドキュメント閲覧 | ○ | ○ |
| ドキュメント編集・AI生成 | ○ | ×（読み取り専用） |
| WBSタスク追加・編集・削除 | ○ | × |
| 優先度スコア変更・D&D並べ替え | ○ | ×（閲覧のみ） |
| RAG Q&A | ○ | ○ |
| 添付資料アップロード・削除 | ○ | ×（閲覧・DLのみ） |
| ユーザー管理 | ○（自分は削除不可） | × |
| 監査ログ閲覧 | ○ | × |
| システム設定 | ○ | × |

---

## 17. セキュリティ

### 認証方式

NextAuth.js v5 Credentials Provider。JWT + DBセッションのハイブリッド方式。

### パスワード

bcrypt（saltRound=12）でハッシュ化。平文保存禁止。ログイン5回失敗で30分ロック。

### APIキー暗号化

Claude APIキーはAES-256-GCMで暗号化してDBに保存。暗号化キーは `.env.local` のみに保存。

### セキュリティヘッダー

X-Frame-Options, X-Content-Type-Options, CSP, HSTS等を全レスポンスに付与。

### 監査ログ

Admin操作（ログイン・プロジェクト操作・設定変更等）をすべて `audit_logs` テーブルに記録。INSERT/SELECT のみ許可（改ざん防止）。

### LAN公開時の注意

`.env.local` の `NEXTAUTH_URL` をマシンのIPアドレスに変更してください。

```bash
# 例：IPアドレスが 192.168.1.10 の場合
NEXTAUTH_URL="http://192.168.1.10:3025"
```

また `next.config.js` の `allowedOrigins` にも追加が必要です。

```js
experimental: {
  serverActions: {
    allowedOrigins: ["localhost:3025", "192.168.1.10:3025"],
  },
},
```

---

## npm スクリプト一覧

```bash
npm run dev              # 開発サーバ起動（ポート3025）
npm run build            # 本番ビルド
npm run start            # 本番サーバ起動
npm run lint             # ESLintチェック
npm run db:generate      # Prismaクライアント生成
npm run db:migrate       # マイグレーション実行（開発）
npm run db:migrate:prod  # マイグレーション実行（本番）
npm run db:studio        # Prisma Studio起動（GUI）
npm run db:seed          # 初期データ投入
npm run db:reset         # DBリセット（⚠️全データ削除）
npm run db:up            # Docker起動→マイグレーション→seed を一括実行
```

---

*Meridian — Built with Next.js 14 + PostgreSQL + Claude API*
