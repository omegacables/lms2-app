# 🚀 LMS2アプリ デプロイメント手順

## 重要な修正内容

### ✅ 修正完了項目
1. **Service Role Keyエラーの完全解決**
   - `VideoUploader3GB`コンポーネントを削除
   - シンプルな`VideoUploader`コンポーネントに統一
   - クライアントサイドからService Role Key参照を完全削除

2. **動画削除機能の修正**
   - Supabaseストレージとデータベース両方から削除
   - file_pathを使用した確実な削除処理

3. **動画アップロード機能の改善**
   - チャンク分割を削除（ユーザー要望通り）
   - 動画の長さを自動取得・保存
   - 3GBまでのファイルに対応

## 📝 デプロイ手順

### 方法1: Vercel CLIを使用（推奨）

```bash
# 1. Vercel CLIのインストール（未インストールの場合）
npm i -g vercel

# 2. ビルドキャッシュをクリアして強制デプロイ
vercel --prod --force
```

### 方法2: GitHubプッシュによる自動デプロイ

```bash
# 1. GitHubにプッシュ
git push origin main

# 2. Vercelダッシュボードで確認
# https://vercel.com/dashboard
```

### 方法3: Vercelダッシュボードから手動デプロイ

1. [Vercel Dashboard](https://vercel.com/dashboard)にアクセス
2. `lms2-app`プロジェクトを選択
3. **Deployments**タブを開く
4. 最新のデプロイメントの横にある**...**メニューをクリック
5. **Redeploy**を選択
6. ⚠️ **"Use existing Build Cache"のチェックを外す** ← 重要！
7. **Redeploy**をクリック

## 🔄 キャッシュクリアが必要な場合

古いコードがキャッシュされている場合は以下を実行:

### ブラウザ側
- キャッシュを完全クリア: `Ctrl+Shift+R` (Windows) / `Cmd+Shift+R` (Mac)
- プライベートブラウジングモードでテスト
- Service Workerが有効な場合は無効化

### Vercel側
1. プロジェクトSettingsから**Functions**セクションへ
2. **Clear Cache**ボタンをクリック（存在する場合）
3. または、プロジェクトを削除して再インポート

## 🧪 デプロイ後のテスト

### 1. 動画アップロードテスト
```
1. 管理者でログイン
2. コース管理 → 動画を追加
3. 500MB以下の動画ファイルを選択
4. アップロード実行
5. エラーメッセージが表示されないことを確認
```

### 2. 動画削除テスト
```
1. 動画一覧から削除ボタンをクリック
2. 確認ダイアログでOK
3. リストから消えることを確認
4. Supabaseダッシュボードで確認:
   - videosテーブルからレコードが削除
   - Storageから実ファイルが削除
```

### 3. 動画の長さ表示テスト
```
1. 新しくアップロードした動画の詳細を確認
2. "時間: XX分YY秒"が表示されることを確認
3. "時間が未設定"と表示されないことを確認
```

## ⚠️ トラブルシューティング

### まだ"Service Role Key not set"エラーが出る場合

1. **デベロッパーツールで確認**
   - Sourcesタブを開く
   - 実際にロードされているコードを確認
   - `VideoUploader3GB`の文字列を検索
   - 見つかった場合はキャッシュが原因

2. **完全再デプロイ**
   ```bash
   # Vercelプロジェクトを削除して再作成
   vercel rm lms2-app
   vercel
   ```

3. **環境変数の確認**
   - Vercel Settingsで環境変数を確認
   - `SUPABASE_SERVICE_ROLE_KEY`はProduction環境のみに設定
   - クライアントサイドでは使用しないこと

## 📊 変更ファイル一覧

### 削除したファイル
- `src/components/admin/VideoUploader3GB.tsx` - チャンク分割アップローダー（不要）

### 修正したファイル
- `src/components/admin/VideoUploader.tsx` - シンプルなアップローダー
- `src/app/admin/courses/[id]/videos/page.tsx` - 動画管理ページ
- `src/app/admin/upload-video/page.tsx` - アップロードページ

### 追加したファイル
- `test-video-upload.html` - テストツール
- `vercel-clear-cache.md` - キャッシュクリア手順
- `deploy.sh` - デプロイスクリプト

## ✅ 最終確認チェックリスト

- [ ] GitHubに最新コードがプッシュされている
- [ ] Vercelでデプロイが成功している
- [ ] 本番環境でログインできる
- [ ] 動画アップロードが正常に動作する（エラーなし）
- [ ] 動画削除が正常に動作する（DB・ストレージ両方）
- [ ] 動画の長さが正しく表示される

## 📞 サポート

問題が解決しない場合:
1. ブラウザのコンソールログを確認
2. Vercelのファンクションログを確認
3. Supabaseのログを確認

---
Last Updated: 2025-09-26
Version: 1.0.0