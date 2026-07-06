# Sentry setup (RN-6)

The code side is done and committed: `@sentry/nextjs` is installed, initialized in `instrumentation.ts` / `instrumentation-client.ts` / `sentry.{server,edge}.config.ts`, and every event passes through the PII scrubber in `lib/sentry-scrub.ts` (no request bodies, no cookies, no names/emails, user reduced to an opaque id, session replay disabled). **It is dormant — nothing is sent anywhere — until you set the DSN env vars.**

## Your 10 minutes

1. Create a free account at https://sentry.io (sign up with the business email, not personal).
2. Create a project: platform **Next.js**, name `resolution-nation`.
3. Copy the DSN it shows you (looks like `https://<key>@o<org>.ingest.us.sentry.io/<project>`). Choose the **US** data region during org creation — required for the sub-processor disclosure.
4. Add to Vercel env vars (Production + Preview):
   - `SENTRY_DSN` = the DSN
   - `NEXT_PUBLIC_SENTRY_DSN` = the same DSN
5. Redeploy. Trigger a test error and confirm it appears in Sentry with `[redacted]` where PII would be.

## What to check in the Sentry UI (once)

- Settings → Security & Privacy → enable **Data Scrubbing** and **Use Default Scrubbers** (server-side belt-and-suspenders on top of our client-side scrubbing).
- Settings → Teams/Members: MFA on your account.

## Deliberately off

- Performance tracing (`tracesSampleRate: 0`) — URLs/params could leak identifiers; errors are what we need.
- Session Replay (0%) — never record student sessions.
- Source-map upload — optional later; requires `SENTRY_AUTH_TOKEN` + wrapping `next.config.ts` with `withSentryConfig`. Not needed for error capture.
