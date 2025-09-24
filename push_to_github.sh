#!/bin/bash

# GitHubへのプッシュスクリプト
# 使い方: ./push_to_github.sh [username] [token]

echo "==================================="
echo "GitHub Push Helper"
echo "==================================="

# 引数チェック
if [ $# -eq 2 ]; then
    USERNAME=$1
    TOKEN=$2

    # URLを設定
    git remote set-url origin https://${USERNAME}:${TOKEN}@github.com/omegacables/lms2-app.git

    echo "認証情報を設定しました。プッシュを実行します..."
    git push -u origin main

    # セキュリティのためURLを元に戻す
    git remote set-url origin https://github.com/omegacables/lms2-app.git
    echo "完了しました！"
else
    echo "使い方:"
    echo "  bash push_to_github.sh [GitHubユーザー名] [Personal Access Token]"
    echo ""
    echo "例:"
    echo "  bash push_to_github.sh myusername ghp_xxxxxxxxxxxx"
    echo ""
    echo "Personal Access Tokenの作成方法:"
    echo "1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)"
    echo "2. 'Generate new token' → 'Generate new token (classic)'"
    echo "3. Note: 'lms2-app push'"
    echo "4. Expiration: 90 days"
    echo "5. Scopes: 'repo'にチェック"
    echo "6. 'Generate token'をクリック"
    echo "7. 表示されたトークンをコピー（一度しか表示されません）"
fi