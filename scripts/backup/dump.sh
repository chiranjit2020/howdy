#!/usr/bin/env bash
# Dump Howdy's database to one file (pg_dump custom format), without the rows of the tables in skip-data.txt.
# Usage: BACKUP_DATABASE_URL=<read-only howdy_backup login, direct host> scripts/backup/dump.sh <out file>
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="${1:?usage: dump.sh <out file>}"
: "${BACKUP_DATABASE_URL:?set BACKUP_DATABASE_URL}"
skip=()
while IFS= read -r t || [[ -n "$t" ]]; do
  t="${t%%#*}"; t="${t//[[:space:]]/}"
  [[ -n "$t" ]] && skip+=("--exclude-table-data=public.${t}")
done < "$here/skip-data.txt"
pg_dump "$BACKUP_DATABASE_URL" --format=custom --compress=9 --no-owner --no-privileges "${skip[@]}" --file="$out"
