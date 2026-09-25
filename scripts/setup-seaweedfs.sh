#!/usr/bin/env bash

# Provision the SeaweedFS S3 buckets used by the API.
#
# Creates `${PROJECT_NAME}-public-${ENVIRONMENT}` and `${PROJECT_NAME}-private-${ENVIRONMENT}` through the
# S3 API (signed with SigV4 by curl). Safe to re-run: existing buckets are left untouched.
# Anonymous read access for the public bucket is granted in docker/seaweedfs/s3-config.json.
#
# Values come from the shell environment first, then the root .env, then local defaults.
#
# Usage:
#   ./scripts/setup-seaweedfs.sh
#   ./scripts/setup-seaweedfs.sh --help

set -Eeuo pipefail

trap 'echo "ERROR: Script failed at line ${LINENO}" >&2' ERR

usage() {
  cat <<'EOF'
Usage:
  ./scripts/setup-seaweedfs.sh          Provision the public and private buckets (idempotent)
  ./scripts/setup-seaweedfs.sh --help   Show this help

Environment (shell overrides .env):
  PROJECT_NAME         Bucket namespace (default: adelie)
  ENVIRONMENT          Bucket environment suffix (default: development)
  STORAGE_HOST         S3 host (default: localhost)
  STORAGE_PORT         S3 port (default: 8333)
  STORAGE_SSL          Use https when "true" (default: false)
  STORAGE_ACCESS_KEY   S3 access key (default: user)
  STORAGE_SECRET_KEY   S3 secret key (default: password)
  STORAGE_WAIT_SECONDS Seconds to wait for SeaweedFS to accept requests (default: 60)
EOF
}

require_command() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "ERROR: Required command not found: ${cmd}" >&2
    exit 1
  fi
}

case "${1:-}" in
  "") ;;
  -h | --help)
    usage
    exit 0
    ;;
  *)
    echo "ERROR: Unknown argument: $1" >&2
    usage >&2
    exit 1
    ;;
esac

require_command curl
require_command grep
require_command tail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
ENV_FILE="${PROJECT_ROOT}/.env"
S3_CONFIG_FILE="${PROJECT_ROOT}/docker/seaweedfs/s3-config.json"

# Read KEY from .env without sourcing it (values may not be shell-safe).
read_env_file_value() {
  local key="$1"
  local line value
  [[ -f "${ENV_FILE}" ]] || return 0
  line="$(grep -E "^${key}=" "${ENV_FILE}" | tail -n 1 || true)"
  [[ -n "${line}" ]] || return 0
  value="${line#"${key}="}"
  value="${value%$'\r'}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "${value}"
}

# Resolve KEY from the shell, then .env, then DEFAULT.
resolve() {
  local key="$1"
  local default="$2"
  local value="${!key:-}"
  if [[ -z "${value}" ]]; then
    value="$(read_env_file_value "${key}")"
  fi
  printf '%s' "${value:-${default}}"
}

PROJECT_NAME="$(resolve PROJECT_NAME adelie)"
ENVIRONMENT="$(resolve ENVIRONMENT development)"
STORAGE_HOST="$(resolve STORAGE_HOST localhost)"
STORAGE_PORT="$(resolve STORAGE_PORT 8333)"
STORAGE_SSL="$(resolve STORAGE_SSL false)"
STORAGE_ACCESS_KEY="$(resolve STORAGE_ACCESS_KEY user)"
STORAGE_SECRET_KEY="$(resolve STORAGE_SECRET_KEY password)"
STORAGE_WAIT_SECONDS="${STORAGE_WAIT_SECONDS:-60}"

if [[ ! "${STORAGE_WAIT_SECONDS}" =~ ^[0-9]+$ ]]; then
  echo "ERROR: STORAGE_WAIT_SECONDS must be a non-negative integer" >&2
  exit 1
fi

SCHEME="http"
if [[ "${STORAGE_SSL}" == "true" ]]; then
  SCHEME="https"
fi
S3_ENDPOINT="${SCHEME}://${STORAGE_HOST}:${STORAGE_PORT}"

PUBLIC_BUCKET="${PROJECT_NAME}-public-${ENVIRONMENT}"
PRIVATE_BUCKET="${PROJECT_NAME}-private-${ENVIRONMENT}"

echo "Setting up SeaweedFS buckets"
echo "  S3 endpoint:    ${S3_ENDPOINT}"
echo "  Public bucket:  ${PUBLIC_BUCKET}"
echo "  Private bucket: ${PRIVATE_BUCKET}"
echo ""

# Print the HTTP status of a SigV4-signed S3 request; "000" means no connection.
s3_status() {
  local method="$1"
  local path="$2"
  curl --silent --output /dev/null --write-out '%{http_code}' \
    --max-time 10 \
    --request "${method}" \
    --aws-sigv4 "aws:amz:us-east-1:s3" \
    --user "${STORAGE_ACCESS_KEY}:${STORAGE_SECRET_KEY}" \
    "${S3_ENDPOINT}${path}" || true
}

wait_for_s3() {
  local waited=0
  local status
  while true; do
    status="$(s3_status GET /)"
    if [[ "${status}" == "200" ]]; then
      return 0
    fi
    if [[ "${status}" == "403" ]]; then
      echo "ERROR: SeaweedFS rejected the credentials (STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY)." >&2
      echo "They must match an identity in ${S3_CONFIG_FILE}." >&2
      exit 1
    fi
    if ((waited >= STORAGE_WAIT_SECONDS)); then
      echo "ERROR: SeaweedFS S3 is not ready at ${S3_ENDPOINT} (last status: ${status})." >&2
      echo "Start it with: docker compose up -d seaweedfs" >&2
      exit 1
    fi
    sleep 2
    waited=$((waited + 2))
  done
}

ensure_bucket() {
  local bucket="$1"
  local status

  status="$(s3_status HEAD "/${bucket}")"
  case "${status}" in
    200)
      echo "  ok      ${bucket} (already exists)"
      return 0
      ;;
    404) ;;
    *)
      echo "ERROR: Unexpected status ${status} checking bucket ${bucket}" >&2
      exit 1
      ;;
  esac

  status="$(s3_status PUT "/${bucket}")"
  case "${status}" in
    200 | 409)
      echo "  created ${bucket}"
      ;;
    *)
      echo "ERROR: Failed to create bucket ${bucket} (status ${status})" >&2
      exit 1
      ;;
  esac
}

echo "Waiting for SeaweedFS S3 (up to ${STORAGE_WAIT_SECONDS}s)..."
wait_for_s3

ensure_bucket "${PUBLIC_BUCKET}"
ensure_bucket "${PRIVATE_BUCKET}"

if [[ -f "${S3_CONFIG_FILE}" ]] && ! grep -q "\"Read:${PUBLIC_BUCKET}\"" "${S3_CONFIG_FILE}"; then
  echo ""
  echo "WARNING: ${S3_CONFIG_FILE} does not grant anonymous \"Read:${PUBLIC_BUCKET}\"." >&2
  echo "Public files will not be readable without credentials until that identity is updated" >&2
  echo "and SeaweedFS is restarted." >&2
fi

echo ""
echo "SeaweedFS buckets are ready."
