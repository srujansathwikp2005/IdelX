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

# AWS credentials are needed for provisioning and for the dynamic inventory,
# but they can arrive several ways. Accept a named profile or an assumed-role
# session as readily as static keys — profiles are what the docs recommend,
# and rejecting them here would contradict that guidance.
if [[ -z "${AWS_PROFILE:-}" ]]; then
  if [[ -n "${AWS_ACCESS_KEY_ID:-}" ]]; then
    require_env AWS_SECRET_ACCESS_KEY
  else
    echo "ERROR: no AWS credentials found." >&2
    echo "       Set AWS_PROFILE, or AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY." >&2
    echo "       See deploy/docs/aws-credentials.md" >&2
    exit 1
  fi
fi

# Application secrets are only needed by stages that render shared/.env or
# start the app. Provisioning creates infrastructure and touches none of it,
# so demanding them there would block a legitimate infra-only run.
case "$STAGE" in
  all|configure|deploy)
    require_env IDLEX_MONGO_URI IDLEX_JWT_ACCESS_SECRET IDLEX_JWT_REFRESH_SECRET
    ;;
esac

# Map the IDLEX_-prefixed environment onto ansible variables. Prefixing keeps
# the app's secrets from colliding with anything else in a CI environment.
EXTRA_VARS=$(cat <<JSON
{
  "mongo_uri": "${IDLEX_MONGO_URI:-}",
  "jwt_access_secret": "${IDLEX_JWT_ACCESS_SECRET:-}",
  "jwt_refresh_secret": "${IDLEX_JWT_REFRESH_SECRET:-}",
  "admin_email": "${IDLEX_ADMIN_EMAIL:-}",
  "admin_password": "${IDLEX_ADMIN_PASSWORD:-}",
  "renflair_api_key": "${IDLEX_RENFLAIR_API_KEY:-}",
  "smtp_host": "${IDLEX_SMTP_HOST:-}",
  "smtp_port": "${IDLEX_SMTP_PORT:-587}",
  "smtp_secure": "${IDLEX_SMTP_SECURE:-false}",
  "smtp_user": "${IDLEX_SMTP_USER:-}",
  "smtp_pass": "${IDLEX_SMTP_PASS:-}",
  "smtp_from": "${IDLEX_SMTP_FROM:-}",
  "cashfree_app_id": "${IDLEX_CASHFREE_APP_ID:-}",
  "cashfree_secret_key": "${IDLEX_CASHFREE_SECRET_KEY:-}",
  "cashfree_webhook_secret": "${IDLEX_CASHFREE_WEBHOOK_SECRET:-}",
  "cashfree_mode": "${IDLEX_CASHFREE_MODE:-sandbox}",
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
