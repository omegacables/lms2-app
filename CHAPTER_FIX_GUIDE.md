# 章機能の修正ガイド

## 問題の概要
章（チャプター）の追加・表示が正しく動作しない問題が発生しています。これは、Supabaseデータベースの`courses`テーブルに`metadata`カラムが存在しないか、正しく設定されていないことが原因です。

## 解決手順

### 1. Supabase管理画面にログイン
1. [Supabase Dashboard](https://app.supabase.com) にアクセス
2. 対象のプロジェクトを選択
3. 左側のメニューから「SQL Editor」を選択

### 2. 現在の状態を確認
以下のSQLを実行して、metadataカラムの存在を確認：

```sql
SELECT
  column_name,
  data_type,
  column_default
FROM
  information_schema.columns
WHERE
  table_name = 'courses'
  AND column_name = 'metadata';
```

### 3. metadataカラムを追加
上記のクエリが結果を返さない（カラムが存在しない）場合、以下を実行：

```sql
ALTER TABLE courses
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{"chapters": []}'::jsonb;
```

### 4. 既存データの初期化
すでにコースが存在する場合、metadataを初期化：

```sql
UPDATE courses
SET metadata = '{"chapters": []}'::jsonb
WHERE metadata IS NULL;
```

### 5. 動作確認
以下のSQLですべてのコースにmetadataが設定されたことを確認：

```sql
SELECT id, title, metadata
FROM courses
ORDER BY id;
```

## アプリケーションでの確認手順

### 1. キャッシュのクリア
ブラウザでアプリケーションを開き、以下の操作を実行：
- Ctrl+Shift+R (Windows/Linux) または Cmd+Shift+R (Mac) でハードリロード
- またはブラウザの開発者ツールを開き、Network タブで「Disable cache」をチェック

### 2. 章の追加テスト
1. 管理者としてログイン
2. 「コース管理」→ 任意のコースを選択 → 「編集」
3. 「章の管理」セクションで新しい章を追加
4. 章が正しく表示され、保存されることを確認

### 3. 動画の章への割り当て
1. 追加した章に動画をドラッグ＆ドロップ
2. ページを再読み込みして、割り当てが保持されていることを確認

## トラブルシューティング

### 症状：章を追加しても表示されない
**原因**: metadataカラムが存在しないか、NULL値になっている
**解決**: 上記の手順3と4を実行

### 症状：エラーメッセージが表示される
**原因**: データベースの権限やRLS（Row Level Security）の問題
**解決**: Supabaseの管理画面で、coursesテーブルのRLSポリシーを確認し、UPDATE権限があることを確認

### 症状：章は表示されるが、動画の割り当てが保存されない
**原因**: videosテーブルとの関連付けの問題
**解決**:
1. コンソールログを確認（F12で開発者ツールを開く）
2. エラーメッセージがある場合は記録
3. `/api/videos/[videoId]/assign-chapter`のAPIレスポンスを確認

## 技術的な詳細

### metadataカラムの構造
```json
{
  "chapters": [
    {
      "id": "unique-chapter-id",
      "title": "章のタイトル",
      "display_order": 0,
      "video_ids": [1, 2, 3]  // 動画IDの配列
    }
  ]
}
```

### 関連するAPIエンドポイント
- `GET /api/courses/[id]/chapters` - 章の一覧取得
- `POST /api/courses/[id]/chapters` - 新規章の作成
- `PUT /api/courses/[id]/chapters/[chapterId]` - 章の更新
- `DELETE /api/courses/[id]/chapters/[chapterId]` - 章の削除
- `PUT /api/videos/[videoId]/assign-chapter` - 動画を章に割り当て

## 実装済みの修正内容
1. すべてのAPIでmetadataがnullの場合の処理を追加
2. metadataが存在しない場合の自動初期化機能
3. エラーハンドリングとログ出力の強化
4. フロントエンドでの適切なデータ更新処理

## サポート
問題が解決しない場合は、以下の情報を添えてご連絡ください：
- ブラウザのコンソールログ
- ネットワークタブでのAPIレスポンス
- Supabaseのデータベースログ