# Supabase認証エラーの解決方法

## 問題
ログインボタンをクリックしても `https://www.stus-lms.com/auth/login?redirectTo=%2Fadmin` から進まない

## 原因と解決策

### 1. Vercelの環境変数確認

Vercelダッシュボードで以下の環境変数が正しく設定されているか確認:

1. [Vercelダッシュボード](https://vercel.com)にログイン
2. `lms2-app`プロジェクトを選択
3. **Settings** → **Environment Variables**

必要な環境変数:
```
NEXT_PUBLIC_SUPABASE_URL=https://[your-project].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...（長い文字列）
```

⚠️ **重要**: 環境変数を追加・変更した後は**必ず再デプロイ**が必要です。

### 2. Supabase側の設定確認

#### Authentication → URL Configuration

以下が正しく設定されているか確認:

**Site URL:**
```
https://stus-lms.com
```

**Redirect URLs:**（すべて追加）
```
https://stus-lms.com
https://stus-lms.com/*
https://www.stus-lms.com
https://www.stus-lms.com/*
https://stus-lms.com/auth/callback
https://www.stus-lms.com/auth/callback
```

### 3. ブラウザコンソールの確認

1. Chrome DevToolsを開く（F12）
2. Consoleタブを確認
3. 以下のエラーがないか確認:
   - `Supabase URL not found`
   - `Failed to fetch`
   - `CORS error`

### 4. ミドルウェアのデバッグ

URLに`?debug=true`を追加してミドルウェアをバイパス:
```
https://www.stus-lms.com/auth/login?debug=true
```

### 5. テストユーザーでの確認

Supabaseダッシュボードでテストユーザーを作成:

1. **Authentication** → **Users**
2. **Invite User**をクリック
3. メールアドレスを入力して招待
4. 招待メールからパスワードを設定

### 6. 環境変数の再デプロイ

```bash
# Vercel CLIで再デプロイ
npx vercel --prod --force

# または Vercelダッシュボードから
# Deployments → 最新のデプロイ → Redeploy
```

### 7. CORSエラーの場合

Supabase Storage使用時のCORS設定:

1. **Storage** → **Settings**
2. **CORS Configuration**に追加:

```json
[
  {
    "origin": ["https://stus-lms.com", "https://www.stus-lms.com"],
    "allowed_headers": ["*"],
    "exposed_headers": ["*"],
    "max_age_seconds": 3600,
    "credentials": true
  }
]
```

## トラブルシューティング手順

### Step 1: 環境変数の確認
```javascript
// ブラウザコンソールで実行
console.log('SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log('SUPABASE_ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Set' : 'Not set');
```

### Step 2: ネットワークタブの確認
1. DevTools → Network タブ
2. ログインボタンをクリック
3. 赤いエラーがないか確認
4. Supabase APIへのリクエストが送信されているか確認

### Step 3: Supabaseダッシュボードでログ確認
1. Supabaseダッシュボード → **Logs** → **Auth**
2. エラーログがないか確認

## よくあるエラーと対処法

| エラー | 原因 | 解決策 |
|--------|------|---------|
| `Invalid API key` | 環境変数が正しくない | Vercelで環境変数を再設定 |
| `URL not configured` | RedirectURLs未設定 | Supabaseで追加 |
| `Network error` | CORS/ネットワーク | CORS設定を確認 |
| `No response` | ミドルウェアの問題 | `?debug=true`で確認 |

## 確認チェックリスト

- [ ] Vercelに環境変数が設定されている
- [ ] 環境変数設定後に再デプロイした
- [ ] Supabase Site URLが正しい
- [ ] Supabase Redirect URLsにすべてのURLを追加
- [ ] ブラウザコンソールにエラーがない
- [ ] ネットワークタブでAPIコールが確認できる
- [ ] テストユーザーでログインできる

## それでも解決しない場合

1. Supabaseプロジェクトを一時停止→再開
2. Vercelプロジェクトを再デプロイ（キャッシュクリア付き）
3. 新しいブラウザ/シークレットウィンドウで試す
4. DNSが完全に伝播するまで待つ（最大48時間）