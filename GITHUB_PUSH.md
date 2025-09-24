# GitHubへのプッシュ手順

## 現在の状態
✅ Gitリポジトリ初期化済み（mainブランチ）
✅ 初期コミット作成済み（コミットハッシュ: e336730）
✅ .gitignore設定済み

## GitHubへのプッシュ手順

### 1. GitHubでリポジトリを作成

1. [GitHub](https://github.com)にログイン
2. 右上の「+」→「New repository」をクリック
3. 以下の設定でリポジトリを作成：
   - **Repository name**: `lms2-app`
   - **Description**: `Learning Management System built with Next.js and Supabase`
   - **Public/Private**: お好みで選択
   - **重要**: 「Initialize this repository with:」のチェックは**すべて外す**
   - 「Create repository」をクリック

### 2. ローカルリポジトリとGitHubを接続

GitHubでリポジトリ作成後、表示されるURLをコピーして以下のコマンドを実行：

```bash
# HTTPSの場合（推奨）
git remote add origin https://github.com/YOUR_USERNAME/lms2-app.git

# または SSHの場合
git remote add origin git@github.com:YOUR_USERNAME/lms2-app.git
```

**YOUR_USERNAME**を実際のGitHubユーザー名に置き換えてください。

### 3. GitHubへプッシュ

```bash
# mainブランチをGitHubへプッシュ
git push -u origin main
```

初回プッシュ時：
- **HTTPS**の場合：GitHubのユーザー名とパスワード（またはPersonal Access Token）の入力を求められます
- **SSH**の場合：事前にSSHキーの設定が必要です

### 4. Personal Access Token（PAT）の作成方法（HTTPSの場合）

GitHubはパスワード認証を廃止したため、HTTPSでプッシュする場合はPATが必要です：

1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. 「Generate new token」→「Generate new token (classic)」
3. 設定：
   - **Note**: `lms2-app push`
   - **Expiration**: 90 days（お好みで）
   - **Scopes**: `repo`にチェック
4. 「Generate token」をクリック
5. 表示されたトークンをコピー（一度しか表示されません！）
6. プッシュ時のパスワード入力欄にこのトークンを貼り付け

### 5. プッシュ成功の確認

```bash
# リモートリポジトリの確認
git remote -v

# プッシュ状態の確認
git status
```

成功すると以下のようなメッセージが表示されます：
```
Your branch is up to date with 'origin/main'.
```

### 6. GitHubでの確認

ブラウザでGitHubリポジトリページを更新し、ファイルがアップロードされていることを確認。

## トラブルシューティング

### 認証エラーが出る場合

```bash
# HTTPSからSSHに変更する場合
git remote set-url origin git@github.com:YOUR_USERNAME/lms2-app.git

# SSHからHTTPSに変更する場合
git remote set-url origin https://github.com/YOUR_USERNAME/lms2-app.git
```

### プッシュが拒否される場合

```bash
# 強制プッシュ（初回のみ、既存のリポジトリがある場合）
git push -f origin main
```
**警告**: 強制プッシュは既存のコミット履歴を上書きします。

### リモートURLを間違えた場合

```bash
# 現在の設定を確認
git remote -v

# URLを修正
git remote set-url origin 正しいURL
```

## 次のステップ

GitHubへのプッシュが完了したら：
1. Vercelでこのリポジトリをインポート
2. 環境変数を設定
3. デプロイを実行

詳細は`DEPLOY.md`を参照してください。