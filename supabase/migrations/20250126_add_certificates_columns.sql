-- certificatesテーブルに不足しているカラムを追加
ALTER TABLE certificates
ADD COLUMN IF NOT EXISTS certificate_number TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS verification_code TEXT UNIQUE;

-- 既存のレコードに証明書番号と検証コードを生成
UPDATE certificates
SET
  certificate_number = UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4) || '-' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4) || '-' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4)),
  verification_code = UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 16))
WHERE certificate_number IS NULL OR verification_code IS NULL;

-- NOT NULL制約を追加
ALTER TABLE certificates
ALTER COLUMN certificate_number SET NOT NULL,
ALTER COLUMN verification_code SET NOT NULL;