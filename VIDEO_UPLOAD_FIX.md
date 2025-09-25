# 動画アップロードエラー (413 Content Too Large) 修正ガイド

## エラー内容
```
POST https://www.stus-lms.com/api/courses/8/videos 413 (Content Too Large)
```

## 修正内容

### 1. Vercel設定の更新
`vercel.json`に大きなファイルサイズのサポートを追加しました：
```json
{
  "functions": {
    "app/api/**/*": {
      "maxDuration": 30,
      "bodyParser": {
        "sizeLimit": "500mb"
      }
    }
  }
}
```

### 2. Next.js設定の更新
`next.config.mjs`を作成し、APIのボディサイズ制限を設定しました。

### 3. 代替アップロード方法の実装
Supabase Storageへ直接アップロードする`VideoUploadDirect`コンポーネントを作成しました。

## 使用方法

### オプション1: 既存のAPIエンドポイントを使用
1. デプロイ後、通常通りアップロードを試してください
2. 50MB以下のファイルであれば動作するはずです

### オプション2: Supabase Storage直接アップロード（推奨）
大きなファイル（50MB以上）の場合：

1. 管理画面で`VideoUploadDirect`コンポーネントを使用
2. このコンポーネントはSupabase Storageに直接アップロードします
3. Vercelのサーバーを経由しないため、大きなファイルも処理可能

## Vercelの制限事項

### 無料プラン
- API Routes: **最大4.5MB**
- Serverless Functions: **最大50MB**

### Proプラン
- API Routes: **最大4.5MB**
- Serverless Functions: **最大250MB**

### Enterpriseプラン
- カスタム設定可能

## 推奨される解決策

1. **小さいファイル（50MB以下）**: 既存のAPIエンドポイントを使用
2. **大きいファイル（50MB以上）**: Supabase Storage直接アップロードを使用
3. **非常に大きいファイル（500MB以上）**:
   - ファイルを圧縮するか分割
   - 外部CDNサービスの使用を検討

## トラブルシューティング

### まだ413エラーが発生する場合

1. **Vercelの再デプロイ**
   ```bash
   vercel --prod --force
   ```

2. **Cloudflareを使用している場合**
   - Cloudflareの最大アップロードサイズ: 100MB（無料プラン）
   - Pro以上のプランが必要な場合があります

3. **直接アップロードを使用**
   - `VideoUploadDirect`コンポーネントを管理画面に追加
   - Supabase Storageに直接アップロード

## 実装例

管理画面で`VideoUploadDirect`を使用する場合：

```tsx
import { VideoUploadDirect } from '@/components/admin/VideoUploadDirect';

// コンポーネント内で
<VideoUploadDirect
  courseId={courseId}
  onSuccess={() => {
    // 成功時の処理
    fetchVideos(); // 動画一覧を再取得
  }}
/>
```