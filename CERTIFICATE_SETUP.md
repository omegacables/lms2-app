# 証明書機能セットアップガイド

## Supabaseデータベース更新

以下のSQLをSupabaseのSQL Editorで実行してください：

```sql
-- certificatesテーブルに必要なカラムを追加
ALTER TABLE certificates
ADD COLUMN IF NOT EXISTS certificate_number TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS verification_code TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS completion_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS total_videos INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_watch_time INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- 既存のレコードに証明書番号と検証コードを生成（既存データがある場合）
UPDATE certificates
SET
  certificate_number = CASE
    WHEN certificate_number IS NULL THEN
      UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4) || '-' ||
            SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4) || '-' ||
            SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4))
    ELSE certificate_number
  END,
  verification_code = CASE
    WHEN verification_code IS NULL THEN
      UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NOW()::TEXT) FROM 1 FOR 16))
    ELSE verification_code
  END,
  status = CASE
    WHEN status IS NULL THEN 'active'
    ELSE status
  END
WHERE certificate_number IS NULL
   OR verification_code IS NULL
   OR status IS NULL;

-- NOT NULL制約を追加
ALTER TABLE certificates
ALTER COLUMN certificate_number SET NOT NULL,
ALTER COLUMN verification_code SET NOT NULL,
ALTER COLUMN status SET NOT NULL;

-- インデックスを作成（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_certificates_user_id ON certificates(user_id);
CREATE INDEX IF NOT EXISTS idx_certificates_course_id ON certificates(course_id);
CREATE INDEX IF NOT EXISTS idx_certificates_status ON certificates(status);
CREATE INDEX IF NOT EXISTS idx_certificates_issued_at ON certificates(issued_at);
```

## 機能概要

### 実装された機能

1. **動画プレイヤーの最適化**
   - 15秒間隔での進捗更新（スムーズな再生）
   - 完了した動画の進捗保護
   - 未完了動画のリセット機能
   - 3段階のステータス表示（未受講/受講中/受講完了）

2. **証明書生成機能**
   - すべての動画完了時に証明書発行可能
   - PDF形式での証明書ダウンロード
   - 証明書番号と検証コードの自動生成
   - データベースへの証明書記録保存

3. **証明書一覧ページ（/certificates）**
   - 取得済み証明書の一覧表示
   - 証明書の再ダウンロード機能
   - 検索・フィルター機能
   - 証明書の詳細情報表示

## トラブルシューティング

### エラー: "Could not find the 'certificate_number' column"
上記のSQLを実行してcertificatesテーブルを更新してください。

### 証明書が生成されない場合
1. すべての動画を90%以上視聴しているか確認
2. ブラウザのコンソールでエラーを確認
3. Supabaseの接続を確認

### PDFダウンロードが失敗する場合
1. ポップアップブロッカーを無効化
2. ブラウザのダウンロード設定を確認

## 今後の改善予定
- 証明書のテンプレートカスタマイズ
- 証明書の有効期限設定
- QRコードによる証明書検証
- 証明書の共有機能