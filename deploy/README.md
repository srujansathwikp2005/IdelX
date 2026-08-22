# IdleX — EC2 Deployment

Ansible-driven provisioning and deployment for the IdleX rental marketplace.
One command takes a fresh AWS account to a running, publicly reachable site.

```bash
./scripts/deploy.sh          # provision + configure + deploy
```

---

## Architecture

```
                      Internet
                         │  :80
                    ┌────▼─────┐
                    │  nginx   │   sole public listener
                    └────┬─────┘
          ┌──────────────┼───────────────┐
          │ /            │ /api  /uploads
          │ /_next       │ /socket.io
    ┌─────▼─────┐  ┌─────▼──────┐
    │ Next.js   │  │  Express   │
    │  :3000    │  │   :5000    │
    └───────────┘  └─────┬──────┘
                         │
                   ┌─────▼──────┐
                   │  MongoDB   │
                   │  (Atlas)   │
                   └────────────┘

Uploads are written to local disk under {{ app_root }}/current/uploads,
which is the application's own default behaviour.
```

Both Node processes bind to **loopback only**. Ports 3000 and 5000 are never
opened in the security group — everything public arrives through nginx.

### Release layout on the host

```
/opt/idlex/
├── releases/
│   ├── 20260821T120000/      ← previous
│   └── 20260821T143000/      ← new
├── shared/
│   └── .env                  ← secrets; survive every release
└── current -> releases/20260821T143000
```

Deploys build a new release directory, then flip `current` in a single atomic
symlink swap. Rollback is that swap in reverse — no rebuild, no fetch, seconds.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Python 3.10+ | Control node only |
| `ansible-core >= 2.16` | `pip install ansible-core` |
| `boto3`, `botocore` | Required by `amazon.aws` and the dynamic inventory |
| Collections | `ansible-galaxy install -r requirements.yml` |
| AWS credentials | IAM user/role able to manage EC2 (no S3 or IAM needed) |
| EC2 keypair | Named in `ec2_key_name`, private key at `ec2_ssh_private_key` |
| MongoDB Atlas cluster | Connection string supplied as a secret |
| ssh-agent | Loaded with a key that can read the GitHub repo |

```bash
pip install "ansible-core>=2.16" boto3 botocore
ansible-galaxy install -r requirements.yml
```

---

## Secrets

**Nothing secret is committed to this repository.** Values arrive as
environment variables on the control node and are rendered into
`/opt/idlex/shared/.env` (mode `0600`) on the instance.

| Variable | Required | Purpose |
|---|:--:|---|
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | ✅ | Provisioning + inventory |
| `IDLEX_MONGO_URI` | ✅ | Atlas connection string |
| `IDLEX_JWT_ACCESS_SECRET` | ✅ | Access token signing |
| `IDLEX_JWT_REFRESH_SECRET` | ✅ | Refresh token signing |
| `IDLEX_CLIENT_URL` | — | Public url; also the CORS origin |
| `IDLEX_RENFLAIR_API_KEY` | — | SMS OTP. Unset ⇒ OTPs go to the journal |
| `IDLEX_SMTP_*` | — | Email. Unset ⇒ email disabled |
| `IDLEX_RAZORPAY_*` | — | Payments. Unset ⇒ payment routes fail |

Generate JWT secrets with:

```bash
export IDLEX_JWT_ACCESS_SECRET=$(openssl rand -hex 48)
export IDLEX_JWT_REFRESH_SECRET=$(openssl rand -hex 48)
```

> **`IDLEX_MONGO_URI` must be non-empty.** An empty value is *falsy* in
> `src/config/env.js`, so the app silently falls back to
> `mongodb://127.0.0.1:27017/idlex` and then hangs ~30s in mongoose server
> selection printing nothing at all. The playbook asserts on this up front so
> the failure is a clear message rather than a mystery hang.

### Repository access

The private repo is cloned **on the instance**, with two auth paths and no
deploy key in either.

**From CI**: the workflow passes the automatic `GITHUB_TOKEN`, and the clone
runs over HTTPS. That token is scoped to this repository and expires when the
job ends, so there is nothing to store, rotate, or revoke — and no repository
credential is left on the server. Because `ansible.builtin.git` writes the
clone URL into `.git/config`, the playbook resets the remote afterwards;
otherwise the token would persist in every retained release directory.

**Locally**: authentication uses a forwarded ssh-agent.

