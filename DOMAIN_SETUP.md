# カスタムドメイン設定手順（stus-lms.com）

## 現在の状態
- ✅ Vercelへのデプロイ完了
- ⏳ カスタムドメインの設定待ち
- 🔗 現在のURL: https://lms2-3wsrfg31h-omegacables-projects.vercel.app

## カスタムドメイン設定手順

### 1. Vercelでドメインを追加

1. [Vercelダッシュボード](https://vercel.com/dashboard)にログイン
2. `lms2-app`プロジェクトを選択
3. **Settings** → **Domains**へ移動
4. **Add**ボタンをクリック
5. `stus-lms.com`を入力して追加

### 2. DNS設定（ドメインレジストラ側）

Vercelが提供するDNS設定を、ドメインレジストラ（お名前.com、Route53など）に設定します。

#### 推奨設定（Aレコード + CNAMEレコード）

| タイプ | ホスト名 | 値 |
|--------|---------|-----|
| A | @ | 76.76.21.21 |
| CNAME | www | cname.vercel-dns.com |

または

#### 代替設定（CNAMEレコードのみ）

| タイプ | ホスト名 | 値 |
|--------|---------|-----|
| CNAME | @ | cname.vercel-dns.com |
| CNAME | www | cname.vercel-dns.com |

### 3. DNS伝播の確認

DNS設定後、反映まで最大48時間かかる場合があります。

確認コマンド:
```bash
# DNSレコードの確認
nslookup stus-lms.com
dig stus-lms.com

# アクセス確認
curl -I https://stus-lms.com
```

### 4. SSL証明書

VercelがLet's Encryptを使用して自動的にSSL証明書を発行・管理します。
DNSレコードが正しく設定されると、自動的にHTTPS化されます。

### 5. 環境変数の確認

Vercelダッシュボードで以下の環境変数が設定されているか確認:

| 変数名 | 説明 |
|--------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | SupabaseプロジェクトのURL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key |

### 6. Supabase側の設定

Supabaseダッシュボードで新しいドメインを許可:

1. Supabaseプロジェクトダッシュボード → **Authentication** → **URL Configuration**
2. **Site URL**に`https://stus-lms.com`を設定
3. **Redirect URLs**に以下を追加:
   - `https://stus-lms.com`
   - `https://www.stus-lms.com`
   - `https://stus-lms.com/*`
   - `https://www.stus-lms.com/*`

### 7. CORSの設定（必要な場合）

Supabase Storage使用時:
1. **Storage** → **Settings** → **CORS**
2. 以下のオリジンを追加:
```json
{
  "origin": ["https://stus-lms.com", "https://www.stus-lms.com"],
  "allowed_headers": ["*"],
  "exposed_headers": ["*"],
  "max_age_seconds": 3600
}
```

## トラブルシューティング

### ドメインが反映されない場合
- DNS設定が正しいか確認
- DNSキャッシュをクリア: `ipconfig /flushdns` (Windows) / `sudo dscacheutil -flushcache` (Mac)
- 最大48時間待つ

### "Domain not configured"エラー
- Vercelダッシュボードでドメインが追加されているか確認
- DNSレコードが正しく設定されているか確認

### SSL証明書エラー
- DNSが正しく設定されているか確認
- Vercelダッシュボードで証明書の状態を確認

## 確認項目チェックリスト

- [ ] Vercelにドメインを追加
- [ ] DNSレコードを設定
- [ ] DNS伝播を確認（nslookup/dig）
- [ ] HTTPSアクセス可能か確認
- [ ] Supabase URLConfiguration更新
- [ ] 環境変数の設定確認
- [ ] ログイン機能の動作確認
- [ ] 動画アップロード/再生の確認