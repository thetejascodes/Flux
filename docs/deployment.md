# Deploying Flux to one VPS

> **Status:** written, not yet run end to end. Remove this line after the first real deploy.

Target: a 4 GB / 2 vCPU Ubuntu box, one domain, Caddy for HTTPS. Only Caddy is public (ports 80 and 443). Postgres, Valkey, RabbitMQ, Jaeger and every service stay on the private Docker network. Jaeger and the RabbitMQ UI are reachable only through an SSH tunnel.

## Already in the repo

- `docker-compose.prod.yml`, `Caddyfile` and `.env.production.example` at the repo root.
- A `.dockerignore` in every service folder (`node_modules`, `dist`, `.env`, `.env.*`, `coverage`), so images carry no secrets.
- A RabbitMQ healthcheck that waits for the AMQP listener, so services do not crash on startup.
- `app.set("trust proxy", 1)` in the Gateway, so rate limiting sees the real client IP behind Caddy.

## 1. Server setup

```bash
# as root on a fresh Ubuntu box
adduser deploy && usermod -aG sudo deploy
# add your SSH key for "deploy", then disable root login and password login

# firewall: SSH, HTTP, HTTPS only
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable

# 2 GB swap as insurance against OOM kills during builds
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Docker from Docker's own apt repo (the Ubuntu package is too old for !reset)
# follow https://docs.docker.com/engine/install/ubuntu/ then:
usermod -aG docker deploy
docker compose version   # must be v2.24.4 or newer
```

Point your domain's A record at the server's IP and wait for DNS to resolve (`nslookup flux.yourdomain.com`). Caddy cannot get a certificate until it does.

## 2. Get the code and the secrets onto the server

```bash
git clone https://github.com/thetejascodes/Flux.git && cd Flux
```

The `.env.docker` files are gitignored, so copy them from your machine:

```powershell
# from your machine, one per service
scp services/gateway/.env.docker deploy@<ip>:~/Flux/services/gateway/.env.docker
# ...repeat for catalog, inventory, order, payment, delivery, notification
```

On the server, create `.env` from the template and fill in real values (generate each secret with `openssl rand -hex 16`; use hex because these end up inside URLs):

```bash
cp .env.production.example .env
nano .env
```

Make the per-service files match. The Postgres password is inside every `DATABASE_URL`, and RabbitMQ needs its new user and password added to every `RABBITMQ_URL`, which has no credentials today. Without this step the services cannot connect, because the default `guest` user no longer exists once `RABBITMQ_DEFAULT_USER` is set:

```bash
export PGPASS=<POSTGRES_PASSWORD>  RMQUSER=<RABBITMQ_USER>  RMQPASS=<RABBITMQ_PASSWORD>

# Postgres: replace whatever password follows "admin:" in every DATABASE_URL
sed -i -E "s#(postgres://admin:)[^@]*@#\1${PGPASS}@#" services/*/.env.docker

# RabbitMQ: add the credentials to every amqp://rabbitmq:5672
sed -i "s#amqp://rabbitmq:5672#amqp://${RMQUSER}:${RMQPASS}@rabbitmq:5672#" services/*/.env.docker

# check, with passwords masked
grep -h "^DATABASE_URL\|^RABBITMQ_URL" services/*/.env.docker | sed -E 's#://([^:]+):[^@]+@#://\1:****@#'
```

**Gateway JWT keys.** Generate a fresh production pair and append it to Gateway's `.env.docker`. Never reuse your development keys:

```bash
openssl genrsa -out jwt_private.pem 2048
openssl rsa -in jwt_private.pem -pubout -out jwt_public.pem
echo "JWT_PRIVATE_KEY=$(base64 -w0 jwt_private.pem)" >> services/gateway/.env.docker
echo "JWT_PUBLIC_KEY=$(base64 -w0 jwt_public.pem)"   >> services/gateway/.env.docker
shred -u jwt_private.pem jwt_public.pem
```

If `services/gateway/.env.docker` already contains `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` lines from development, delete those two lines first.

**Production values to set in the per-service files:**

- `services/order/.env.docker`: set `CART_ABANDON_MINUTES=30` and `CART_SWEEP_INTERVAL_MS=60000`, or delete both lines so the defaults apply. The development values (1 minute and 10 seconds) would send cart reminders a minute after an item is added.
- `services/gateway/.env.docker`: `OTP_STUB_MODE=true`, so a public demo cannot trigger real SMS sends. Google login stays off unless you set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and a `GOOGLE_REDIRECT_URI` on your domain.
- Notification defaults to stub mode, so it needs no change.

## 3. Start the infrastructure and run the migrations

Postgres only runs `init-databases.sh` on an empty volume, which a fresh server has, so the per-service databases are created on the first start.

```bash
alias dc="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
dc up -d postgres valkey rabbitmq jaeger
dc build            # first build takes a few minutes
```

Apply each service's committed Drizzle migrations. Check the script name in each `package.json` first. If none exists, `npx drizzle-kit migrate` works because the image keeps dev dependencies:

```bash
for s in gateway catalog inventory order payment delivery notification; do
  dc run --rm $s npx drizzle-kit migrate
done
```

Then start everything:

```bash
dc up -d
dc ps
dc logs -f --tail 30 gateway order
```

## 4. Seed the data

A fresh database has no products, warehouses, drivers or admin user, so the saga has nothing to run on. You need at least: one admin user (sign up, then promote it with `UPDATE users SET role='admin' WHERE email='...'` through `dc exec postgres psql -U admin -d gateway_db`), a few products, stock for them at a warehouse, and a few drivers near that warehouse. A seed script is worth writing once so this is repeatable.

## 5. Verify, the way you did locally

Use `https://<DOMAIN>` in Postman:

1. `GET /health` returns `ok`.
2. Sign up, log in, add to the cart, place an order, and watch the logs: `dc logs -f order inventory payment delivery notification`.
3. Check the trace and the data from the server:
```bash
   # from your machine, tunnel to Jaeger and the RabbitMQ UI
   ssh -L 16686:localhost:16686 -L 15672:localhost:15672 deploy@<ip>
   # then open http://localhost:16686 and http://localhost:15672
   dc exec postgres psql -P pager=off -U admin -d order_db -c "SELECT status FROM orders ORDER BY created_at DESC LIMIT 5;"
```
4. Live tracking: connect the Socket.IO client to `https://<DOMAIN>` (not port 4005). The path `/socket.io` goes to Delivery through Caddy.
5. From outside, confirm nothing else is reachable: ports 5432, 5672, 6379, 4001 to 4005, 15672 and 16686 must all be closed to the internet.

## 6. Updating later

```bash
git pull && dc build <service> && dc up -d <service>
```
