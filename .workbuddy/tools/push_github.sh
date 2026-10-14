#!/bin/bash
# 推送到 GitHub。用法：bash .workbuddy/tools/push_github.sh <仓库地址>
# 例：bash .workbuddy/tools/push_github.sh https://github.com/alanjiao1988/shaozhu-gongzhu.git
set -e
URL="$1"
if [ -z "$URL" ]; then echo "用法: $0 <仓库地址>"; exit 1; fi
cd "$(dirname "$0")/../.."

if git remote | grep -q '^origin$'; then
  git remote set-url origin "$URL"
else
  git remote add origin "$URL"
fi
echo "→ remote: $(git remote get-url origin)"
echo "→ 推送中（第一次会弹浏览器让你登录 GitHub）…"
git push -u origin main
echo "✅ 完成"
