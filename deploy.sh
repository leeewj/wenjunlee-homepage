#!/usr/bin/env bash
# 一键发布：校验 → 构建 → 提交 → 推送（推送后 Cloudflare 自动构建部署）
#
#   ./deploy.sh "改了下 bio 的内容"
#
# 任何一步失败就停下，不会把坏代码推上线。
set -euo pipefail
cd "$(dirname "$0")"

msg="${1:-update}"

# 这台机器直连 GitHub 不通，仓库里配了 http.proxy=127.0.0.1:7890。
if ! lsof -nP -iTCP:7890 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "⚠️  本地代理 127.0.0.1:7890 没在跑，push 会卡住。先开 VPN 再重试。" >&2
  exit 1
fi

echo "→ 类型检查"
npm run typecheck

echo "→ 构建"
npm run build

echo "→ 提交"
git add -A
if git diff --cached --quiet; then
  echo "   没有改动，跳过提交"
  exit 0
fi
git commit -m "$msg"

echo "→ 推送"
git push

echo
echo "✅ 已推送。Cloudflare 约 20 秒后完成构建，可用下面的命令确认线上是否更新："
echo "   curl -s https://wenjunlee.com/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\\.js'"
