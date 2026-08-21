#!/usr/bin/env bash
#
# bootstrap-deployer.sh — create the IAM deployer identity in the CLIENT's
# AWS account.
#
# Run this ONCE, with administrator credentials for the client's account.
# The easiest place is AWS CloudShell inside that account's console: it is
# already authenticated, so there is no bootstrapping problem.
#
#   ./scripts/bootstrap-deployer.sh              create user + access key
#   ./scripts/bootstrap-deployer.sh --role       create a cross-account role
#   ./scripts/bootstrap-deployer.sh --rotate     replace the existing key
#
# Everything it creates is named idlex-deployer* so it is trivial to audit
# and to delete at the end of the engagement.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

USER_NAME="idlex-deployer"
POLICY_NAME="idlex-deployer-policy"
POLICY_FILE="docs/iam-bootstrap-policy.json"
MODE="${1:-user}"

[[ -r "$POLICY_FILE" ]] || {
  echo "ERROR: $POLICY_FILE not found." >&2
  echo "       In CloudShell, use Actions -> Upload file to bring it across," >&2
  echo "       then run this script from the same directory." >&2
  exit 1
}

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
echo "==> Operating in AWS account: $ACCOUNT"
read -r -p "    Is that the CLIENT's account? [y/N] " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }

# --- Cross-account role (preferred: no long-lived keys) --------------------
if [[ "$MODE" == "--role" ]]; then
  read -r -p "    Your own AWS account id: " TRUSTED_ACCOUNT
  EXTERNAL_ID=$(openssl rand -hex 16)

  TRUST=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::${TRUSTED_ACCOUNT}:root" },
    "Action": "sts:AssumeRole",
    "Condition": { "StringEquals": { "sts:ExternalId": "${EXTERNAL_ID}" } }
  }]
}
JSON
)
  aws iam create-role --role-name "$USER_NAME" \
      --assume-role-policy-document "$TRUST" >/dev/null
  aws iam put-role-policy --role-name "$USER_NAME" \
      --policy-name "$POLICY_NAME" \
      --policy-document "file://${POLICY_FILE}"

  cat <<OUT

  Role created. Add this to ~/.aws/config on your machine:

    [profile idlex-client]
    role_arn       = arn:aws:iam::${ACCOUNT}:role/${USER_NAME}
    external_id    = ${EXTERNAL_ID}
    source_profile = default
    region         = eu-north-1

  Then:  AWS_PROFILE=idlex-client ./scripts/deploy.sh check

  Keep the external id above — it is required and is not recoverable from
  the console after this run.
OUT
  exit 0
fi

# --- IAM user with an access key -------------------------------------------
if aws iam get-user --user-name "$USER_NAME" >/dev/null 2>&1; then
  echo "==> User $USER_NAME already exists"
  if [[ "$MODE" != "--rotate" ]]; then
    echo "    Re-run with --rotate to issue a replacement key." >&2
    exit 1
  fi
  # AWS allows only two keys per user, and leaving a stale one active is a
  # standing liability — delete before creating.
  for k in $(aws iam list-access-keys --user-name "$USER_NAME" \
               --query 'AccessKeyMetadata[].AccessKeyId' --output text); do
    echo "    Deleting old key $k"
    aws iam delete-access-key --user-name "$USER_NAME" --access-key-id "$k"
  done
else
  aws iam create-user --user-name "$USER_NAME" \
      --tags Key=Project,Value=idlex Key=ManagedBy,Value=ansible >/dev/null
  echo "==> Created user $USER_NAME"
fi

aws iam put-user-policy --user-name "$USER_NAME" \
    --policy-name "$POLICY_NAME" \
    --policy-document "file://${POLICY_FILE}"
echo "==> Attached least-privilege policy"

CREDS=$(aws iam create-access-key --user-name "$USER_NAME" \
          --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)
KEY_ID=$(echo "$CREDS" | cut -f1)
SECRET=$(echo "$CREDS" | cut -f2)

cat <<OUT

  Access key created. The secret is shown ONCE and cannot be retrieved again.

    export AWS_ACCESS_KEY_ID=${KEY_ID}
    export AWS_SECRET_ACCESS_KEY=${SECRET}
    export AWS_REGION=eu-north-1

  Verify with:  aws sts get-caller-identity     # expect account ${ACCOUNT}
  Then:         ./scripts/deploy.sh check

  This is a long-lived credential with EC2, S3 and IAM permissions. Delete it
  when the engagement ends:

    aws iam delete-access-key --user-name ${USER_NAME} --access-key-id ${KEY_ID}
    aws iam delete-user-policy --user-name ${USER_NAME} --policy-name ${POLICY_NAME}
    aws iam delete-user --user-name ${USER_NAME}
OUT
