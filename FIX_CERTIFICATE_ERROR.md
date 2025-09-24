# 証明書エラーの修正手順

## エラー内容
```
Could not find the 'certificate_number' column of 'certificates' in the schema cache
```

## 修正手順

### 1. Supabaseデータベースを更新

1. [Supabaseダッシュボード](https://supabase.com/dashboard)にログイン
2. プロジェクトを選択
3. 左側メニューから「SQL Editor」を選択
4. 以下のSQLを実行：

```sql
-- Step 1: カラムを追加
ALTER TABLE certificates
ADD COLUMN IF NOT EXISTS certificate_number TEXT,
ADD COLUMN IF NOT EXISTS verification_code TEXT,
ADD COLUMN IF NOT EXISTS completion_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS total_videos INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_watch_time INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Step 2: 既存データがある場合、デフォルト値を設定
UPDATE certificates
SET
  certificate_number = 'CERT-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || id::TEXT) FROM 1 FOR 12)),
  verification_code = UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NOW()::TEXT || id::TEXT) FROM 1 FOR 16))
WHERE certificate_number IS NULL
   OR verification_code IS NULL;

-- Step 3: UNIQUE制約を追加
ALTER TABLE certificates
ADD CONSTRAINT certificates_certificate_number_unique UNIQUE (certificate_number),
ADD CONSTRAINT certificates_verification_code_unique UNIQUE (verification_code);

-- Step 4: インデックスを作成
CREATE INDEX IF NOT EXISTS idx_certificates_user_id ON certificates(user_id);
CREATE INDEX IF NOT EXISTS idx_certificates_course_id ON certificates(course_id);
CREATE INDEX IF NOT EXISTS idx_certificates_status ON certificates(status);
```

### 2. スキーマキャッシュをリフレッシュ

**重要**: SQLを実行後、必ず以下の手順を実行してください

1. Supabaseダッシュボード → Settings → API
2. 下にスクロールして「Schema Cache」セクションを探す
3. 「Reload Schema Cache」ボタンをクリック

または、プロジェクトを一度再起動：
1. Settings → General
2. 「Pause Project」をクリック
3. 数秒待ってから「Resume Project」

### 3. ブラウザのキャッシュをクリア

1. Chrome: `Ctrl + Shift + R`（Windows）または `Cmd + Shift + R`（Mac）
2. もしくはDevToolsを開いて（F12）、Network タブで「Disable cache」をチェック

### 4. 動作確認

1. コースの学習ページ（`/courses/[id]/learn`）にアクセス
2. すべての動画を視聴完了
3. 修了証をダウンロード

## Chromeパスワード保存の問題

パスワード保存のポップアップが出ない場合：

### Chrome設定を確認
1. Chrome設定 → 自動入力とパスワード → Google パスワードマネージャー
2. 「パスワードを保存するか確認する」をONにする
3. サイトの設定で「stus-lms.com」がブロックされていないか確認

### サイト個別設定
1. URLバーの鍵アイコンをクリック
2. 「サイトの設定」を選択
3. 「パスワード」を「許可」に設定

## トラブルシューティング

### エラーが続く場合

1. **Supabaseの接続を確認**
   ```javascript
   // ブラウザコンソールで実行
   const { data, error } = await supabase
     .from('certificates')
     .select('*')
     .limit(1);
   console.log({ data, error });
   ```

2. **テーブル構造を確認**
   Supabase SQL Editorで：
   ```sql
   SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_name = 'certificates'
   ORDER BY ordinal_position;
   ```

3. **権限を確認**
   ```sql
   -- RLS（Row Level Security）を一時的に無効化してテスト
   ALTER TABLE certificates DISABLE ROW LEVEL SECURITY;
   ```

### サポート

問題が解決しない場合は、以下の情報を添えて報告してください：
- ブラウザのコンソールエラーの完全なスクリーンショット
- Supabaseのテーブル構造のスクリーンショット
- 実行したSQLの結果