```bash
eval "$(ssh-agent)" && ssh-add ~/.ssh/id_ed25519
```

---

## Variables

Defaults live in `inventory/group_vars/all.yml`. Override any of them with
`-e name=value`.

| Variable | Default | Why |
|---|---|---|
| `ec2_instance_type` | `t3.small` | **Floor, not preference** — see below |
| `ec2_volume_size` | `20` | 8 GB fills once `node_modules` + `.next` land |
| `aws_region` | `eu-north-1` | Keep the app near its database |
| `nodejs_major` | `22` | AL2023 ships Node 20, EOL April 2026 |
| `swapfile_size_mb` | `2048` | Absorbs the build's memory spike |
| `keep_releases` | `5` | Rollback targets retained on disk |
| `app_branch` | `main` | Branch to deploy |
| `env_name` | `prod` | Also `tag:Env`, so one inventory serves many envs |

### On instance sizing

`next build` peaks at roughly **969 MB RSS**. On a 1 GB `t3.micro` the OOM
killer intervenes — and it does not politely kill just the build. During the
manual rollout it took `sshd` with it, locking the box out entirely and
requiring a console reboot.

`t3.small` (2 GB) is therefore the practical minimum. The swapfile helps, but
EBS-backed swap is slow enough that it is insurance, not headroom.

To keep `t3.micro`, build elsewhere and ship artifacts rather than building on
the instance.

---

## Usage

```bash
./scripts/deploy.sh              # full pipeline: provision → configure → deploy
./scripts/deploy.sh provision    # infrastructure only
./scripts/deploy.sh configure    # OS, Node, nginx, systemd
./scripts/deploy.sh deploy       # ship a release
./scripts/deploy.sh rollback     # back to the previous release
./scripts/deploy.sh check        # dry run; changes nothing
```

Deploy a specific branch:

```bash
./scripts/deploy.sh deploy -e app_branch=hotfix/payment-fix
```

Roll back to a specific release:

```bash
./scripts/deploy.sh rollback --tags list        # show what is available
./scripts/deploy.sh rollback -e target=20260821120000
```

Lock SSH to your own address instead of the world:

```bash
./scripts/deploy.sh provision -e ssh_cidr=203.0.113.4/32
```

---

## SSH access

Public IPs are not stable: stopping and starting an instance releases the
address unless an Elastic IP is attached. `scripts/ssh.sh` therefore resolves
the current address from EC2 tags instead of a hardcoded config entry.

```bash
./scripts/ssh.sh                  # prod host
./scripts/ssh.sh dev              # dev host
./scripts/ssh.sh prod 'uptime'    # run a command and exit
./scripts/ssh.sh prod --ip        # print the ip only
```

It reads the key path, user and region from `group_vars/all.yml`, so the
script and the playbooks cannot disagree about which key to use.

For a permanent shortcut, add the resolved address to `~/.ssh/config`:

```
Host idlex-prod
    HostName <ip from ./scripts/ssh.sh prod --ip>
    User ec2-user
    IdentityFile ~/.ssh/idlex-dev.pem
    IdentitiesOnly yes
```

That entry needs updating after any stop/start. An Elastic IP costs nothing
while attached and removes the problem — worth doing before handover.

### Key pair configuration

`provision.yml` launches the instance with the key pair named in
`ec2_key_name` (default `idlex-deploy`). Two things must line up, or you will
provision a host you cannot log into:

1. A key pair with that **exact name** must already exist in the target
   account and region — Ansible does not create it.
2. `ec2_ssh_private_key` must point at the matching private key locally.

To use an existing key pair instead:

```bash
./scripts/deploy.sh provision \
  -e ec2_key_name=<name-in-aws> \
  -e ec2_ssh_private_key=~/.ssh/<matching>.pem
```

To create a fresh one:

```bash
aws ec2 create-key-pair --region eu-north-1 --key-name idlex-deploy \
  --query KeyMaterial --output text > ~/.ssh/idlex-deploy.pem
chmod 400 ~/.ssh/idlex-deploy.pem
```

> There is no recovery path if the private key is lost — AWS does not store
> it. SSM Session Manager is the fallback: the instance role enables it, so
> `aws ssm start-session --target <instance-id>` gets you a shell without SSH.

---

## What each playbook does

