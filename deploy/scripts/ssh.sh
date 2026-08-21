#!/usr/bin/env bash
#
# ssh.sh — connect to a provisioned IdleX host without knowing its IP.
#
# Public IPs change whenever an instance is stopped and started (no Elastic
# IP is attached by default), so this resolves the current address from EC2
# tags rather than relying on a hardcoded entry in ~/.ssh/config.
#
#   ./scripts/ssh.sh                 ssh to the prod host
#   ./scripts/ssh.sh dev             ssh to the dev host
#   ./scripts/ssh.sh prod 'uptime'   run a command and exit
#   ./scripts/ssh.sh prod --ip       print the ip only

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

ENV_NAME="${1:-prod}"; shift || true

# Read the key path and region straight from group_vars so this script and
# the playbooks can never disagree about which key or region to use.
VARS_FILE="inventory/group_vars/all.yml"
read_var() { sed -n "s/^${1}:[[:space:]]*\"\{0,1\}\([^\"#]*\)\"\{0,1\}.*/\1/p" "$VARS_FILE" | head -1 | xargs; }

REGION="${AWS_REGION:-$(read_var aws_region)}"
KEY="$(read_var ec2_ssh_private_key)"
USER="$(read_var app_user)"
KEY="${KEY/#\~/$HOME}"

command -v aws >/dev/null || { echo "ERROR: aws cli not found" >&2; exit 1; }

IP=$(aws ec2 describe-instances \
      --region "$REGION" \
      --filters "Name=tag:Project,Values=idlex" \
                "Name=tag:Env,Values=${ENV_NAME}" \
                "Name=instance-state-name,Values=running" \
      --query 'Reservations[].Instances[].PublicIpAddress' \
      --output text 2>/dev/null | tr '\t' '\n' | head -1)

if [[ -z "$IP" || "$IP" == "None" ]]; then
  echo "ERROR: no running instance tagged Project=idlex, Env=${ENV_NAME} in ${REGION}." >&2
  echo "       Account: $(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo unknown)" >&2
  echo "       If that is the wrong account, set AWS_PROFILE. If the host has" >&2
  echo "       not been created yet, run: ./scripts/deploy.sh provision" >&2
  exit 1
fi

if [[ "${1:-}" == "--ip" ]]; then echo "$IP"; exit 0; fi

[[ -r "$KEY" ]] || { echo "ERROR: private key not readable: $KEY" >&2; exit 1; }

echo "==> ${USER}@${IP} (Env=${ENV_NAME}, ${REGION})" >&2
# accept-new trusts a first-time host but still detects later key changes,
# unlike StrictHostKeyChecking=no which ignores them entirely.
exec ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "${USER}@${IP}" "$@"
