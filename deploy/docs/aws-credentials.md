# Getting AWS credentials for the client's account

> **Fastest path:** open **AWS CloudShell** while logged into the client's
> console (terminal icon, top bar). It is already authenticated as you, which
> sidesteps the chicken-and-egg problem of needing credentials to create
> credentials. Upload `iam-bootstrap-policy.json` via *Actions → Upload file*,
> then run `./scripts/bootstrap-deployer.sh`. It creates the identity, attaches
> the least-privilege policy, and prints the export lines.
>
> Add `--role` for a cross-account role instead of an access key, or
> `--rotate` to replace an existing key.

Three approaches, best first. All of them start with the least-privilege policy
in [`iam-bootstrap-policy.json`](iam-bootstrap-policy.json) — attach that rather
than `AdministratorAccess`, whichever route you take.

---

## Option 1 — GitHub OIDC (best for CI)

No stored credentials at all. GitHub Actions exchanges a short-lived token for
an IAM role; nothing long-lived exists to leak or rotate.

In the **client's** account:

1. IAM → Identity providers → **Add provider** → OpenID Connect
   - Provider URL: `https://token.actions.githubusercontent.com`
   - Audience: `sts.amazonaws.com`
2. IAM → Roles → **Create role** → Web identity → that provider
3. Trust policy — the `sub` condition is what stops *any* repo on GitHub from
   assuming your role:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike":   { "token.actions.githubusercontent.com:sub": "repo:srujansathwikp2005/IdelX:*" }
    }
  }]
}
```

4. Attach `iam-bootstrap-policy.json`.
5. Swap the credential step in `.github/workflows/deploy.yml`:

```yaml
permissions:
  id-token: write        # required for OIDC
  contents: read

- uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::<ACCOUNT_ID>:role/idlex-github-deploy
    aws-region: eu-north-1
```

Then `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` can be deleted from the
repository secrets entirely.

---

## Option 2 — Cross-account role (best for local runs)

Keeps your own identity, borrows the client's permissions. Still no long-lived
keys in the client's account.

The **client** creates a role trusting your account:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::<YOUR_ACCOUNT_ID>:root" },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": { "sts:ExternalId": "<A_SHARED_SECRET_STRING>" }
    }
  }]
}
```

> The `ExternalId` is not optional ceremony. Without it, the role is vulnerable
> to the confused-deputy problem: anyone who can persuade your account to make
> a call on their behalf can reach into the client's account. Generate one with
> `openssl rand -hex 16` and share it out of band.

Then in `~/.aws/config`:

```ini
[profile idlex-client]
role_arn       = arn:aws:iam::<CLIENT_ACCOUNT_ID>:role/idlex-deployer
external_id    = <A_SHARED_SECRET_STRING>
source_profile = default
region         = eu-north-1
```

Run with `AWS_PROFILE=idlex-client ./scripts/deploy.sh`.

---

## Option 3 — IAM user with access keys (simplest, weakest)

Only if the client will not set up a role. These are long-lived credentials:
they work until someone revokes them, and they are what leaks in git history.

1. IAM → Users → **Create user** → `idlex-deployer`, no console access
2. Attach `iam-bootstrap-policy.json` as an inline or managed policy
3. Security credentials → **Create access key** → *Third-party service*
4. Store the secret immediately — AWS shows it exactly once

```bash
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...
export AWS_REGION=eu-north-1
```

If you use these, set a calendar reminder to delete the key at the end of the
engagement. An orphaned deployer key with EC2 and IAM permissions is a real
liability for the client.

---

## Verifying

```bash
aws sts get-caller-identity            # confirms which account you are in
aws ec2 describe-instances --region eu-north-1 --max-items 1
```

`get-caller-identity` is the one to check first. Running the playbooks against
the wrong account is the most common and most confusing failure — it presents
as "no default VPC" or an empty inventory rather than as a permissions error.

---

## What the instance gets

Nothing. The deployment attaches no IAM role and no instance profile, and
writes no AWS credentials to the server. The instance runs the application
and talks to MongoDB Atlas over the network; it never calls the AWS API.

That is why the policy above needs no S3 or IAM permissions, and why a
narrowly scoped developer key is usually sufficient to run the playbooks
as-is.
