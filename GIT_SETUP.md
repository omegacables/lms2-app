# GitHub プッシュ権限の設定方法

## 方法1: Personal Access Token (PAT) を使用する方法（推奨）

1. GitHubにログインして、以下のURLにアクセスします：
   https://github.com/settings/tokens/new

2. 新しいPersonal Access Tokenを作成します：
   - Note: "LMS2 App Deploy"
   - Expiration: 必要に応じて設定
   - Scopes: 以下を選択
     - ✅ repo (Full control of private repositories)
     - ✅ workflow (Update GitHub Action workflows)

3. 生成されたトークンをコピーします（一度しか表示されません）

4. ターミナルで以下のコマンドを実行します：
   ```bash
   git config --global credential.helper store
   ```

5. 次回のpush時に認証情報を求められたら：
   - Username: あなたのGitHubユーザー名
   - Password: 生成したPersonal Access Token（パスワードではありません）

## 方法2: SSH キーを使用する方法

1. SSH キーを生成（既にある場合はスキップ）：
   ```bash
   ssh-keygen -t ed25519 -C "your-email@example.com"
   ```

2. SSH キーをGitHubに追加：
   - 公開鍵をコピー：
     ```bash
     cat ~/.ssh/id_ed25519.pub
     ```
   - GitHubの Settings > SSH and GPG keys > New SSH key に追加

3. リモートURLをSSHに変更：
   ```bash
   git remote set-url origin git@github.com:omegacables/lms2-app.git
   ```

## 方法3: GitHub CLI を使用する方法

1. GitHub CLIをインストール（WSL/Ubuntu）：
   ```bash
   curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
   sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
   sudo apt update
   sudo apt install gh
   ```

2. 認証：
   ```bash
   gh auth login
   ```

## 現在の設定確認

現在のGit設定：
- Remote URL: https://github.com/omegacables/lms2-app.git
- User Name: LMS2 Developer
- User Email: developer@lms2.local
- Credential Helper: store

## テスト用コマンド

設定が完了したら、以下のコマンドでテストできます：
```bash
# 空のコミットを作成してプッシュテスト
git commit --allow-empty -m "Test: Git push access"
git push origin main
```

## トラブルシューティング

エラーが発生した場合：

1. 認証情報のリセット：
   ```bash
   git config --global --unset credential.helper
   git config --global credential.helper store
   ```

2. キャッシュされた認証情報のクリア：
   ```bash
   rm ~/.git-credentials
   ```

3. 詳細なデバッグ情報の表示：
   ```bash
   GIT_TRACE=1 git push origin main
   ```