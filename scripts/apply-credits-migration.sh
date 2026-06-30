#!/usr/bin/env bash
# Apply 012_credits.sql when SUPABASE_DB_PASSWORD is set in .env.local
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env.local"
SQL_FILE="$ROOT/supabase/migrations/012_credits.sql"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source <(grep -E '^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_DB_PASSWORD)=' "$ENV_FILE" | sed 's/^/export /')
  set +a
fi

REF="${NEXT_PUBLIC_SUPABASE_URL#https://}"
REF="${REF%%.supabase.co}"

if [[ -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
  echo "Set SUPABASE_DB_PASSWORD in .env.local (Supabase → Project Settings → Database)."
  echo "Or paste supabase/migrations/012_credits.sql into the SQL Editor manually."
  exit 1
fi

PSQL="${PSQL:-/opt/homebrew/opt/libpq/bin/psql}"
if ! command -v "$PSQL" >/dev/null 2>&1; then
  PSQL="psql"
fi

echo "Applying 012_credits.sql to db.${REF}.supabase.co ..."
PGPASSWORD="$SUPABASE_DB_PASSWORD" "$PSQL" \
  "postgresql://postgres@db.${REF}.supabase.co:5432/postgres" \
  -v ON_ERROR_STOP=1 \
  -f "$SQL_FILE"

echo "Done."
