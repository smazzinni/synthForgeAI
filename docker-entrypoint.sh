#!/bin/sh
set -e
# Apply pending database migrations before starting (Postgres only).
case "$DATABASE_URL" in
  postgres://*|postgresql://*)
    echo "[entrypoint] Applying database migrations…"
    prisma migrate deploy --schema ./prisma/schema.prisma
    ;;
  *)
    echo "[entrypoint] DATABASE_URL is not a Postgres URL — skipping migrations (Supabase or in-memory storage will be used)."
    ;;
esac
exec node server.js
