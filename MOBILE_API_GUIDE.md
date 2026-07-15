# iOSアプリ（ネイティブ）連携ガイド

このリポジトリはNext.js製のLMS（学習管理システム）本体です。iOSアプリをネイティブUI（SwiftUI）で
構築する際のバックエンド接続方法をまとめます。

## 全体構成

- バックエンドは **Supabase**（PostgreSQL + Auth + Storage）。Webアプリの大半の機能は
  SupabaseクライアントSDKで直接読み書きしており、**iOSアプリも同じ方式（supabase-swift SDK）を推奨**。
- 本番サイトは2つあり、**それぞれ別のSupabaseプロジェクト**に接続している:
  | サイト | Supabaseプロジェクト |
  |---|---|
  | stus-lms.com | `tjzdsiaehksqpxuvzqvp.supabase.co` |
  | axialms.com | `ewtnyhfizuyvzvxkllva.supabase.co` |
  アプリがどちらのサイト向けかで接続先を切り替えること（ビルド設定/環境変数で管理）。

## マルチブランド対応（1つのアプリで2サイトを扱う）

2ブランド（stus-lms / axialms）は **別々のSupabaseプロジェクト**で、認証（ログイン）も
プロジェクトごとに独立している。したがって FDW 等でDBを繋ぐのではなく、
**アプリ側で接続先を実行時に切り替える**方式で対応する。

- アプリ内に **両プロジェクトの設定（URL＋anonキー）** を保持する（anonキーは公開可）。
- **どちらに接続するかは実行時に決める**：
  1. ログイン画面に「ブランド選択」（stus-lms / axialms）を置く、または
  2. 入力されたメールのドメイン等から自動判定する。
- 選択に応じて **その URL＋anonキーで Supabase クライアントを生成**し、以降の
  Auth / DB / Storage 呼び出しはすべてそのクライアント経由にする。
  （supabase-swift はクライアントを実行時に任意のURL/キーで生成可能）
- 選んだブランドは端末に保存（UserDefaults 等）し、次回起動時は選択をスキップ。
- ログアウト時はブランド選択に戻れるようにする。
- 1人のユーザーは一方のブランドにのみ所属する前提（同一人物が両方に居るケースは想定しない）。

※「両ブランドを1つのデータとして統合」したい場合のみプロジェクト統合が必要だが、
　現状は上記の実行時切り替えで完結する（DBの物理統合や FDW は不要）。

## 環境変数（アプリ側で必要なもの）

接続先ごとに1組。マルチブランド対応では2組を保持し、実行時に選択する。

```
# stus-lms 用
SUPABASE_URL_STUS=https://tjzdsiaehksqpxuvzqvp.supabase.co
SUPABASE_ANON_KEY_STUS=<stusのanon key>
# axialms 用
SUPABASE_URL_AXIA=https://ewtnyhfizuyvzvxkllva.supabase.co
SUPABASE_ANON_KEY_AXIA=<axialmsのanon key>
```

単一ブランドのみのビルドなら次の1組でよい:

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<anon key>
```

- `SUPABASE_ANON_KEY`（anonキー）はクライアント配布を前提とした**公開可能なキー**。
  権限はすべてDB側のRLS（行レベルセキュリティ）で制御されている。
- **絶対にアプリへ埋め込んではいけないもの**: `SUPABASE_SERVICE_ROLE_KEY`（RLS全バイパス）、
  `EMERGENCY_BYPASS_TOKEN`。これらはWebサーバー（Vercel）専用の秘密情報。

## 認証

- Supabase Auth のメール+パスワード認証（`signInWithPassword`）。
- サインアップは管理者がWeb側で行うため、アプリは**ログインのみ**でよい。
- ログイン後、`user_profiles` から自分のプロフィール（display_name, role, avatar_url,
  company, department, can_skip_videos）を取得する。role が `student` のユーザーが主対象。
- `user_profiles` の `role` / `is_active` / `can_skip_videos` はDBトリガーで保護されており、
  本人による変更は無効化される（変更してもエラーにはならず元の値が維持される）。

## 主要テーブル（RLSで本人分のみアクセス可）

| テーブル | 用途 | 備考 |
|---|---|---|
| `user_profiles` | プロフィール | 本人はSELECT/UPDATE可（保護列を除く） |
| `user_courses` | コース割り当て | 本人の行のみSELECT |
| `courses` | コース | `status='active'` のみ表示。`difficulty_level` は5段階（introduction/beginner/intermediate/advanced/expert）、並び順はレベル順→`order_index` |
| `chapters` + `chapter_videos` | 章構成 | 章なしコースもある（`videos.order_index` 順で表示） |
| `videos` | 動画 | `status='active'` のみ受講者に表示 |
| `video_view_logs` | 視聴ログ | 本人の行のみ読み書き可 |
| `certificates` | 修了証明書 | 本人分のみSELECT |
| `support_conversations` / `support_messages` | サポートチャット | 本人分のみ |

## 動画再生

- `videos.file_url` はSupabase Storage（`videos`バケット）の公開URL。そのまま
  AVPlayerで再生可能（MP4プログレッシブ配信。HLSではない）。
- より安全にするなら `createSignedUrl(file_path, 有効期限)` で署名付きURLを生成して再生する。
- 未完了動画の早送り制限（`can_skip_videos=false` のユーザーはシーク不可）はクライアント実装。
  アプリ側でも同じ制御を実装すること（maxWatchedTimeを超えるシークを禁止）。

## 視聴進捗の保存（重要な仕様）

進捗保存は2通りある。アプリからは**方式A（直接更新）を推奨**:

**方式A: Supabaseで `video_view_logs` を直接読み書き**（RLSで本人行のみ許可済み）
- 動画を開いたら: 該当 user_id×video_id の最新ログを取得。無ければINSERT
  （status='in_progress', progress_percent=0）。完了済み(completed)なら新規作成しない。
- 再生中: 5〜10秒ごとに UPDATE（current_position, progress_percent, total_watched_time,
  last_updated, end_time）。**progress_percent は単調増加**（既存値より小さい値で上書きしない）。
- **完了判定**: `progress_percent >= コースの completion_threshold`（未設定なら95）。
  完了時は `status='completed'`, `progress_percent=100`, `current_position=動画長`,
  `completed_at` をセットして確定させる。
- バックグラウンド移行時・アプリ終了時に必ず1回保存する。

**方式B: Web API `POST /api/videos/save-progress`**（本文に `access_token` を含める）
- Webのbeacon保存用エンドポイント。アプリからも使えるが、方式Aで足りる。

## 証明書

- コースの全動画（active）が completed になったら修了。
- 証明書の発行はWeb API `POST /api/certificates/generate` を使用
  （Authorization: Bearer <access_token>、本文 `{ userId, courseId }`）。
  発行済みかどうかは `certificates` テーブルをSELECTして判定。

## Web API を使う場合の共通ルール

- ベースURL: `https://stus-lms.com` または `https://axialms.com`
- 認証: `Authorization: Bearer <Supabaseのaccess_token>` ヘッダ
- 管理者専用API（/api/admin/*）はアプリでは使用しない
