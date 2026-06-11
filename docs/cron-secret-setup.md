# CRON_SECRET — what it is and how to set it

## What it is

`CRON_SECRET` is a random string that protects the nightly account-deletion worker at `/api/cron/hard-delete-accounts`. The worker is what actually purges accounts whose 30-day soft-delete window has elapsed. Without the secret, anyone who knew the URL could hit it and trigger the worker on demand. With the secret, only callers who present the right value (Vercel's cron service, or you on the command line) can run it.

## A value generated for you

A cryptographically random secret has been generated for you. **Use it once, then rotate.** Treat it like a password.

```
CdFnCEJaSXmmg1aK2HSm913mGGqa0YId6Hefwy1A4xI08ufOvNNPu5FiJyDLYh3Y
```

If you want to generate your own, any of these works:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
openssl rand -base64 48 | tr -d '\n+/' | cut -c1-64
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Where to put it

You need to set the same value in two places.

### 1. Your local `.env.local` (for local testing only)

Open (or create) `.env.local` at the project root and add:

```
CRON_SECRET=CdFnCEJaSXmmg1aK2HSm913mGGqa0YId6Hefwy1A4xI08ufOvNNPu5FiJyDLYh3Y
```

`.env.local` is gitignored by default in Next.js projects — confirm it does **not** show up in `git status` before committing anything.

### 2. Vercel project environment variables (this is what actually matters)

1. Go to https://vercel.com/dashboard → the `resolution-nation` project (whatever you named it).
2. Settings → Environment Variables.
3. Click "Add New."
4. Name: `CRON_SECRET`
5. Value: paste the secret.
6. Environment: select **Production** (you can also add Preview if you want preview deployments to be able to test it, but it's not required).
7. Click Save.
8. **Redeploy** the project after saving — env vars only take effect on new deployments. Either push a commit or hit "Redeploy" on the latest deployment.

That's it. From the next deployment forward, Vercel's cron service will include `Authorization: Bearer <CRON_SECRET>` automatically when it hits the route, and the worker will accept it.

## How to test it

Once deployed with the env var set, you can manually trigger the worker:

```bash
curl -H "Authorization: Bearer CdFnCEJaSXmmg1aK2HSm913mGGqa0YId6Hefwy1A4xI08ufOvNNPu5FiJyDLYh3Y" \
  https://your-domain.vercel.app/api/cron/hard-delete-accounts
```

Expected response (when nothing is due):

```json
{ "processed": 0, "succeeded": 0, "failed": 0, "results": [] }
```

Wrong or missing secret should return:

```json
{ "error": "Forbidden." }
```

## When the cron actually runs

The schedule in `vercel.json` is:

```json
{ "path": "/api/cron/hard-delete-accounts", "schedule": "17 3 * * *" }
```

That's 03:17 UTC every day (~11:17 PM Eastern in EDT, ~10:17 PM in EST). The odd minute reduces the chance of clashing with everyone else's "0 * * * *" jobs.

## When to rotate

- Once a quarter (calendar reminder).
- Immediately if the secret is ever exposed (committed by accident, shared in chat, in a screenshot).
- Whenever someone leaves the team (not relevant yet, but it will be).

Rotation is just: generate a new value, update Vercel env vars, redeploy. Vercel cron will start using the new value on the next scheduled run.
