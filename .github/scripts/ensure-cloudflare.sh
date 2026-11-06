#!/usr/bin/env bash
# Cloudflare Pages 프로젝트가 없으면 생성
# 사용: ensure-cloudflare.sh <pages-project> <production-branch>
set -euo pipefail
PROJECT="$1"; BRANCH="$2"
status=$(curl -s -o /tmp/pages.json -w "%{http_code}" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT")
if [ "$status" = "404" ]; then
  npx wrangler pages project create "$PROJECT" --production-branch="$BRANCH"
elif [ "$status" != "200" ]; then
  cat /tmp/pages.json; echo "Pages 프로젝트 확인 실패 (HTTP $status)"; exit 1
fi
echo "준비 완료: $PROJECT"
