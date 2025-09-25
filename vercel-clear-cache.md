# Vercel キャッシュクリアおよび再デプロイ手順

## Service Role Key エラーを完全に解決するための手順

### 1. Vercelダッシュボードでキャッシュをクリア

1. [Vercel Dashboard](https://vercel.com/dashboard) にアクセス
2. プロジェクト `lms2-app` を選択
3. **Settings** タブをクリック
4. **Functions** セクションに移動
5. **"Clear Cache"** ボタンをクリック（存在する場合）

### 2. 環境変数の確認

1. **Settings** → **Environment Variables** に移動
2. 以下の環境変数が正しく設定されていることを確認:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` （サーバーサイドのみで使用）

### 3. 強制再デプロイ

#### オプション A: Vercel CLIを使用
```bash
npx vercel --prod --force
```

#### オプション B: GitHubから再デプロイ
1. GitHubリポジトリで空のコミットを作成:
```bash
git commit --allow-empty -m "Force redeploy to clear cache"
git push origin main
```

#### オプション C: Vercelダッシュボードから
1. **Deployments** タブに移動
2. 最新のデプロイメントの横にある **"..."** メニューをクリック
3. **"Redeploy"** を選択
4. **"Use existing Build Cache"** のチェックを外す ← 重要！
5. **"Redeploy"** をクリック

### 4. デプロイ後の確認

1. ブラウザのキャッシュをクリア（Ctrl+Shift+R または Cmd+Shift+R）
2. デベロッパーツールでネットワークタブを開く
3. 動画アップロードをテスト
4. エラーメッセージが変わったか確認

### 5. それでも解決しない場合

1. プロジェクトを一度削除して再作成:
   - Vercelダッシュボードでプロジェクトを削除
   - GitHubから再度インポート
   - 環境変数を再設定
   - デプロイ

### 変更内容の確認

以下の変更が正しく反映されているか確認:
- ✅ `VideoUploader3GB` コンポーネントを削除
- ✅ `VideoUploader` コンポーネントを使用（チャンキングなし）
- ✅ クライアントサイドでService Role Keyを使用していない
- ✅ 動画削除がストレージとデータベース両方から削除される
- ✅ 動画の長さが正しく取得・保存される

### トラブルシューティング

もしまだ "Service Role Key not set" エラーが表示される場合:

1. ブラウザの開発者ツールで Sources タブを開く
2. 実際にロードされているコードを確認
3. 古いコードがキャッシュされていないか確認
4. Service Worker が有効な場合は無効化してテスト