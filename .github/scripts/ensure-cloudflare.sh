#!/usr/bin/env bash
# Cloudflare Pages 프로젝트와 D1 DB가 없으면 만들고, 해당 환경용 wrangler.toml 생성
# 사용: ensure-cloudflare.sh <pages-project> <production-branch> <d1-name> <app-origin>
set -euo pipefail
PROJECT="$1"; BRANCH="$2"; DB_NAME="$3"; ORIGIN="$4"
API="https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID"
AUTH="Authorization: Bearer $CLOUDFLARE_API_TOKEN"

status=$(curl -s -o /tmp/pages.json -w "%{http_code}" -H "$AUTH" "$API/pages/projects/$PROJECT")
if [ "$status" = "404" ]; then
  npx wrangler pages project create "$PROJECT" --production-branch="$BRANCH"
elif [ "$status" != "200" ]; then
  cat /tmp/pages.json; echo "Pages 프로젝트 확인 실패 (HTTP $status)"; exit 1
fi

db_id=$(curl -sS --fail -H "$AUTH" "$API/d1/database?name=$DB_NAME" | jq -r --arg n "$DB_NAME" '.result[] | select(.name == $n) | .uuid' | head -n 1)
if [ -z "$db_id" ]; then
  db_id=$(curl -sS --fail -X POST -H "$AUTH" -H "Content-Type: application/json" \
    --data "{\"name\":\"$DB_NAME\"}" "$API/d1/database" | jq -r '.result.uuid // empty')
fi
test -n "$db_id" || { echo "D1 데이터베이스 $DB_NAME 생성/조회 실패"; exit 1; }

cat > wrangler.toml <<TOML
name = "$PROJECT"
compatibility_date = "2026-10-01"
pages_build_output_dir = "./public"

[vars]
APP_ORIGIN = "$ORIGIN"
GOOGLE_CLIENT_ID = "914417266341-6jcuk14qscujbq2e518q4nuslpo8d7sa.apps.googleusercontent.com"

[[d1_databases]]
binding = "DB"
database_name = "$DB_NAME"
database_id = "$db_id"
migrations_dir = "migrations"
TOML
echo "준비 완료: $PROJECT / $DB_NAME ($db_id)"
