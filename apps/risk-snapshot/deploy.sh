#!/bin/bash

# GitHub 部署脚本
# 使用方法: ./deploy.sh YOUR_GITHUB_USERNAME

if [ -z "$1" ]; then
    echo "❌ 错误: 请提供你的 GitHub 用户名"
    echo "使用方法: ./deploy.sh YOUR_GITHUB_USERNAME"
    exit 1
fi

GITHUB_USERNAME=$1
REPO_NAME="risk-snapshot-netlify"

echo "🚀 开始部署到 GitHub..."
echo ""

# 检查是否已有远程仓库
if git remote | grep -q "origin"; then
    echo "⚠️  远程仓库已存在，跳过添加步骤"
else
    echo "📝 添加远程仓库..."
    git remote add origin https://github.com/${GITHUB_USERNAME}/${REPO_NAME}.git
fi

# 确保分支名为 main
echo "📦 设置主分支..."
git branch -M main

# 推送代码
echo "⬆️  推送代码到 GitHub..."
git push -u origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 部署成功！"
    echo ""
    echo "📎 仓库链接: https://github.com/${GITHUB_USERNAME}/${REPO_NAME}"
    echo ""
    echo "💡 提示: 如果你想启用 GitHub Pages，请访问："
    echo "   https://github.com/${GITHUB_USERNAME}/${REPO_NAME}/settings/pages"
else
    echo ""
    echo "❌ 推送失败"
    echo ""
    echo "请确保："
    echo "1. 已在 GitHub 创建仓库: ${REPO_NAME}"
    echo "2. 仓库地址正确: https://github.com/${GITHUB_USERNAME}/${REPO_NAME}"
    echo "3. 你有推送权限"
fi
