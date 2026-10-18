# Deploying Flux to one VPS

> **Status:** written, not yet run end to end. Remove this line after the first real deploy.

Target: a 4 GB / 2 vCPU Ubuntu box, one domain, Caddy for HTTPS. Only Caddy is public (ports 80 and 443). Postgres, Valkey, RabbitMQ, Jaeger and every service stay on the private Docker network. Jaeger and the RabbitMQ UI are reachable only through an SSH tunnel.

## Already in the repo

- `docker-compose.prod.yml`, `Caddyfile` and `.env.production.example` at the repo root.
- A `.dockerignore` in every service folder (`node_modules`, `dist`, `.env`, `.env.*`, `coverage`), so images carry no secrets.
- A RabbitMQ healthcheck that waits for the AMQP listener, so services do not crash on startup.
- `app.set("trust proxy", 1)` in the Gateway, so rate limiting sees the real client IP behind Caddy.
- `app.disable("x-powered-by")` in the Gateway, so responses do not advertise Express.
- A demo seed in `scripts/seed/` (8 products, stock, one warehouse, 5 drivers).

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

Postgres only runs `init-databases.sh` on an empty volume, which a fresh server has, so the per-service databases are created on the first start. The services do **not** create their own tables, so the migrations below are required before anything works.

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

Wait about 10 seconds before the first health check. Docker reports a container as started before Node is listening, so an immediate request can return `Empty reply from server`.

## 4. Seed the data

A fresh database has no products, warehouses, drivers or admin user, so the saga has nothing to run on.

**Demo data.** The repo ships a seed in `scripts/seed/` (8 products, stock, one warehouse, 5 drivers). Run it after the migrations:

```bash
for p in catalog inventory delivery; do
  dc exec -T postgres psql -1 -v ON_ERROR_STOP=1 -U admin -d ${p}_db < scripts/seed/$p.sql
done
```

Each file runs as one transaction and stops on the first error. The seed deletes any product, stock row or driver that is not in its list, so use it on a demo server only. It is safe to rerun, and rerunning resets stock and drivers.

**Admin user.** Create it by hand: sign up through `POST /api/auth/signup`, promote it, then log in again so the token carries the role:

```bash
dc exec postgres psql -U admin -d gateway_db -c "UPDATE users SET role = 'admin' WHERE email = '<admin email>';"
```

It should print `UPDATE 1`. `UPDATE 0` means the email did not match.

**Never run `npm test` against the server's databases.** The suites write test products, drivers and users into the same databases the demo uses. If it happens, rerun the seed.

## 5. Verify, the way you did locally

Use `https://<DOMAIN>` in Postman. The warehouse ID in the seed is `6193882b-fab5-4cde-9c0d-dd87b335c56e`.

1. `GET /health` returns `{"status":"ok","checks":{"database":"ok"}}`, and the response has no `X-Powered-By` header.
2. Sign up, log in, add to the cart, place an order, and watch the logs: `dc logs -f order inventory payment delivery notification`. The order should go from `PENDING` to `CONFIRMED` with a `paymentId`. About 1 in 10 payments fail by design.
3. **Ownership check.** Sign up a second user and send `GET /orders/<first user's order id>` with the second user's token. It must return 404 ("Order not found"), and 200 with the first user's token.
4. **Role check.** `POST /catalog/products` returns 401 with no token, 403 for a regular user, and 201 for the admin. `GET /catalog/products` returns 200 for any logged-in user.
5. Check the trace and the data from the server:

```bash
# from your machine, tunnel to Jaeger and the RabbitMQ UI
ssh -L 16686:localhost:16686 -L 15672:localhost:15672 deploy@<ip>
# then open http://localhost:16686 and http://localhost:15672
dc exec postgres psql -P pager=off -U admin -d order_db -c "SELECT status FROM orders ORDER BY created_at DESC LIMIT 5;"
```

6. Live tracking: connect the Socket.IO client to `https://<DOMAIN>` (not port 4005). The path `/socket.io` goes to Delivery through Caddy.
7. **Rate limiter and client IP.** Send 12 bad logins in a row. You should get ten 401s, then 429s. Check that the limiter keys on your real IP and not Caddy's: `dc exec valkey valkey-cli --scan --pattern 'ratelimit:*'` should show your IP, not a Docker address.
8. From outside, confirm nothing else is reachable: ports 5432, 5672, 6379, 4001 to 4005, 15672 and 16686 must all be closed to the internet.

## 6. Updating later

```bash
git pull && dc build <service> && dc up -d <service>
```

If a rebuilt container is not replaced, run `dc down` and then `dc up -d`. A schema change also needs `dc run --rm <service> npx drizzle-kit migrate`.