#!/usr/bin/env bash
#
# deploy.sh — one command, commit to production.
#
#   ./scripts/deploy.sh                 provision + configure + deploy
#   ./scripts/deploy.sh deploy          ship a release to existing infra
#   ./scripts/deploy.sh rollback        return to the previous release
#   ./scripts/deploy.sh check           dry run, change nothing
#
# Secrets are read from the environment; see README "Secrets".

set -euo pipefail

# Always operate from deploy/, so relative paths in ansible.cfg resolve
# no matter where the caller invoked this from.
cd "$(dirname "${BASH_SOURCE[0]}")/.."

STAGE="${1:-all}"
shift || true

# --- Preflight -------------------------------------------------------------
command -v ansible-playbook >/dev/null 2>&1 || {
  echo "ERROR: ansible-playbook not found. pip install ansible" >&2
  exit 1
}

require_env() {
  local missing=()
  for var in "$@"; do
    [[ -n "${!var:-}" ]] || missing+=("$var")
  done
  if (( ${#missing[@]} )); then
    echo "ERROR: missing required environment variables:" >&2
    printf '  %s\n' "${missing[@]}" >&2
    echo "See deploy/README.md -> Secrets" >&2
    exit 1
  fi
}

# AWS credentials are needed for provisioning and for the dynamic inventory.
require_env AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY

# Application secrets are needed for anything that renders shared/.env.
if [[ "$STAGE" != "check" ]]; then
  require_env IDLEX_MONGO_URI IDLEX_JWT_ACCESS_SECRET IDLEX_JWT_REFRESH_SECRET
fi

# Map the IDLEX_-prefixed environment onto ansible variables. Prefixing keeps
# the app's secrets from colliding with anything else in a CI environment.
EXTRA_VARS=$(cat <<JSON
{
  "mongo_uri": "${IDLEX_MONGO_URI:-}",
  "jwt_access_secret": "${IDLEX_JWT_ACCESS_SECRET:-}",
  "jwt_refresh_secret": "${IDLEX_JWT_REFRESH_SECRET:-}",
  "renflair_api_key": "${IDLEX_RENFLAIR_API_KEY:-}",
  "smtp_host": "${IDLEX_SMTP_HOST:-}",
  "smtp_user": "${IDLEX_SMTP_USER:-}",
  "smtp_pass": "${IDLEX_SMTP_PASS:-}",
  "smtp_from": "${IDLEX_SMTP_FROM:-}",
  "razorpay_key_id": "${IDLEX_RAZORPAY_KEY_ID:-}",
  "razorpay_key_secret": "${IDLEX_RAZORPAY_KEY_SECRET:-}",
  "razorpay_webhook_secret": "${IDLEX_RAZORPAY_WEBHOOK_SECRET:-}",
  "razorpay_account_number": "${IDLEX_RAZORPAY_ACCOUNT_NUMBER:-}",
  "client_url": "${IDLEX_CLIENT_URL:-}"
}
JSON
)

# Forward the ssh-agent so the instance can pull from the private repo
# without a deploy key ever being written to disk on the server.
if [[ -z "${SSH_AUTH_SOCK:-}" ]] && [[ "$STAGE" != "check" ]]; then
  echo "WARNING: no ssh-agent detected. The git clone on the instance may fail." >&2
  echo "         Run: eval \$(ssh-agent) && ssh-add ~/.ssh/id_ed25519" >&2
fi

run() {
  echo "==> ansible-playbook playbooks/$1"
  ansible-playbook "playbooks/$1" --extra-vars "$EXTRA_VARS" "${@:2}"
}

case "$STAGE" in
  all)       run site.yml "$@" ;;
  provision) run provision.yml "$@" ;;
  configure) run configure.yml "$@" ;;
  deploy)    run deploy.yml "$@" ;;
  rollback)  run rollback.yml "$@" ;;
  check)     run site.yml --check --diff "$@" ;;
  *)
    echo "Unknown stage: $STAGE" >&2
    echo "Usage: $0 [all|provision|configure|deploy|rollback|check]" >&2
    exit 2
    ;;
esac
