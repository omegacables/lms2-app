# Vercelへのデプロイ手順

## 1. 前提条件
- Vercelアカウントを作成済み
- GitHubアカウントを作成済み
- このプロジェクトがGitHubにプッシュ済み

## 2. Vercelでのデプロイ手順

### 2.1 プロジェクトのインポート
1. [Vercel](https://vercel.com)にログイン
2. "Add New..." → "Project"をクリック
3. GitHubリポジトリから`lms2-app`を選択
4. "Import"をクリック

### 2.2 環境変数の設定
Vercelのプロジェクト設定画面で以下の環境変数を設定：

| 変数名 | 説明 | 取得方法 |
|--------|------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | SupabaseプロジェクトのURL | Supabaseダッシュボード → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key | Supabaseダッシュボード → Settings → API |

### 2.3 デプロイ設定
- **Framework Preset**: Next.js（自動検出）
- **Build Command**: `npm run build`
- **Output Directory**: `.next`（デフォルト）
- **Install Command**: `npm install`

### 2.4 デプロイ実行
1. 環境変数設定後、"Deploy"をクリック
2. ビルドが完了するまで待機（約2-3分）
3. デプロイ完了後、提供されたURLでアプリケーションにアクセス

## 3. Supabase設定

### 3.1 URL設定
Supabaseダッシュボードで以下を設定：
1. Authentication → URL Configuration
2. Site URLにVercelのデプロイURLを設定
3. Redirect URLsにも同じURLを追加

### 3.2 CORS設定
必要に応じてStorage設定でCORSを設定：
```json
[
  {
    "origin": ["https://your-app.vercel.app"],
    "allowed_headers": ["*"],
    "exposed_headers": ["*"],
    "max_age_seconds": 3600
  }
]
```

## 4. デプロイ後の確認事項

### 4.1 動作確認
- [ ] ログイン機能が正常に動作
- [ ] 動画のアップロード/再生が可能
- [ ] 進捗データが正しく保存される
- [ ] 証明書のダウンロードが可能

### 4.2 トラブルシューティング

#### ビルドエラーが発生する場合
```bash
# ローカルで事前確認
npm run build
```

#### 環境変数が読み込まれない場合
- Vercelダッシュボードで環境変数が正しく設定されているか確認
- 環境変数設定後、再デプロイを実行

#### Supabase接続エラー
- Supabase URLとAnon Keyが正しいか確認
- SupabaseのURL設定でVercelのドメインが許可されているか確認

## 5. カスタムドメイン設定（オプション）

### 5.1 ドメインの追加
1. Vercelプロジェクト → Settings → Domains
2. カスタムドメインを入力
3. DNSレコードの設定指示に従う

### 5.2 SSL証明書
- Vercelが自動的にSSL証明書を発行・管理

## 6. 継続的デプロイ

GitHubのmainブランチへのプッシュで自動デプロイが実行されます。

### プレビューデプロイ
- Pull Requestを作成すると自動的にプレビュー環境が作成される
- プレビューURLでテストが可能

## 7. パフォーマンス最適化

### 推奨設定
- Image Optimizationを有効化
- Web Analyticsを有効化（オプション）
- Speed Insightsでパフォーマンス監視（オプション）

## 8. 注意事項

- 無料プランの制限事項を確認
  - 帯域幅: 100GB/月
  - ビルド時間: 6000分/月
  - Functions実行時間: 100GB-hours/月
- 商用利用の場合はProプラン以上を推奨
- 定期的なセキュリティアップデートの実施