| Playbook | Responsibility |
|---|---|
| `provision.yml` | Security group and EC2 instance from the latest AL2023 AMI |
| `configure.yml` | Base packages, swap, Node 22, nginx, systemd units, `shared/.env` |
| `deploy.yml` | Clone → `npm ci` → build → atomic symlink swap → health check → prune |
| `rollback.yml` | Symlink swap to a previous release + restart + verify |
| `site.yml` | Chains the first three — the acceptance-criteria single command |

All are idempotent. Re-running `configure.yml` is the way to bring a drifted
host back to the known-good state.

---

## Automatic rollback

`deploy.yml` wraps its smoke test in a `block`/`rescue`. If `/health` or `/`
fails to return 200 after the cutover, the playbook restores the previous
symlink, restarts both services, and *then* fails the run.

A failed deploy leaves the site serving the last good release. The CI job
surfaces this in its summary rather than leaving you to guess.

---

## CI/CD

`.github/workflows/deploy.yml`:

- **push to `main`** → deploy automatically (documentation-only changes skipped)
- **manual dispatch** → choose `deploy` / `rollback` / `provision` / `check`
- `concurrency` serialises deploys so two pushes cannot race over `current`
- gated on the `production` GitHub Environment, so approvals can be required

Configure under **Settings → Environments → production**.

#### Required secrets — the deploy fails without these

| Secret | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | Deployer key id (see `docs/aws-credentials.md`) |
| `AWS_SECRET_ACCESS_KEY` | Deployer secret |
| `EC2_SSH_PRIVATE_KEY` | Full contents of the `.pem` matching `ec2_key_name`, including the BEGIN/END lines |
| `MONGO_URI` | Atlas SRV string, **with a database name**: `mongodb+srv://…/idlex?retryWrites=true&w=majority` |
| `JWT_ACCESS_SECRET` | `openssl rand -hex 48` |
| `JWT_REFRESH_SECRET` | `openssl rand -hex 48` — a different value |
| `ADMIN_EMAIL` | Sole administrator's address |
| `ADMIN_PASSWORD` | That account's password |

#### Optional secrets — the app runs without them, but the feature does not

| Secret | Unset behaviour |
|---|---|
| `RENFLAIR_API_KEY` | SMS OTPs are written to the journal instead of sent |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Email OTPs are logged instead of sent |
| `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY` | Checkout falls back to dev mode and takes no real money |

#### Variables (not secrets)

| Variable | Example |
|---|---|
| `AWS_REGION` | `eu-north-1` |
| `CLIENT_URL` | `https://idlex.in` — also the CORS and socket.io origin |
| `SMTP_PORT` | `587` |
| `SMTP_SECURE` | `false` |

> `SMTP_PORT` and `SMTP_SECURE` must agree. **587 is STARTTLS and needs
> `SMTP_SECURE=false`**; only 465 is implicit TLS and takes `true`. Setting
> 587 with `true` makes nodemailer attempt a handshake the server is not
> expecting, and the connection hangs rather than failing cleanly.

> `ADMIN_EMAIL` and `ADMIN_PASSWORD` are applied on every boot: the app sets
> that account's password to match, and demotes and deactivates any other
> account holding the admin role. Changing the secret and redeploying is
> therefore the supported way to rotate the administrator credential.

> Cashfree PG signs webhooks with the **secret key itself** — there is no
> separate webhook secret in its dashboard, unlike Razorpay.
> `CASHFREE_WEBHOOK_SECRET` therefore defaults to `CASHFREE_SECRET_KEY` and
> only needs setting if Cashfree ever issues a distinct one.

> `MONGO_URI` must name a database. Atlas copies a connection string ending
> `/?appName=…`, and Mongoose silently writes to `test` if the path is empty.

---

## Database

IdleX uses **MongoDB via Mongoose**. That constrains the options more than it
might appear:

| Option | Works | ~Cost/mo | Notes |
|---|:--:|---|---|
| MongoDB Atlas M0 | ✅ | $0 | Runs on AWS; the current choice |
| Atlas M10 | ✅ | ~$60 | Dedicated, supports VPC peering |
| Self-hosted MongoDB on EC2 | ✅ | ~$15 | Full MongoDB; backups and patching are yours |
| Amazon DocumentDB | ❌ | ~$60+ | See below |
| Amazon RDS | ❌ | — | Relational; would require rewriting the data layer |
| DynamoDB | ❌ | — | Different data model; full rewrite |

### Why not DocumentDB

DocumentDB is MongoDB-*compatible*, not MongoDB. It does not implement text
indexes or the `$text` operator, and IdleX depends on both:

