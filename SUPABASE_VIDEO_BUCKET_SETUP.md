# Supabase動画バケット設定ガイド

## 📋 現在の問題
- **本番環境で動画をアップロードできない**
- **原因**: Supabaseストレージに「videos」バケットが存在しない

## ✅ 解決方法（データは削除されません）

### 方法1: Supabaseダッシュボードから設定（最も安全・推奨）

1. **Supabaseダッシュボードにアクセス**
   - https://supabase.com/dashboard
   - プロジェクトを選択

2. **Storageセクションへ移動**
   - 左メニューの「Storage」をクリック

3. **バケットの確認**
   - 「videos」という名前のバケットがあるか確認
   - **ある場合** → 設定を確認（手順4へ）
   - **ない場合** → 新規作成（手順5へ）

4. **既存バケットの設定確認**
   - videosバケットをクリック
   - 右上の「Settings」をクリック
   - 以下を確認：
     - Public: ✅ ONになっているか
     - File size limit: 3221225472（3GB）以上か
     - Allowed MIME types: video/* が含まれているか

5. **新規バケットの作成**
   - 「New bucket」ボタンをクリック
   - 以下の設定で作成：
   ```
   Bucket name: videos
   Public bucket: ✅ チェック
   File size limit: 3221225472
   Allowed MIME types: video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska
   ```

### 方法2: SQLエディタから確認・作成

#### Step 1: まず現状を確認（データは変更されません）

```sql
-- バケットの存在確認（読み取りのみ）
SELECT
  name,
  public,
  file_size_limit,
  file_size_limit / 1024 / 1024 / 1024 as size_gb,
  allowed_mime_types
FROM storage.buckets
WHERE name = 'videos';
```

**結果が空の場合** → バケットが存在しない
**結果がある場合** → 設定を確認

#### Step 2: バケットが無い場合のみ作成

```sql
-- 安全なバケット作成（既存のものは変更されない）
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'videos',
  'videos',
  true,
  3221225472,  -- 3GB
  ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska']
)
ON CONFLICT (id) DO NOTHING;  -- 既存のバケットがあれば何もしない
```

#### Step 3: RLSポリシーを設定（必須）

```sql
-- 認証済みユーザーがアップロードできるようにする
CREATE POLICY IF NOT EXISTS "Authenticated can upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'videos');

-- 全員が動画を見られるようにする
CREATE POLICY IF NOT EXISTS "Public can view" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'videos');
```

## 🔍 設定後の確認

### 1. コマンドラインから確認
```bash
npm run check-storage
```

### 2. Supabaseダッシュボードで確認
- Storage → videosバケットが表示されているか
- バケットをクリックして設定を確認

### 3. テストアップロード
- 本番環境で小さな動画（10MB程度）をアップロードしてみる

## ⚠️ 注意事項

### データの安全性
- **ON CONFLICT DO NOTHING**: 既存のバケットがあれば何もしない
- **CREATE POLICY IF NOT EXISTS**: 既存のポリシーがあれば何もしない
- **データは削除されません**

### 開発環境と本番環境
- 開発環境と本番環境で**別々のSupabaseプロジェクト**を使用している場合
- それぞれで設定が必要です

### Supabaseプランの制限
無料プラン:
- Storage: 1GB
- ファイルサイズ: 50MB
- 帯域幅: 2GB/月

Proプラン:
- Storage: 100GB〜
- ファイルサイズ: 5GB
- 帯域幅: 200GB/月〜

## 💡 トラブルシューティング

### エラー: "Invalid storage bucket"
→ バケットが存在しません。上記手順で作成してください。

### エラー: "row-level security"
→ RLSポリシーが設定されていません。Step 3を実行してください。

### エラー: "payload too large"
→ Supabaseの無料プランの制限（50MB）に達している可能性があります。

## 📝 最終チェックリスト

- [ ] Supabaseダッシュボードでvideosバケットを確認
- [ ] バケットがPublicに設定されているか確認
- [ ] File size limitが3GB以上に設定されているか確認
- [ ] RLSポリシーが設定されているか確認
- [ ] 小さなテストファイルでアップロードを確認
- [ ] 本番環境で動画アップロードが動作することを確認