# Vercel Setup — Import Repo, Add Env Vars, Confirm Cron

You have a Vercel account (team `klynch-creator's projects`) but no project yet. This is a one-time setup, ~10 minutes.

## Prerequisites

1. Run `bash scripts/setup-vercel.sh` from the project root to commit and push our changes to `klynch-creator/resolution-nation` on GitHub. The script previews the diff first and prompts before committing.

## Step 1 — Import the GitHub repo into Vercel

1. Open https://vercel.com/new in a browser where you're signed into Vercel.
2. Pick your team: **klynch-creator's projects**.
3. In the "Import Git Repository" section, find `klynch-creator/resolution-nation`. If it's not visible, click "Adjust GitHub App Permissions" and grant Vercel access to this repo.
4. Click **Import** next to it.
5. On the "Configure Project" screen:
   - **Framework Preset:** Vercel will auto-detect Next.js — leave it.
   - **Root Directory:** `./` (the default).
   - **Build & Output Settings:** leave default (Vercel picks the right Next.js commands).
   - **Environment Variables:** add the four you need before deploying — see Step 2 below.
6. Click **Deploy** at the bottom.

The first build will take 2–4 minutes. Vercel will assign a `*.vercel.app` URL.

## Step 2 — Environment variables

You need four env vars set in Vercel before (or during) the first deploy. You can paste them in the import screen's "Environment Variables" panel, or after the project exists at:

https://vercel.com/klynch-creators-projects/resolution-nation/settings/environment-variables

### Required for the app to work

| Name | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | from Supabase → Settings → API → "Project URL" | Public, safe to expose to the browser. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from Supabase → Settings → API → "anon public" key | Public, safe to expose to the browser. |
| `SUPABASE_SERVICE_ROLE_KEY` | from Supabase → Settings → API → "service_role" key | **SECRET.** Never commit, never expose. Used only by server routes. |
| `ANTHROPIC_API_KEY` | from https://console.anthropic.com/ → API Keys | **SECRET.** For AI goal generation in Phase 2. |

### Required for the nightly account-deletion worker

| Name | Value | Notes |
|---|---|---|
| `CRON_SECRET` | `CdFnCEJaSXmmg1aK2HSm913mGGqa0YId6Hefwy1A4xI08ufOvNNPu5FiJyDLYh3Y` | **SECRET.** Already generated. See [cron-secret-setup.md](./cron-secret-setup.md) for rotation. |

For each variable:
- Set it for **Production** (always).
- Also set for **Preview** if you want preview deployments to work end-to-end.
- Leave **Development** unset — local dev uses `.env.local`.

After saving env vars, redeploy. Either push another commit or click **Redeploy** on the latest deployment in the Vercel dashboard.

## Step 3 — Confirm the cron is scheduled

Cron jobs are picked up from `vercel.json` automatically. To verify:

1. https://vercel.com/klynch-creators-projects/resolution-nation/settings/cron-jobs
2. You should see one entry:
   - Path: `/api/cron/hard-delete-accounts`
   - Schedule: `17 3 * * *` (03:17 UTC daily)

If you don't see it, the deploy didn't pick up `vercel.json`. Check the deployment build log for parse errors.

> Note: On Vercel's Hobby plan, cron jobs run at most once per day, which is fine for our use case. On Pro and above they can run on any schedule. If you ever need more frequent runs (e.g., hourly), the Hobby limit is the gating factor.

## Step 4 — Manually trigger the cron to test

Once deployed with the env var set, in a terminal:

```bash
DOMAIN="resolution-nation-xxxx.vercel.app"   # whatever URL Vercel assigned
SECRET="CdFnCEJaSXmmg1aK2HSm913mGGqa0YId6Hefwy1A4xI08ufOvNNPu5FiJyDLYh3Y"

curl -H "Authorization: Bearer $SECRET" "https://$DOMAIN/api/cron/hard-delete-accounts"
```

Expected response (nothing due to delete):

```json
{"processed":0,"succeeded":0,"failed":0,"results":[]}
```

Wrong secret should return:

```json
{"error":"Forbidden."}
```

## Step 5 — Domain (optional, do later)

When you're closer to first pilot, point your domain `resolutionnation.app` at the Vercel project:

1. Vercel project → Settings → Domains → Add → `resolutionnation.app`.
2. Vercel will give you DNS records to add at your registrar.
3. Add the records, wait for Vercel to verify (usually minutes).
4. Update your Supabase Auth Site URL (https://supabase.com/dashboard/project/grlmcnoojbedxjoschsk/auth/url-configuration) to match the new domain so password reset and magic links redirect correctly.

Don't bother with this until your launch is closer — every change of Site URL invalidates outstanding magic links and reset tokens.

## What I (Claude) cannot do for you

The Vercel MCP exposes read-only project and deployment tools. It can't:

- Create projects (you have to import via the UI or `vercel deploy` from CLI).
- Set environment variables (no MCP endpoint for it).
- Trigger deploys directly (it's documented as informational only).

So this is a manual-but-quick UI session. After this, every git push to `main` auto-deploys, and you'll rarely touch the Vercel UI again.