- `idlex-backend/src/models/Listing.js` declares `index({ title: 'text', description: 'text' })`
- `idlex-backend/src/modules/listings/listings.service.js` queries it with `$text: { $search: q }`

That is the listing search — the primary browse path of the marketplace. It
would fail on DocumentDB from the first query. Migrating would mean replacing
the search implementation (OpenSearch, Atlas Search, or regex matching with
its own performance characteristics), which is an application change, not a
deployment one.

### Why not RDS

RDS hosts relational engines — Postgres, MySQL, MariaDB, Oracle, SQL Server.
There is no MongoDB option. Every model, query and schema in the backend would
have to be rewritten against SQL.

### On "keeping everything in AWS"

Atlas already runs on AWS infrastructure, so this is largely a billing and
contractual boundary rather than a technical one. If the client requires the
database inside their own account, self-hosted MongoDB on EC2 is the honest
answer, and the Ansible roles can be extended to provision it — ask and it can
be added.

---

## AWS credentials

See [`docs/aws-credentials.md`](docs/aws-credentials.md) for three ways to
obtain credentials for the client's account, and
[`docs/iam-bootstrap-policy.json`](docs/iam-bootstrap-policy.json) for the
least-privilege policy the deployer needs.

Short version: prefer **GitHub OIDC** for CI (no stored credentials at all)
and a **cross-account role with an ExternalId** for local runs. Long-lived
access keys are the fallback, not the default.

The deployer needs **EC2 permissions only**. Provisioning creates no S3
buckets and no IAM roles, so no S3 or IAM permissions are required — which
also means a tightly scoped developer key is usually sufficient as-is.

---

---

## Teardown

The playbooks provision infrastructure but do not destroy it. Removing an
environment is deliberate and manual:

```bash
# Terminate the instance (the root volume has DeleteOnTermination=true)
aws ec2 terminate-instances --region eu-north-1 --instance-ids <i-...>

# Release the Elastic IP — an UNATTACHED EIP is the one case AWS bills extra
# for, so leaving it allocated after terminating costs ~$3.60/month for nothing
aws ec2 release-address --region eu-north-1 --allocation-id <eipalloc-...>

# Delete the security group once no instance references it
aws ec2 delete-security-group --region eu-north-1 --group-id <sg-...>
```

> The deploying identity needs `ec2:TerminateInstances` and
> `ec2:DeleteSecurityGroup` for any of this. A policy that grants creates but
> not deletes leaves retired instances and orphaned security groups
> accumulating, each still billing.
> `docs/iam-bootstrap-policy.json` includes both, with terminate tag-scoped to
> `Project=idlex` so it cannot reach unrelated workloads.

Before terminating, confirm nothing on the instance exists only there:

```bash
ssh <host> 'cd /opt/idlex/current && git status --porcelain'   # uncommitted work
ssh <host> 'find /opt/idlex/current/uploads -type f'           # user uploads
```

Uploads live on local disk, so **they do not survive termination** and are not
recovered by re-provisioning. Copy them off first if they matter.

---

## Troubleshooting

**`/api` returns 502** — the backend is not running.
```bash
sudo systemctl status idlex-backend
journalctl -u idlex-backend -n 100 --no-pager
```
Most often an empty or wrong `MONGO_URI`, or the Atlas IP allowlist not
including the instance's public IP.

**The instance became unreachable during a deploy** — almost certainly an OOM
kill. Check `ec2_instance_type` and confirm swap is active (`free -h`). Reboot
from the console, or use SSM Session Manager, which the IAM role enables.

**`nginx -t` fails after a template change** — the `validate:` clause means the
bad config was never installed; nginx is still serving the previous one. Fix
the template and re-run.

**Uploads missing after replacing an instance** — uploads live on the
instance's local disk, so they do not survive instance replacement and are
not shared between instances. Moving them to object storage is an
application change (the upload middleware and the stored url shape), not a
deployment setting.

**Public IP changed** — stop/start releases the address unless an Elastic IP
is attached. The dynamic inventory finds the new one automatically, but
`CLIENT_URL` must be updated or CORS and socket.io will reject requests.

---

## Known issues

`multer@1.x` is deprecated and carries published advisories; the maintainers
recommend 2.x. It is left at the pinned version here because upgrading is an
application change with its own testing burden, outside the scope of the
deployment work. It is worth scheduling.
