# ログイン問題のデバッグ手順

## 1. 🔍 ブラウザコンソールでエラー確認

### Chrome DevToolsを開く
1. https://www.stus-lms.com/auth/login にアクセス
2. **F12**キーを押してDevToolsを開く
3. **Console**タブを選択
4. ページをリロード（F5）
5. ログインを試みる

### 確認すべきエラー
```javascript
// コンソールに以下が表示されているか確認：

// 1. Supabase関連のエラー
"Failed to fetch"
"NEXT_PUBLIC_SUPABASE_URL is not defined"
"Invalid API key"

// 2. CORS/ネットワークエラー
"CORS policy"
"net::ERR_"

// 3. JavaScript実行エラー
"Uncaught TypeError"
"Cannot read property"
```

## 2. 🔧 デバッグモードでテスト

### ミドルウェアをバイパス
```
https://www.stus-lms.com/auth/login?debug=true
```

### 環境変数の確認
ブラウザコンソールで実行：
```javascript
// 環境変数が設定されているか確認
console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log('Supabase Key:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Set' : 'Not set');
```

## 3. 📊 ネットワークタブで確認

1. DevTools → **Network**タブ
2. ログインボタンをクリック
3. 以下を確認：
   - Supabaseへのリクエストが送信されているか
   - ステータスコード（200, 401, 500など）
   - レスポンスの内容

## 4. 🎯 問題の可能性と対処法

### 可能性1: 環境変数が未設定
**症状**: コンソールに`undefined`が表示される
**解決策**:
1. Vercelダッシュボード → Settings → Environment Variables
2. 必要な変数を追加して**再デプロイ**

### 可能性2: ミドルウェアが遷移をブロック
**症状**: ログイン成功後もログインページに戻される
**解決策**: デバッグモード（?debug=true）で試す

### 可能性3: クライアント側のJavaScriptエラー
**症状**: コンソールに赤いエラーメッセージ
**解決策**: エラーメッセージを共有してください

### 可能性4: Supabase設定の問題
**症状**: 401 Unauthorized エラー
**解決策**:
- Redirect URLsに`https://www.stus-lms.com/*`が追加されているか確認
- Site URLが正しく設定されているか確認

## 5. 🚀 簡易テストページ

以下のURLで簡易的なログインテストができます：
```
https://www.stus-lms.com/api/auth/test-login
```

このページでは：
- 環境変数の設定状態
- Supabaseへの接続状態
- 認証機能の動作確認
が可能です。

## 6. 📝 確認チェックリスト

- [ ] ブラウザコンソールにエラーが表示されていない
- [ ] ネットワークタブでSupabaseへのリクエストが確認できる
- [ ] 環境変数がundefinedではない
- [ ] デバッグモード(?debug=true)でログインできる
- [ ] Supabaseダッシュボードでログイン履歴が確認できる
- [ ] 別のブラウザ/シークレットウィンドウで試した

## 7. 🆘 それでも解決しない場合

以下の情報を教えてください：
1. ブラウザコンソールのエラーメッセージ（スクリーンショット）
2. ネットワークタブのリクエスト/レスポンス
3. 使用しているブラウザとバージョン
4. Supabaseダッシュボードのログ（Logs → Auth）