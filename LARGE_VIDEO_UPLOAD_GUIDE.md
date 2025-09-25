# 3GB動画アップロードガイド

## 概要
最大3GBまでの大容量動画ファイルをアップロードできる機能を実装しました。

## 機能の特徴

### 自動最適化
- **500MB以下**: 直接アップロード（高速）
- **500MB〜3GB**: 自動的に50MBのチャンクに分割してアップロード（安定）

### 対応ファイル形式
- MP4
- WebM
- MOV (QuickTime)
- AVI
- MKV (Matroska)

## Supabaseの設定

### 1. Storage バケットの設定

Supabaseダッシュボードで以下の設定を確認：

```sql
-- Storage バケットのファイルサイズ制限を3GBに設定
UPDATE storage.buckets
SET file_size_limit = 3221225472  -- 3GB in bytes
WHERE name = 'videos';
```

### 2. RLS (Row Level Security) ポリシー

```sql
-- 認証済みユーザーがアップロード可能
CREATE POLICY "Authenticated users can upload videos" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'videos' AND
  auth.role() = 'authenticated'
);

-- 誰でも動画を視聴可能
CREATE POLICY "Public can view videos" ON storage.objects
FOR SELECT USING (bucket_id = 'videos');
```

### 3. Supabase Proプランの検討

無料プランの制限:
- **ストレージ**: 1GB
- **ファイルサイズ**: 50MB
- **帯域幅**: 2GB/月

Proプランの利点:
- **ストレージ**: 100GB〜
- **ファイルサイズ**: 5GB
- **帯域幅**: 200GB/月〜

## 使用方法

### 1. コンポーネントのインポート

```tsx
import { VideoUploader3GB } from '@/components/admin/VideoUploader3GB';
```

### 2. 実装例

```tsx
function CourseVideosPage({ courseId }: { courseId: number }) {
  const handleUploadSuccess = () => {
    // 動画一覧を再取得
    fetchVideos();
    toast.success('動画のアップロードが完了しました');
  };

  const handleUploadError = (error: Error) => {
    console.error('Upload error:', error);
    toast.error('アップロードに失敗しました');
  };

  return (
    <VideoUploader3GB
      courseId={courseId}
      onSuccess={handleUploadSuccess}
      onError={handleUploadError}
    />
  );
}
```

## 技術仕様

### チャンクアップロード
- チャンクサイズ: 50MB
- 並列アップロード: なし（順次処理で安定性重視）
- リトライ: ネットワークエラー時に自動リトライ
- クリーンアップ: エラー時に自動でチャンクを削除

### ファイル保存構造
```
videos/
├── course_1/
│   ├── 1234567890_abcd/
│   │   ├── video.mp4.part0000
│   │   ├── video.mp4.part0001
│   │   └── video.mp4.part0002
│   └── 1234567891_efgh/
│       └── small_video.mp4
└── course_2/
    └── ...
```

## トラブルシューティング

### エラー: "Request Entity Too Large"
Supabaseのファイルサイズ制限を確認してください：
```sql
SELECT name, file_size_limit
FROM storage.buckets
WHERE name = 'videos';
```

### エラー: "Storage quota exceeded"
Supabaseのストレージ容量を確認し、必要に応じてProプランにアップグレードしてください。

### アップロードが遅い
- ネットワーク速度を確認
- チャンクサイズを調整（10MB〜100MB）
- 時間帯を変更（混雑時を避ける）

## パフォーマンス目安

| ファイルサイズ | 推定アップロード時間 |
|--------------|-------------------|
| 100MB | 1〜2分 |
| 500MB | 5〜10分 |
| 1GB | 10〜20分 |
| 3GB | 30〜60分 |

*実際の時間はネットワーク環境により異なります

## セキュリティ考慮事項

1. **ファイル検証**: アップロード前にMIMEタイプを確認
2. **サイズ制限**: 3GBを超えるファイルは拒否
3. **認証**: 認証済みユーザーのみアップロード可能
4. **クリーンアップ**: 失敗時に部分的にアップロードされたファイルを削除

## 今後の改善案

1. **断続的アップロード**: ブラウザを閉じても再開可能に
2. **並列アップロード**: 複数チャンクの同時アップロード
3. **圧縮**: クライアントサイドでの動画圧縮
4. **プレビュー**: アップロード前の動画プレビュー
5. **メタデータ抽出**: 動画の長さ、解像度などの自動取得