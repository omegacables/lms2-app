# Supabase Storage 設定ガイド

## エラー解決方法

「ERROR: 42501: must be owner of table objects」というエラーが出る場合は、Supabaseのダッシュボードから以下の手順で設定してください。

## 📝 手動設定手順

### 1. Supabaseダッシュボードにログイン
- https://app.supabase.com にアクセス
- プロジェクトを選択

### 2. Storage設定
1. 左メニューから「Storage」を選択
2. 「Policies」タブをクリック
3. 「videos」バケットを選択

### 3. 既存のポリシーを確認
- 既存のポリシーがある場合は、一度削除することを推奨

### 4. 新しいポリシーを追加

#### ポリシー1: Public Read Access
- **Name**: `Public Access`
- **Policy**: `SELECT`
- **Target roles**: `anon, authenticated`
- **Policy definition**:
```sql
bucket_id = 'videos'
```

#### ポリシー2: Authenticated Upload
- **Name**: `Authenticated Upload`
- **Policy**: `INSERT`
- **Target roles**: `authenticated`
- **Policy definition**:
```sql
bucket_id = 'videos' AND auth.role() = 'authenticated'
```

#### ポリシー3: Authenticated Update
- **Name**: `Authenticated Update`
- **Policy**: `UPDATE`
- **Target roles**: `authenticated`
- **Policy definition**:
```sql
bucket_id = 'videos' AND auth.role() = 'authenticated'
```

#### ポリシー4: Authenticated Delete
- **Name**: `Authenticated Delete`
- **Policy**: `DELETE`
- **Target roles**: `authenticated`
- **Policy definition**:
```sql
bucket_id = 'videos' AND auth.role() = 'authenticated'
```

### 5. バケット設定の確認
1. 「Configuration」タブをクリック
2. 「videos」バケットの設定を確認
3. 以下の設定を確認：
   - **Public**: ✅ ON
   - **File size limit**: 3GB (3221225472 bytes)
   - **Allowed MIME types**: `video/*`（すべての動画形式）

## 🔧 代替方法: Service Roleキーを使用

アプリケーションコードで`createAdminSupabaseClient()`を使用している場合は、Service Roleキーを使用するため、RLSポリシーは適用されません。

### 環境変数の確認
`.env.local`ファイルに以下が設定されていることを確認：
```
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**注意**: Service Roleキーは非常に強力な権限を持つため、絶対にクライアントサイドに露出させないでください。

## 🎯 推奨設定

現在のコードでは`createAdminSupabaseClient()`を使用しているため、RLSポリシーの影響を受けません。しかし、セキュリティのベストプラクティスとして：

1. **開発環境**: Service Roleキーを使用（RLSをバイパス）
2. **本番環境**: 適切なRLSポリシーを設定し、可能な限り通常のクライアントを使用

## ✅ 確認方法

設定が正しく完了したか確認するには：

1. Supabaseダッシュボードで「Storage」→「videos」を選択
2. ファイルをアップロードしてみる
3. アプリケーションから動画アップロードをテスト

## 🚨 トラブルシューティング

### まだエラーが出る場合

1. **ブラウザのキャッシュをクリア**
2. **Supabaseのセッションをリフレッシュ**:
   ```javascript
   await supabase.auth.refreshSession()
   ```
3. **Service Roleキーの確認**: `.env.local`に正しく設定されているか確認

### RLSエラーが続く場合

Supabaseダッシュボードから以下のSQLを実行（SQL Editorで）：
```sql
-- RLSを一時的に無効化（開発時のみ）
ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;

-- または、全員にフルアクセスを許可（開発時のみ）
CREATE POLICY "Temporary full access" ON storage.objects
FOR ALL USING (true) WITH CHECK (true);
```

**警告**: 上記は開発環境でのみ使用してください。本番環境では適切なRLSポリシーを設定してください。