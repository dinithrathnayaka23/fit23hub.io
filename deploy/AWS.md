# Deploying FIT23Hub: AWS backend, Vercel frontend

```
                         Phase 1 (no domain yet)
 Browser ──HTTPS──▶ fit23hub.vercel.app ──/api, /uploads──▶ <ip>.sslip.io (EC2)
                    (Next.js on Vercel)     Vercel rewrite     Caddy ─▶ API container
                                                                          │     │
                                                              RDS Postgres ◀┘     └▶ S3 bucket

                         Phase 2 (own domain)
 Browser ──HTTPS──▶ yourdomain.com        (Vercel)
         ──HTTPS──▶ api.yourdomain.com    (EC2: Caddy ─▶ API ─▶ RDS / S3)
```

**Why Phase 1 goes through Vercel.** The session lives in an httpOnly cookie, and the page reads a
second cookie to prove each request came from the site (CSRF protection). If the page is on
`vercel.app` and the API on some AWS address, those are two different sites: the page cannot read
the API's cookie, and Safari (every iPhone) refuses the cookies altogether. Sending `/api` through
Vercel makes the API look like part of the site, so both work. Once you own a domain,
`yourdomain.com` and `api.yourdomain.com` count as the same site and the browser can talk to the
API directly.

Region: **ap-south-1 (Mumbai)** is the closest AWS region to Sri Lanka. Use it for everything.

---

## 0. Account safety (10 minutes, do not skip)

1. Turn on MFA for the root user, then create an IAM user with `AdministratorAccess` and work as
   that user from now on.
2. **Billing → Budgets → Create budget**: a monthly cost budget of $20–30 with an email alert at
   80%. This is what stops a mistake turning into a large bill.

## 1. S3 bucket for uploads

1. **S3 → Create bucket**: name `fit23hub-uploads` (names are global, so add a suffix if taken),
   region ap-south-1.
2. **Block Public Access**: untick *only* the two "…through new/any public bucket policies" boxes.
   Leave the ACL boxes ticked.
3. After creating it, open **Permissions → Bucket policy** and paste in the policy below, with your
   bucket name in place of `fit23hub-uploads`:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Sid": "PublicReadUploads",
       "Effect": "Allow",
       "Principal": "*",
       "Action": "s3:GetObject",
       "Resource": "arn:aws:s3:::fit23hub-uploads/*"
     }]
   }
   ```

   Files get long random names, which matches how uploads were served before: anyone with a link
   can download, but nobody can list or guess them.

## 2. IAM role for the server

The API writes to S3 through a role attached to the EC2 server, so no AWS keys ever go into `.env`.

1. **IAM → Roles → Create role** → trusted entity *AWS service*, use case *EC2*.
2. Skip the managed policies and create the role as `fit23hub-api`. Then open it and choose
   **Add permissions → Create inline policy → JSON**:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:AbortMultipartUpload"],
       "Resource": "arn:aws:s3:::fit23hub-uploads/*"
     }]
   }
   ```

## 3. Security groups

**EC2 → Security Groups → Create**:

| Name | Inbound rules |
|---|---|
| `fit23hub-api` | HTTP 80 and HTTPS 443 from `0.0.0.0/0`; SSH 22 from **My IP** only |
| `fit23hub-db` | PostgreSQL 5432 from the security group `fit23hub-api` (not from an IP) |

The database is only reachable from the API server, never from the internet.

## 4. RDS PostgreSQL

**RDS → Create database**:

- Standard create → PostgreSQL 16 → template **Free tier** (or *Dev/Test*).
- Instance: `db.t4g.micro`. Storage: 20 GB gp3, autoscaling on.
- Master username `fit23hub`, and a strong password you store somewhere safe.
- Connectivity: **Public access: No**, VPC security group `fit23hub-db` (remove `default`).
- Additional configuration → initial database name `fit23hub`. Automated backups: 7 days.

When it is available, copy the **endpoint**. The connection string is:

```
postgresql://fit23hub:PASSWORD@<endpoint>:5432/fit23hub?sslmode=require
```

URL-encode any special characters in the password (`@` → `%40`, `#` → `%23`, and so on).

## 5. EC2 server

**EC2 → Launch instance**:

- AMI: **Ubuntu Server 24.04 LTS, 64-bit (Arm)**.
- Type: **t4g.small** (2 vCPU, 2 GB). ARM is about 20% cheaper than the equivalent Intel instance,
  and the image builds fine on it.
- Key pair: create one and keep the `.pem` file.
- Network: security group `fit23hub-api`.
- Storage: **30 GB gp3**. Uploads pass through the disk on their way to S3, and recordings can be
  3 GB.
- Advanced details → IAM instance profile: `fit23hub-api`.

Then **Elastic IPs → Allocate → Associate** it with the instance, so the address survives
restarts. Its dashed form is your API hostname for Phase 1: `13.201.45.67` →
`13-201-45-67.sslip.io`. That name resolves to your IP, and it lets the server get a real HTTPS
certificate before you own a domain.

## 6. Install and start the API

```bash
ssh -i fit23hub.pem ubuntu@<elastic-ip>

# 2 GB of swap, so npm and the build never run out of memory
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu && exit       # log out and back in for the group to apply
```

