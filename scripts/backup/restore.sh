#!/usr/bin/env bash
# Restore a dump made by dump.sh into an EMPTY database. Owners and grants are not restored: afterwards run
# `pnpm db:app-role` (and `--backup`) against it as its owner. See docs/security/DATABASE_ACCESS.md.
# Usage: scripts/backup/restore.sh <dump file> <target database URL>
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
dump="${1:?usage: restore.sh <dump file> <target url>}"
target="${2:?usage: restore.sh <dump file> <target url>}"
opts=(--exit-on-error --no-owner --no-privileges --dbname="$target")
pg_restore --section=pre-data "${opts[@]}" "$dump"
pg_restore --section=data "${opts[@]}" "$dump"
psql "$target" --quiet -v ON_ERROR_STOP=1 -f "$here/fix-dangling.sql"
pg_restore --section=post-data "${opts[@]}" "$dump"
