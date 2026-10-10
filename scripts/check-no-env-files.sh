#!/bin/sh
# Refuses real env files (.env, .env.local, .env.production, ...). Only the declared templates may be tracked.
# Usage: check-no-env-files.sh <file>...   (reads names from arguments, or one per line on stdin when none)
bad=""
check() {
  case "$(basename "$1")" in
    .env.example | .env.schema | .env.test) ;;
    .env | .env.*) bad="${bad}  $1
" ;;
  esac
}
if [ "$#" -gt 0 ]; then
  for f in "$@"; do check "$f"; done
else
  while IFS= read -r f; do check "$f"; done
fi
if [ -n "$bad" ]; then
  echo "Refusing to commit env files (they hold real secrets):" >&2
  printf '%s' "$bad" >&2
  echo "Keep secrets in Proton Pass via apps/*/.env.schema, or in gitignored local files." >&2
  exit 1
fi