```bash
ssh -i fit23hub.pem ubuntu@<elastic-ip>
git clone https://github.com/dinithrathnayaka23/fit23hub.io.git
cd fit23hub.io/deploy
cp .env.production.example .env.production
nano .env.production                          # fill in every value; see the comments
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f api
```

If the repository is private, clone it with a GitHub fine-grained personal access token (read-only,
this repository only) as the password.

On first start, the API creates the database tables and the super admin account. Check it:

```
https://13-201-45-67.sslip.io/api/health   →   {"ok":true,"service":"fit23hub-backend"}
```

The first request can take a few seconds while Caddy obtains the certificate.

**Mail.** Production refuses to start sign-up flows without SMTP. The quickest working option is a
Gmail account with 2-step verification and an **app password** (`SMTP_USER` = the address,
`SMTP_PASS` = the 16-character app password). It allows about 500 emails a day, which is enough for
400 students to verify.

## 7. Frontend on Vercel

1. **vercel.com → Add New → Project** → import the GitHub repository.
2. **Root Directory: `frontend`**. The framework is detected as Next.js.
3. Environment variables:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `/api` |
   | `API_PROXY_TARGET` | `https://13-201-45-67.sslip.io` |
   | `NEXT_PUBLIC_SITE_URL` | `https://<project>.vercel.app` |

4. Deploy, then note the production URL (for example `https://fit23hub.vercel.app`).
5. Back on the server, set `APP_URL` and `CORS_ORIGIN` in `.env.production` to that exact URL and
   restart (`docker compose … up -d`). `APP_URL` is where the links in verification and reset
   emails point.

**Phase 1 limits:**
- Only the production URL is allowed through CORS. Preview deployments (the random per-commit
  URLs) will load, but saving anything will fail there.
- Vercel caps the size of request bodies it forwards. Small uploads (avatars, notes) work, but
  large material and recording uploads may be rejected until Phase 2, when uploads go straight to
  `api.yourdomain.com`.
- Every signed-out request reaches the API from Vercel's addresses, so the per-IP ceiling for
  sign-in is shared. The per-account limit still stops password guessing.

## 8. Updating

```bash
cd ~/fit23hub.io && git pull
cd deploy && docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Schema changes are applied on start. If a change would drop data, the API refuses to start and says
why in the logs, rather than deleting anything. Vercel redeploys the frontend on every push by
itself.

---

## Phase 2: your own domain

Any registrar works. Cloudflare Registrar and Porkbun sell at cost, with no renewal markup.

**DNS records** (at your registrar or DNS host):

| Name | Type | Value |
|---|---|---|
| `@` and `www` | as shown in **Vercel → Project → Settings → Domains** | (Vercel gives the values) |
| `api` | A | your Elastic IP |

**Server** (`deploy/.env.production`), then run `docker compose … up -d`:

```
API_DOMAIN=api.yourdomain.com
APP_URL=https://yourdomain.com
CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com
COOKIE_DOMAIN=.yourdomain.com
```

**Vercel** (then **Redeploy**, because `NEXT_PUBLIC_*` values are built into the pages):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.yourdomain.com/api` |
| `API_PROXY_TARGET` | *(delete it)* |
| `NEXT_PUBLIC_SITE_URL` | `https://yourdomain.com` |

Everyone signs in once more after the switch, because their old cookies belong to `vercel.app`.

With a domain you can also:
- move mail to **Amazon SES**, verifying the domain so mail comes from `no-reply@yourdomain.com`;
- put **CloudFront** in front of the bucket (next section).

## Costs, and the one to watch

Rough monthly figures for ap-south-1:

| Item | Approx. |
|---|---|
| EC2 t4g.small + 30 GB disk | ~$15 |
| Public IPv4 address (AWS charges for every one) | ~$3.60 |
| RDS db.t4g.micro + 20 GB | ~$15 |
| S3 storage | cents per GB |

New accounts get free-tier allowances or credits, so check **Billing → Free tier** on yours.

**Data leaving AWS is the cost to watch.** Every time a student watches a 1 GB recording straight
from S3, AWS bills about $0.11. That is roughly $45 if all 400 students watch it once. CloudFront's
always-free tier includes 1 TB of transfer a month, so once recordings go up:

1. **CloudFront → Create distribution**: origin = the bucket. Use **Origin access control** and let
   it update the bucket policy.
2. Set `S3_PUBLIC_URL=https://dxxxxxxxx.cloudfront.net` on the server and restart. New uploads
   then get CloudFront links.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Can't reach database server` in the API logs | The `fit23hub-db` security group does not allow `fit23hub-api`, or the RDS endpoint in `DATABASE_URL` is wrong |
| `Storage upload failed` / `AccessDenied` | The IAM role is not attached to the instance, or the bucket name in its policy is wrong |
| Health check works but sign-in fails on Vercel | `CORS_ORIGIN` does not exactly match the Vercel URL (scheme included, no trailing slash) |
| "Your session could not be verified" | `NEXT_PUBLIC_API_URL` was not `/api` when Vercel built. Change it, then redeploy |
| Certificate errors from Caddy | Ports 80/443 closed in the security group, or `API_DOMAIN` does not resolve to the Elastic IP |
